"""Synthetic reviews for training #6: the complaints, mixed reviews and Roman Urdu / Urdu the collected ones lack.

    python -m shevent_ml.reviews.synthetic                # 3,000 reviews -> data/processed/synthetic_reviews.parquet
    python -m shevent_ml.reviews.synthetic --n 5000 --seed 7

The collected reviews are real but 97% are 5 stars and 97% English, so a model trained on them alone would call every
review positive. These are built from hand-written fragments (configs/review_phrases.yaml): each fragment is one clause
about one aspect, so every review's labels are known exactly. A review joins one to three fragments, with "but" or
"lekin" where the tone turns, an optional opener and closer, and the messiness real reviews have (lower case, no full
stop, a dropped letter, an emoji).

Training data only: no synthetic review names a vendor or person, none is linked to a real vendor, and none is ever
shown in the apps. Models are scored on real, hand-labelled reviews only.
"""

import argparse
import copy
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd

from shevent_ml.config import PROCESSED_DIR, SEED, load_config
from shevent_ml.reviews.labels import NOT_MENTIONED, settings

OUTPUT = "synthetic_reviews.parquet"
LATIN = {"en", "roman_ur"}
# How many aspects a review talks about. About 40% of real reviews talk about none ("Nice place").
ASPECT_COUNTS = {0: 0.25, 1: 0.35, 2: 0.28, 3: 0.12}
# Share of reviews with aspects that also make a general remark (the place, decor, parking).
GENERAL_SHARE = 0.4


def _pick(rng, weights):
    keys = list(weights)
    p = np.array([weights[k] for k in keys], dtype=float)
    return keys[rng.choice(len(keys), p=p / p.sum())]


def _phrase(rng, options):
    return options[rng.integers(len(options))]


def _sign(label):
    return {"positive": 1, "negative": -1}.get(label, 0)


def _full_stop(text, language):
    text = text.strip()
    if not text or text[-1] in ".!?۔":
        return text
    return text + ("۔" if language == "ur" else ".")


def _capitalise(text):
    return text[:1].upper() + text[1:]


def _languages(rng, language, pieces):
    """The language of each piece: all the same, or for a mixed review English and Roman Urdu, at least one of each."""
    if language != "mixed":
        return [language] * pieces
    chosen = [_pick(rng, {"en": 0.5, "roman_ur": 0.5}) for _ in range(pieces)]
    if pieces > 1 and len(set(chosen)) == 1:
        chosen[rng.integers(pieces)] = "en" if chosen[0] == "roman_ur" else "roman_ur"
    return chosen


def _tone(labels):
    """The review's overall tone from the labels of its clauses."""
    signs = {_sign(label) for label in labels}
    if signs == {1}:
        return "positive"
    return "negative" if 1 not in signs and -1 in signs else "mixed"


def _rating(rng, labels):
    """Stars that fit the labels: a mixed review leans to 2 when complaints outnumber praise, to 4 when praise does."""
    balance = sum(_sign(label) for label in labels)
    tone = _tone(labels)
    if tone == "mixed":
        tone = "mostly_negative" if balance < 0 else "mostly_positive" if balance > 0 else "mixed"
    choices = {"positive": {5: 0.8, 4: 0.2}, "negative": {1: 0.7, 2: 0.3}, "mixed": {3: 1.0},
               "mostly_negative": {2: 0.6, 3: 0.4}, "mostly_positive": {4: 0.6, 3: 0.4}}  # fmt: skip
    return _pick(rng, choices[tone])


def typo(rng, text):
    """Drops one letter from one longer word, as quick typing does."""
    words = text.split(" ")
    long = [i for i, w in enumerate(words) if len(w) > 4 and w.isalpha()]
    if not long:
        return text
    i = long[rng.integers(len(long))]
    j = 1 + rng.integers(len(words[i]) - 2)
    words[i] = words[i][:j] + words[i][j + 1 :]
    return " ".join(words)


def make_review(rng, phrases, aspects):
    """One synthetic review: (text, language, category, labels)."""
    category = _pick(rng, {c: spec["weight"] for c, spec in phrases["categories"].items()})
    tone = _pick(rng, {t: spec["weight"] for t, spec in phrases["tones"].items()})
    allowed = [a for a in phrases["categories"][category]["aspects"] if a in aspects]
    count = min(_pick(rng, ASPECT_COUNTS), len(allowed))
    chosen = [allowed[i] for i in rng.choice(len(allowed), size=count, replace=False)]
    labels = {a: _pick(rng, phrases["tones"][tone]["labels"]) for a in chosen}
    clauses = [(labels[a], phrases["aspects"][a][labels[a]]) for a in chosen]
    # General remarks: the whole review when it has no aspect, otherwise sometimes one more clause, anywhere in it.
    if count == 0 or rng.random() < GENERAL_SHARE:
        for _ in range(1 + rng.integers(2) if count == 0 else 1):
            remark = tone if tone != "mixed" else _pick(rng, {"positive": 0.5, "negative": 0.5})
            clauses.insert(rng.integers(len(clauses) + 1), (remark, phrases["general"][remark]))

    language = _pick(rng, phrases["languages"])
    piece_languages = _languages(rng, language, len(clauses) + 2)  # opener, clauses, closer
    openers = phrases["openers"]
    opener = _phrase(rng, openers["any"][piece_languages[0]] + openers.get(category, {}).get(piece_languages[0], []))
    body, previous = [], None
    for (label, options), lang in zip(clauses, piece_languages[1:-1], strict=True):
        clause = _phrase(rng, options[lang])
        if previous is not None:
            turn = _sign(label) * _sign(previous) < 0
            joining = "contrast" if turn else "and"
            if turn or rng.random() < 0.5:
                connector = _phrase(rng, phrases["connectors"][joining][lang])
                if connector.endswith(","):  # "however," opens a new sentence
                    body[-1] = _full_stop(body[-1], piece_languages[len(body)])
                    connector = _capitalise(connector)
                clause = f"{connector} {clause}"
            else:  # a new sentence instead of "and"
                body[-1] = _full_stop(body[-1], piece_languages[len(body)])
                clause = _capitalise(clause) if lang in LATIN else clause
        body.append(clause)
        previous = label
    overall = _tone([label for label, _ in clauses])
    closer = _phrase(rng, phrases["closers"][overall][piece_languages[-1]])

    sentence = " ".join(body)
    sentence = _full_stop(_capitalise(sentence) if piece_languages[1] in LATIN else sentence, piece_languages[-2])
    text = " ".join(part for part in [opener, sentence, closer] if part)
    used = set(piece_languages[1:-1])
    if opener:
        used.add(piece_languages[0])
    if closer:
        used.add(piece_languages[-1])
    review_language = "mixed" if len(used) > 1 else used.pop()

    noise = phrases["noise"]
    latin = review_language != "ur"
    if latin and rng.random() < noise["typo"]:
        text = typo(rng, text)
    if latin and rng.random() < noise["lowercase"]:
        text = text.lower()
    if rng.random() < noise["no_punctuation"]:
        text = text.rstrip(".!۔")
    if rng.random() < noise["emoji"] and overall != "mixed":
        text = f"{text} {_phrase(rng, phrases['emoji'][overall])}"
    return text, review_language, category, labels, _rating(rng, [label for label, _ in clauses])


def generate(n, seed=SEED, phrases=None, config=None):
    """n reviews, one row each: id, category, language, rating, text and one label column per aspect."""
    phrases = phrases or load_config("review_phrases")
    aspects = list((config or settings())["aspects"])
    rng = np.random.default_rng(seed)
    rows, seen = [], set()
    # Short fragments repeat; draw until there are n different texts (or give up after 20n tries).
    for _ in range(20 * n):
        if len(rows) == n:
            break
        text, language, category, labels, rating = make_review(rng, phrases, aspects)
        if text.lower() in seen:
            continue
        seen.add(text.lower())
        rows.append({"category": category, "language": language, "rating": rating, "text": text,
                     **{a: labels.get(a, NOT_MENTIONED) for a in aspects}})  # fmt: skip
    df = pd.DataFrame(rows)
    df.insert(0, "review_id", [f"SYN-R-{i:05}" for i in range(1, len(df) + 1)])
    df["synthetic"] = True
    return df


def split_fragments(phrases, share, seed=SEED):
    """Two phrase sets whose aspect fragments differ: about `share` of each list goes to the second, so reviews built
    from it use phrasings a model trained on the first has never seen. Lists of one or two fragments go to both."""
    rng = np.random.default_rng(seed)
    first, second = copy.deepcopy(phrases), copy.deepcopy(phrases)
    for aspect, by_label in phrases["aspects"].items():
        for label, by_language in by_label.items():
            for language, options in by_language.items():
                if len(options) < 3:
                    continue
                order = rng.permutation(len(options))
                cut = max(1, round(len(options) * share))
                second["aspects"][aspect][label][language] = [options[i] for i in order[:cut]]
                first["aspects"][aspect][label][language] = [options[i] for i in order[cut:]]
    return first, second


def phrases_hash(phrases):
    return hashlib.sha256(json.dumps(phrases, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]


def write(n, out_dir=PROCESSED_DIR, seed=SEED):
    phrases = load_config("review_phrases")
    df = generate(n, seed, phrases)
    out_dir.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_dir / OUTPUT, index=False)
    aspects = list(settings()["aspects"])
    manifest = {
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "n": len(df),
        "seed": seed,
        "phrases_hash": phrases_hash(phrases),
        "languages": df["language"].value_counts().to_dict(),
        "ratings": {int(k): v for k, v in df["rating"].value_counts().sort_index().items()},
        "labels": {a: df[a].value_counts().to_dict() for a in aspects},
    }
    (out_dir / "synthetic_reviews_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return df, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--n", type=int, default=3000, help="number of reviews")
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--out", type=Path, default=PROCESSED_DIR)
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    df, manifest = write(args.n, args.out, args.seed)
    print(f"{len(df)} synthetic reviews ({manifest['phrases_hash']}) written to {args.out / OUTPUT}")
    print(f"  languages: {manifest['languages']}")
    print(f"  ratings:   {manifest['ratings']}")
    for aspect, counts in manifest["labels"].items():
        print(f"  {aspect:<20} {counts}")
    for _, row in df.sample(8, random_state=args.seed).iterrows():
        print(f"  [{row['language']}, {row['rating']}*] {row['text']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
