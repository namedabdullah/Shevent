"""#6 Review Insights: which aspects a review talks about, and whether it praises or criticises each.

    python -m shevent_ml.reviews.model            # train, score, save to ml/artifacts/review_insights/
    python -m shevent_ml.reviews.model --sheet    # write the labelling sheet for the real reviews

Reviews are read clause by clause, the way hosts write them ("the food was great but the staff was rude"): a review is
split at full stops and at joining words (but / lekin / magar / aur / لیکن ...). For each clause one classifier picks
the aspect it's about (or none), and another whether it praises or complains. An aspect praised in one clause and
criticised in another is mixed. Pooling every aspect's clauses lets the praise-or-complaint classifier learn general
words (nahi, bura, late, excellent) instead of one aspect's phrasings.

Both classifiers are logistic regressions on TF-IDF over words (1-2 grams) and character 2-5 grams inside words. The
character n-grams cope with Roman Urdu's loose spelling (bohat / bohot / bht) and with Urdu script, without a tokenizer
or a model download.

Training data: the hand-written fragments behind the synthetic reviews (configs/review_phrases.yaml), each one clause
with a known aspect and tone, plus hand-labelled real reviews outside the test set that mention a single aspect. Scores
that count are on the real test reviews (data/splits/review_test_ids.csv) once they're labelled in
data/splits/review_labels.csv, next to the English-only keyword baseline. Until then the report shows a synthetic check:
reviews built from a fifth of the fragments, kept out of training, so it measures phrasings the model hasn't seen, but
still only synthetic ones.

The labelling sheet (--sheet) lists the real reviews, test set first, with one column per aspect. Fill each with
positive, negative or mixed (blank = not mentioned) and save it as data/splits/review_labels.csv.
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import cohen_kappa_score, f1_score

from shevent_ml.config import PROCESSED_DIR, REPO_ROOT, SEED, SPLITS_DIR, load_config
from shevent_ml.reviews.draft import load_or_choose_test_set
from shevent_ml.reviews.labels import NOT_MENTIONED, settings
from shevent_ml.reviews.synthetic import generate, phrases_hash, split_fragments, typo

ARTIFACT_DIR = REPO_ROOT / "ml" / "artifacts" / "review_insights"
LABELS_FILE = SPLITS_DIR / "review_labels.csv"
SHEET_FILE = PROCESSED_DIR / "reviews_to_label.csv"
# A second person labels the test set blind, for an independent score and the labellers' agreement.
SECOND_SHEET_FILE = PROCESSED_DIR / "reviews_to_label_second.csv"
SECOND_LABELS_FILE = SPLITS_DIR / "review_labels_second.csv"
LABELS = ["positive", "negative", "mixed", NOT_MENTIONED]
NO_ASPECT = "none"
JOINING_WORDS = ["but", "however", "though", "and", "also", "plus", "lekin", "magar", "aur", "or", "لیکن", "مگر",
                 "البتہ", "اور", "نیز"]  # fmt: skip
CLAUSE_BREAK = re.compile(r"[.!?۔\n،]+|\b(?:" + "|".join(JOINING_WORDS) + r")\b", re.IGNORECASE)


def normalise(text):
    """Lower case, and letters repeated for emphasis cut to two ('bohattt' -> 'bohatt'), so spellings meet."""
    return re.sub(r"(.)\1{2,}", r"\1\1", str(text).lower())


def clauses(text):
    """'Food was great but the staff was rude.' -> ['Food was great', 'the staff was rude']"""
    parts = [p.strip(" ,;:-") for p in CLAUSE_BREAK.split(str(text))]
    return [p for p in parts if len(p) > 1] or [str(text)]


class EnglishBaseline:
    """English keywords decide the aspects; English sentiment words in the whole review decide the label."""

    def __init__(self, config=None):
        spec = (config or settings())["baseline"]
        self.keywords = {a: re.compile(r"\b(" + "|".join(map(re.escape, words)) + r")\b") for a, words in
                         spec["keywords"].items()}  # fmt: skip
        self.positive = re.compile(r"\b(" + "|".join(map(re.escape, spec["positive"])) + r")\b")
        self.negative = re.compile(r"\b(" + "|".join(map(re.escape, spec["negative"])) + r")\b")

    def predict(self, texts):
        rows = []
        for text in map(normalise, texts):
            pos, neg = len(self.positive.findall(text)), len(self.negative.findall(text))
            tone = "mixed" if pos and neg else "negative" if neg else "positive"
            rows.append({a: tone if pattern.search(text) else NOT_MENTIONED for a, pattern in self.keywords.items()})
        return pd.DataFrame(rows)


def clause_examples(phrases, rng):
    """Training clauses from the fragments: (text, aspect, polarity). General remarks, openers and closers are about no
    aspect; a mixed fragment's parts teach the aspect but not the tone. Each clause also appears with a dropped
    letter."""
    rows = []
    for aspect, by_label in phrases["aspects"].items():
        for label, by_language in by_label.items():
            for options in by_language.values():
                rows += [(part, aspect, None if label == "mixed" else label) for f in options for part in clauses(f)]
    for tone, by_language in phrases["general"].items():
        for options in by_language.values():
            rows += [(part, NO_ASPECT, tone) for f in options for part in clauses(f)]
    for options in phrases["openers"]["any"].values():
        rows += [(part, NO_ASPECT, None) for f in options if f for part in clauses(f)]
    for tone, by_language in phrases["closers"].items():
        for options in by_language.values():
            rows += [(part, NO_ASPECT, None if tone == "mixed" else tone) for f in options if f for part in clauses(f)]
    rows += [(typo(rng, text), aspect, polarity) for text, aspect, polarity in rows]
    return pd.DataFrame(rows, columns=["text", "aspect", "polarity"]).assign(weight=1.0)


def real_examples(reviews, aspects, weight):
    """Hand-labelled real reviews as whole-review training clauses: those that praise or criticise a single aspect, and
    those about no aspect at all ("Nice place"), which teach that a clause can be about none."""
    labels = reviews[aspects]
    mentioned = labels != NOT_MENTIONED
    single = reviews[(mentioned.sum(axis=1) == 1) & labels.isin(["positive", "negative", NOT_MENTIONED]).all(axis=1)]
    rows = [(r["text"], a, r[a]) for _, r in single.iterrows() for a in aspects if r[a] != NOT_MENTIONED]
    rows += [(text, NO_ASPECT, None) for text in reviews.loc[mentioned.sum(axis=1) == 0, "text"]]
    return pd.DataFrame(rows, columns=["text", "aspect", "polarity"]).assign(weight=weight)


class ReviewModel:
    def __init__(self, config=None):
        self.config = config or settings()
        self.aspects = list(self.config["aspects"])
        spec = self.config["model"]
        self.words = TfidfVectorizer(
            preprocessor=normalise, ngram_range=tuple(spec["word_ngrams"]), min_df=spec["min_df"], sublinear_tf=True
        )
        self.chars = TfidfVectorizer(
            preprocessor=normalise, analyzer="char_wb", ngram_range=tuple(spec["char_ngrams"]), min_df=spec["min_df"],
            sublinear_tf=True,
        )  # fmt: skip
        lexicon = self.config["lexicon"]
        self.lexicon = [
            re.compile(r"\b(?:" + "|".join(re.escape(w) for words in lexicon[tone].values() for w in words) + r")\b")
            for tone in ("positive", "negative")
        ]
        self.aspect_clf = None
        self.polarity_clf = None
        self.version = None

    def _features(self, texts):
        return hstack([self.words.transform(texts), self.chars.transform(texts)]).tocsr()

    def _tone_features(self, texts):
        """The text features plus how many praise and complaint words each clause has (configs/reviews.yaml)."""
        counts = [[len(p.findall(normalise(t))) for p in self.lexicon] for t in texts]
        return hstack([self._features(texts), csr_matrix(np.array(counts, dtype=float))]).tocsr()

    def fit(self, examples):
        """examples: one row per clause with text, aspect (or 'none'), polarity (positive / negative / None), weight."""
        texts = examples["text"].tolist()
        self.words.fit(texts)
        self.chars.fit(texts)
        X = self._features(texts)
        weights = examples["weight"].to_numpy(dtype=float)
        C = self.config["model"]["C"]
        self.aspect_clf = LogisticRegression(C=C, max_iter=3000, class_weight="balanced")
        self.aspect_clf.fit(X, examples["aspect"].to_numpy(), sample_weight=weights)
        toned = examples["polarity"].notna().to_numpy()
        self.polarity_clf = LogisticRegression(C=C, max_iter=3000, class_weight="balanced")
        X_tone = self._tone_features(examples.loc[toned, "text"].tolist())
        self.polarity_clf.fit(X_tone, examples.loc[toned, "polarity"].to_numpy(), sample_weight=weights[toned])
        return self

    def predict(self, texts):
        """One label per aspect for each review."""
        texts = list(texts)
        parts = [clauses(t) for t in texts]
        flat = [c for p in parts for c in p]
        X = self._features(flat)
        # A clause is about an aspect only when the classifier is reasonably sure; otherwise it's about none.
        probabilities = self.aspect_clf.predict_proba(X)
        best = probabilities.argmax(axis=1)
        aspect = np.where(
            probabilities[np.arange(len(flat)), best] >= self.config["model"]["confident_aspect"],
            self.aspect_clf.classes_[best],
            NO_ASPECT,
        )
        tone = self.polarity_clf.predict_proba(self._tone_features(flat))
        positive = tone[:, list(self.polarity_clf.classes_).index("positive")]
        confident = self.config["model"]["confident_tone"]
        rows, i = [], 0
        for p in parts:
            votes = {}
            for _ in p:
                if aspect[i] != NO_ASPECT:
                    votes.setdefault(aspect[i], []).append(positive[i])
                i += 1
            row = dict.fromkeys(self.aspects, NOT_MENTIONED)
            for a, probs in votes.items():
                praise = any(q >= confident for q in probs)
                complaint = any(q <= 1 - confident for q in probs)
                if praise and complaint:
                    row[a] = "mixed"
                elif praise or complaint:
                    row[a] = "positive" if praise else "negative"
                else:
                    row[a] = "positive" if np.mean(probs) >= 0.5 else "negative"
            rows.append(row)
        return pd.DataFrame(rows, columns=self.aspects)

    def save(self, out_dir, report):
        out_dir.mkdir(parents=True, exist_ok=True)
        parts = {"words": self.words, "chars": self.chars, "aspect": self.aspect_clf, "polarity": self.polarity_clf}
        joblib.dump(parts, out_dir / "model.joblib")
        meta = {"version": self.version, "aspects": self.aspects, "report": report}
        (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, out_dir=ARTIFACT_DIR, config=None):
        model = cls(config)
        parts = joblib.load(out_dir / "model.joblib")
        model.words, model.chars = parts["words"], parts["chars"]
        model.aspect_clf, model.polarity_clf = parts["aspect"], parts["polarity"]
        model.version = json.loads((out_dir / "meta.json").read_text(encoding="utf-8"))["version"]
        return model


def score(predicted, actual, aspects):
    """Macro-F1 over the four labels for each aspect, and their mean."""
    per_aspect = {
        a: float(f1_score(actual[a], predicted[a], labels=LABELS, average="macro", zero_division=0)) for a in aspects
    }
    mentioned = (actual[aspects] != NOT_MENTIONED).to_numpy()
    agree = (predicted[aspects].to_numpy() == actual[aspects].to_numpy())[mentioned]
    return {
        "rows": len(actual),
        "macro_f1": float(np.mean(list(per_aspect.values()))),
        "macro_f1_by_aspect": per_aspect,
        "label_accuracy_where_mentioned": float(agree.mean()) if agree.size else None,
    }


def read_labels(path=LABELS_FILE, aspects=None):
    """The hand labels: review_id plus one column per aspect, blank meaning not mentioned."""
    if not path.exists():
        return None
    labels = pd.read_csv(path, dtype=str, keep_default_na=False)
    aspects = aspects or list(settings()["aspects"])
    for a in aspects:
        values = labels[a].str.strip().str.lower().replace("", NOT_MENTIONED)
        unknown = sorted(set(values) - set(LABELS))
        if unknown:
            raise ValueError(f"{path.name}: {a} has values {unknown}; use positive, negative, mixed or leave blank")
        labels[a] = values
    return labels[["review_id", *aspects]]


def write_sheet(reviews, test_ids, aspects, path=SHEET_FILE):
    """The real reviews to label, test set first, with blank aspect columns."""
    sheet = reviews.assign(test=reviews["review_id"].isin(test_ids).map({True: "yes", False: "no"}))
    sheet = sheet.sort_values(["test", "review_id"], ascending=[False, True])
    sheet = sheet[["review_id", "test", "language", "rating", "text"]].assign(**dict.fromkeys(aspects, ""))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.to_csv(path, index=False, encoding="utf-8-sig")  # utf-8-sig: Excel and Google Sheets read the Urdu
    return sheet


def train(processed_dir=PROCESSED_DIR, labels_path=LABELS_FILE, config=None, log=print):
    config = config or settings()
    aspects = list(config["aspects"])
    spec = config["model"]
    # The synthetic check uses fragments the model never trains on, so it measures new phrasings, not memory.
    phrases = load_config("review_phrases")
    fit_phrases, check_phrases = split_fragments(phrases, spec["synthetic_holdout"])
    examples = [clause_examples(fit_phrases, np.random.default_rng(SEED))]
    check = generate(spec["synthetic_check_reviews"], SEED + 1, check_phrases, config)

    report, test = {}, None
    real = read_labels(labels_path, aspects)
    if real is not None:
        reviews = pd.read_parquet(processed_dir / "reviews.parquet")
        test_ids = load_or_choose_test_set(reviews, config)
        real = real.merge(reviews[["review_id", "text"]], on="review_id")
        test = real[real["review_id"].isin(test_ids)]
        fit = real[~real["review_id"].isin(test_ids)]
        examples.append(real_examples(fit, aspects, spec["real_weight"]))
        report["real_training_reviews"] = len(fit)
    else:
        log("  no hand labels yet (data/splits/review_labels.csv): training on the synthetic fragments only")

    model = ReviewModel(config).fit(pd.concat(examples, ignore_index=True))
    report["synthetic_check"] = score(model.predict(check["text"]), check, aspects)
    report["synthetic_check_baseline"] = score(EnglishBaseline(config).predict(check["text"]), check, aspects)
    if test is not None and len(test):
        test = test.reset_index(drop=True)
        report["real_test"] = score(model.predict(test["text"]), test, aspects)
        report["real_test_baseline"] = score(EnglishBaseline(config).predict(test["text"]), test, aspects)

    hand_labels = hashlib.sha256(labels_path.read_bytes()).hexdigest() if labels_path.exists() else None
    parts = {
        "model": spec,
        "lexicon": config["lexicon"],
        "phrases": phrases_hash(phrases),
        "seed": SEED,
        "labels": hand_labels,
    }
    model.version = "reviews-v1-" + hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest()[:8]
    return model, report


def print_report(report):
    print(f"  {'':<26} {'rows':>5} {'macro-F1':>9} {'label right when mentioned':>27}")
    for name in ["real_test", "real_test_baseline", "synthetic_check", "synthetic_check_baseline"]:
        if name in report:
            r = report[name]
            accuracy = r["label_accuracy_where_mentioned"]
            right = "n/a" if accuracy is None else f"{accuracy:.0%}"
            print(f"  {name:<26} {r['rows']:>5} {r['macro_f1']:>9.3f} {right:>27}")
    if "real_test" not in report:
        print("  No real test labels yet: the synthetic check uses unseen fragments, but they're still synthetic.")


def second_labeller(model, config=None, labels_path=SECOND_LABELS_FILE, first_path=LABELS_FILE):
    """The test set scored on a second person's labels (an independent score), and how often the two labellers agree:
    Cohen's kappa per aspect (1 = always, 0 = no better than chance) and the share of identical labels."""
    config = config or settings()
    aspects = list(config["aspects"])
    reviews = pd.read_parquet(PROCESSED_DIR / "reviews.parquet")
    test_ids = load_or_choose_test_set(reviews, config)
    second = read_labels(labels_path, aspects)
    second = second[second["review_id"].isin(test_ids)].merge(reviews[["review_id", "text"]], on="review_id")
    second = second.reset_index(drop=True)
    report = {
        "rows": len(second),
        "model": score(model.predict(second["text"]), second, aspects),
        "baseline": score(EnglishBaseline(config).predict(second["text"]), second, aspects),
    }
    first = read_labels(first_path, aspects)
    if first is not None:
        both = second[["review_id", *aspects]].merge(first, on="review_id", suffixes=("_second", "_first"))
        kappas = {}
        for a in aspects:
            kappa = cohen_kappa_score(both[f"{a}_first"], both[f"{a}_second"], labels=LABELS)
            kappas[a] = None if np.isnan(kappa) else round(float(kappa), 3)
        same = np.mean([(both[f"{a}_first"] == both[f"{a}_second"]).mean() for a in aspects])
        report["agreement"] = {"rows": len(both), "kappa_by_aspect": kappas, "identical_labels": round(float(same), 3)}
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sheet", action="store_true", help="write the labelling sheet for the real reviews")
    parser.add_argument("--second-sheet", action="store_true", help="a blank test-set sheet for a second labeller")
    parser.add_argument("--second", action="store_true", help="score the saved model on the second labeller's labels")
    parser.add_argument("--out", type=Path, default=ARTIFACT_DIR)
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    config = settings()
    if args.second_sheet:
        reviews = pd.read_parquet(PROCESSED_DIR / "reviews.parquet")
        test_ids = load_or_choose_test_set(reviews, config)
        sheet = write_sheet(reviews[reviews["review_id"].isin(test_ids)], test_ids, list(config["aspects"]),
                            SECOND_SHEET_FILE)  # fmt: skip
        print(f"{len(sheet)} test reviews, unlabelled, written to {SECOND_SHEET_FILE}")
        print(f"Fill the aspect columns without looking at {LABELS_FILE}, and save as {SECOND_LABELS_FILE}")
        return 0
    if args.second:
        report = second_labeller(ReviewModel.load(args.out, config), config)
        (args.out / "second_labeller.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"On {report['rows']} test reviews labelled by a second person:")
        print_report({"real_test": report["model"], "real_test_baseline": report["baseline"]})
        if "agreement" in report:
            agreement = report["agreement"]
            print(f"  Labellers agree on {agreement['identical_labels']:.0%} of labels; kappa by aspect:")
            print(f"  {agreement['kappa_by_aspect']}")
        return 0
    if args.sheet:
        reviews = pd.read_parquet(PROCESSED_DIR / "reviews.parquet")
        test_ids = load_or_choose_test_set(reviews, config)
        sheet = write_sheet(reviews, test_ids, list(config["aspects"]))
        print(f"{len(sheet)} reviews ({len(test_ids)} in the test set, listed first) written to {SHEET_FILE}")
        print(f"Fill the aspect columns and save the sheet as {LABELS_FILE}")
        return 0
    model, report = train(config=config)
    model.save(args.out, report)
    print(f"Review model {model.version} saved to {args.out}")
    print_report(report)
    return 0


if __name__ == "__main__":
    # Through the package name, so the saved model refers to shevent_ml.reviews.model.normalise, not __main__'s.
    from shevent_ml.reviews.model import main as package_main

    sys.exit(package_main())
