"""#5 Quote Fairness Checker: how a vendor's quote compares with #2's range, and what to ask the vendor about.

    python -m shevent_ml.models.quote_checker            # score on the data lead's labels, next to the baselines
    python -m shevent_ml.models.quote_checker --sheet    # write the labelling sheet for the scenario quotes
    python -m shevent_ml.models.quote_checker --demo     # check a few example quotes

Price: #2's calibrated range for the same event, converted into the quote's unit. Inside or below the range is green,
up to 25% above its top yellow, beyond that red (configs/quote_checker.yaml). Checklist: the quote's inclusions,
exclusions and notes are read for the items each category often charges extra for (data/reference/
quote_checklist.csv). Items the quote doesn't mention become "ask about"; items it says cost extra, "charged extra".
The apps word the result as guidance, never as an accusation (packages/core/labels).

Needs a saved #2 model (python -m shevent_ml.models.price_estimator).
"""

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from shevent_ml.config import PROCESSED_DIR, REFERENCE_DIR, SPLITS_DIR, load_config
from shevent_ml.data.split import is_test, load_split
from shevent_ml.eval.baselines import MedianPriceLookup
from shevent_ml.eval.metrics import quadratic_weighted_kappa, set_precision_recall
from shevent_ml.features.vendors import TIER_RANK
from shevent_ml.models.price_estimator import PriceEstimator
from shevent_ml.models.price_features import DEFAULT_BASIS, PRICE_BASES, plan_rows, quote_rows, synthetic_rows
from shevent_ml.synthetic.generate import generate

LEVELS = ["green", "yellow", "red"]
CHECKLIST_FILE = REFERENCE_DIR / "quote_checklist.csv"
LABELS_FILE = SPLITS_DIR / "quote_labels.csv"
SHEET_FILE = PROCESSED_DIR / "quotes_to_label.csv"


def load_checklist(path=CHECKLIST_FILE):
    """{category: [{item, label, keywords, needs_number}]}, in the file's order."""
    table = pd.read_csv(path, dtype=str)
    return {
        category: [
            {
                "item": r.item,
                "label": r.label,
                "keywords": r.keywords.split("|"),
                "needs_number": r.needs_number == "yes",
            }
            for r in rows.itertuples()
        ]
        for category, rows in table.groupby("category", sort=False)
    }


def _phrases(words, prefix=False):
    """Matches any of the phrases as whole words. prefix lets the end run on, so 'tax' also matches 'taxes'."""
    alternatives = "|".join(re.escape(w.lower()) for w in sorted(words, key=len, reverse=True))
    return re.compile(rf"(?<![a-z])(?:{alternatives})" + ("" if prefix else "(?![a-z])"))


def clauses(text):
    """Lower-case clauses of a quote's text, so a cue in one ("fuel extra") doesn't spill into the next.

    A comma or full stop inside a number ("Rs 10,000", "2.5 lakh") doesn't end a clause.
    """
    return [c.strip() for c in re.split(r"[;\n|]|[.,](?!\d)|\bbut\b", str(text).lower()) if c.strip()]


class ChecklistReader:
    """Reads a quote's text for the category's checklist items: included, charged extra or not mentioned."""

    def __init__(self, settings, checklist=None):
        self.checklist = checklist or load_checklist()
        self.patterns = {
            category: [_phrases(item["keywords"], prefix=True) for item in items]
            for category, items in self.checklist.items()
        }
        self.cues = {name: _phrases(words) for name, words in settings["cues"].items()}
        self.number = re.compile(r"\d|" + _phrases(settings["number_words"]).pattern)

    def _status(self, item, pattern, included, excluded):
        if any(pattern.search(c) for c in excluded):
            return "extra"
        status = "not_mentioned"
        for clause in included:
            if not pattern.search(clause) or (item["needs_number"] and not self.number.search(clause)):
                continue
            rest = pattern.sub(" ", clause)  # the item's own words ("extra hour") are not a cue
            if self.cues["excluded"].search(rest):
                return "extra"
            if not self.cues["included"].search(rest) and self.cues["extra"].search(rest):
                return "extra"
            status = "included"
        return status

    def read(self, category, inclusions=(), exclusions=(), notes=None):
        """{"status": {item: included | extra | not_mentioned}, "ask_about": [labels], "charged_extra": [labels]}.

        charged_extra ends with the quote's other exclusions, as written, so nothing it says costs extra is lost.
        """
        included = [c for text in [*inclusions, notes or ""] for c in clauses(text)]
        excluded = [c for text in exclusions for c in clauses(text)]
        items, patterns = self.checklist.get(category, []), self.patterns.get(category, [])
        status = {i["item"]: self._status(i, p, included, excluded) for i, p in zip(items, patterns, strict=True)}
        others = [
            text.strip() for text in exclusions if text.strip() and not any(p.search(text.lower()) for p in patterns)
        ]
        return {
            "status": status,
            "ask_about": [i["label"] for i in items if status[i["item"]] == "not_mentioned"],
            "charged_extra": [i["label"] for i in items if status[i["item"]] == "extra"] + others,
        }


def levels(quoted, low, high, yellow_up_to):
    """(level, fraction above high, fraction below low) per quote. Without a range (NaN) the level is None."""
    quoted, low, high = (np.asarray(v, dtype=float) for v in (quoted, low, high))
    above = quoted / high - 1
    level = np.where(above <= 0, "green", np.where(above <= yellow_up_to, "yellow", "red")).astype(object)
    level[np.isnan(above)] = None
    return level, np.where(above > 0, above, np.nan), np.where(quoted < low, 1 - quoted / low, np.nan)


def nice(pkr):
    """Three significant figures, as a whole number: 1,847 -> 1,850; 675,432 -> 675,000."""
    return int(float(f"{pkr:.3g}"))


def _percent(fraction):
    return None if np.isnan(fraction) else round(100 * float(fraction))


class QuoteChecker:
    def __init__(self, price_estimator, settings=None, checklist=None):
        self.settings = settings or load_config("quote_checker")
        self.price_estimator = price_estimator
        self.reader = ChecklistReader(self.settings, checklist)

    @property
    def version(self):
        return f"quote-v1/{self.price_estimator.version}"

    def booking_ranges(self, X, guests):
        """#2's low / mid / high for the whole booking.

        The model is asked on each category's default basis (the one its training data covers best), whatever basis
        the rows had, so a flat catering quote is compared with per-head prices times guests.
        """
        X = X.copy()
        X["price_basis"] = pd.Categorical(X["category"].astype(str).map(DEFAULT_BASIS), categories=PRICE_BASES)
        prices = self.price_estimator.predict(X)
        return prices.mul(np.where(X["price_basis"] == "per_head", guests, 1.0), axis=0)

    def check(self, request):
        """The POST /v1/quote-check request (packages/core/schemas/quote-check.ts) -> its response.

        With the vendor's price tier (from its listing), the quote is compared with vendors of that tier: across all
        tiers the range is several times wide and hardly anything stands out.
        """
        plan, category, unit = request["plan"], request["category"], request["unit"]
        tier = request.get("vendor_tier") if request.get("vendor_tier") in TIER_RANK else None
        X = plan_rows(plan, tier)
        booking = self.booking_ranges(X[X["category"] == category], plan["guest_count"]).iloc[0]
        if unit == "per_head":
            per_unit = plan["guest_count"]
        elif unit == "per_hour":
            per_unit = request.get("hours") or self.settings["default_hours"][category]
        else:
            per_unit = 1
        low, high = nice(booking["low"] / per_unit), nice(booking["high"] / per_unit)
        level, above, below = levels([request["quoted_pkr"]], [low], [high], self.settings["yellow_up_to"])
        read = self.reader.read(
            category, request.get("inclusions") or [], request.get("exclusions") or [], request.get("notes")
        )
        return {
            "level": level[0],
            "typical_range": [low, high],
            "unit": unit,
            "percent_above_high": _percent(above[0]),
            "percent_below_low": _percent(below[0]),
            "ask_about": read["ask_about"],
            "charged_extra": read["charged_extra"],
            "compared_with": "same_tier" if tier else "all_vendors",
            "model_version": self.version,
        }

    def quote_ranges(self, quotes, tiers=None):
        """#2's range for each scenario quote (data/processed/quotes.parquet), on the quote's own price basis.

        tiers: each quote's vendor tier (budget / mid / premium), or None to compare with all vendors.
        """
        X, _ = quote_rows(quotes)
        if tiers is not None:
            X["tier_rank"] = pd.Series(tiers, index=X.index).map(TIER_RANK).astype(float)
        guests = pd.to_numeric(quotes["guests"], errors="coerce").to_numpy(dtype=float)
        ranges = self.booking_ranges(X, guests)
        return ranges.div(np.where(quotes["price_basis"] == "per_head", guests, 1.0), axis=0)


def _items(cell):
    return [x.strip() for x in str(cell).split("|") if x.strip()] if pd.notna(cell) else []


def load_labels(path=LABELS_FILE, checklist=None):
    """The data lead's labels: quote_id, level (green / yellow / red), not_included (checklist item ids, '|')."""
    labels = pd.read_csv(path, dtype=str).dropna(subset=["quote_id", "level"])
    labels["level"] = labels["level"].str.strip().str.lower()
    bad = labels.loc[~labels["level"].isin(LEVELS), "quote_id"].tolist()
    if bad:
        raise ValueError(f"{path.name}: level must be one of {LEVELS} (quotes {bad})")
    known = {i["item"] for items in (checklist or load_checklist()).values() for i in items}
    # A blank not_included means the quote covers every checklist item.
    if "not_included" not in labels:
        labels["not_included"] = ""
    labels["not_included"] = labels["not_included"].map(_items)
    unknown = sorted({i for items in labels["not_included"] for i in items} - known)
    if unknown:
        raise ValueError(f"{path.name}: unknown checklist items {unknown} (see {CHECKLIST_FILE.name})")
    return labels


def score_levels(true, predicted):
    """Agreement with the labels. A quote without a verdict (no range) counts as a disagreement."""
    true, predicted = pd.Series(true).reset_index(drop=True), pd.Series(predicted).reset_index(drop=True)
    has = predicted.notna()
    code = {level: i for i, level in enumerate(LEVELS)}
    return {
        "quotes": int(len(true)),
        "with_verdict": int(has.sum()),
        "accuracy": float((true == predicted).mean()) if len(true) else float("nan"),
        "kappa": quadratic_weighted_kappa(true[has].map(code), predicted[has].map(code), len(LEVELS)),
    }


def evaluate(checker, quotes, labels, train_prices, vendors=None):
    """#5 against the data lead's labels, next to the same rule on the median-lookup range and 'always green';
    the checklist next to 'ask about every item'. With vendors (vendors.parquet), quotes are compared within their
    vendor's tier, as in the app."""
    rows = quotes.merge(labels[["quote_id", "level", "not_included"]], on="quote_id", how="inner")
    cut = checker.settings["yellow_up_to"]
    tiers = rows["vendor_id"].map(vendors.set_index("vendor_id")["price_tier"]) if vendors is not None else None
    ours = checker.quote_ranges(rows, tiers)
    lookup = MedianPriceLookup(**load_config("baselines")["median_lookup"]).fit(train_prices).predict(rows)
    report = {
        "levels": {
            "checker": score_levels(rows["level"], levels(rows["price_pkr_adj"], ours["low"], ours["high"], cut)[0]),
            "median_lookup": score_levels(
                rows["level"], levels(rows["price_pkr_adj"], lookup["low"], lookup["high"], cut)[0]
            ),
            "always_green": score_levels(rows["level"], ["green"] * len(rows)),
        }
    }
    flagged, everything = [], []
    for row in rows.itertuples():
        status = checker.reader.read(row.category, _items(row.inclusions), _items(row.exclusions))["status"]
        flagged.append([item for item, s in status.items() if s != "included"])
        everything.append(list(status))
    report["checklist"] = {
        "checker": set_precision_recall(rows["not_included"], flagged),
        "ask_about_everything": set_precision_recall(rows["not_included"], everything),
    }
    return report


def planted_check(checker, processed_dir=PROCESSED_DIR):
    """Share of each level when typical synthetic prices are marked up (configs/quote_checker.yaml: planted), with
    the vendor's tier known ("same_tier") and not ("all_vendors").

    The events are new draws from the generator #2 was trained on (same base prices and settings, another seed).
    """
    planted = checker.settings["planted"]
    manifest = json.loads((processed_dir / "synthetic_manifest.json").read_text(encoding="utf-8"))
    events, services = generate(planted["events"], manifest["settings"], planted["seed"], manifest["base_prices"])
    out = {}
    for name, dropout in [("same_tier", 0.0), ("all_vendors", 1.0)]:
        X, price, _ = synthetic_rows(events, services, tier_dropout=dropout)
        guests = np.expm1(X["log_guests"].to_numpy())
        per_unit = np.where(X["price_basis"] == "per_head", guests, 1.0)
        ranges = checker.booking_ranges(X, guests).div(per_unit, axis=0)
        out[name] = {}
        for markup in planted["markups"]:
            level = levels(price * markup, ranges["low"], ranges["high"], checker.settings["yellow_up_to"])[0]
            out[name][f"x{markup:g}"] = {lvl: float(np.mean(level == lvl)) for lvl in LEVELS}
    return out


def write_sheet(quotes, checklist=None, out=SHEET_FILE):
    """The labelling sheet: each scenario quote with what was asked, and empty level / not_included columns.

    It shows no model output, so the labels stay independent of the checker.
    """
    checklist = checklist or load_checklist()
    scenarios = pd.read_csv(REFERENCE_DIR / "scenarios.csv", dtype=str).set_index("scenario_id")
    sheet = quotes[
        ["quote_id", "category", "scenario_id", "event_type", "guests", "area", "venue_type", "day", "event_month"]
    ].copy()
    asks = zip(quotes["scenario_id"], quotes["category"], strict=True)
    sheet["what_was_asked"] = [scenarios.at[s, f"{c}_ask"] for s, c in asks]
    sheet["price_pkr"] = quotes["price_pkr"]
    sheet["unit"] = quotes["unit"].where(quotes["unit_note"].fillna("") == "", quotes["unit_note"])
    sheet["inclusions"], sheet["exclusions"] = quotes["inclusions"], quotes["exclusions"]
    sheet["checklist_items"] = quotes["category"].map(
        lambda c: " | ".join(f"{i['item']} ({i['label']})" for i in checklist.get(c, []))
    )
    for column in ["level", "not_included", "labelled_by", "notes"]:
        sheet[column] = ""
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.to_csv(out, index=False, encoding="utf-8")
    return sheet


DEMO_PLAN = {
    "event_type": "wedding_mehndi",
    "event_date": "2026-12-19",
    "guest_count": 300,
    "area": "Gulberg",
    "venue_type": "marquee",
}
DEMO_QUOTES = [
    {
        "category": "catering",
        "vendor_tier": "mid",
        "unit": "per_head",
        "quoted_pkr": 2200,
        "inclusions": ["Chicken karahi", "Waiters"],
    },
    {
        "category": "dj_sound",
        "vendor_tier": "budget",
        "unit": "per_event",
        "quoted_pkr": 150_000,
        "inclusions": ["DJ and sound for 4 hours", "Generator included"],
        "notes": "Overtime Rs 10,000 per extra hour",
    },
    {
        "category": "photography",
        "vendor_tier": "mid",
        "unit": "per_event",
        "quoted_pkr": 400_000,
        "inclusions": ["Photo and video", "300 edited photos", "Album"],
        "exclusions": ["Drone"],
    },
]


def print_report(report, log=print):
    log(f"  {'levels':<22} {'quotes':>6} {'verdict':>7} {'accuracy':>8} {'kappa':>6}")
    for name, s in report["levels"].items():
        log(f"  {name:<22} {s['quotes']:>6} {s['with_verdict']:>7} {s['accuracy']:>8.0%} {s['kappa']:>6.2f}")
    log(f"  {'checklist':<22} {'precision':>9} {'recall':>7}")
    for name, s in report["checklist"].items():
        log(f"  {name:<22} {s['precision']:>9.0%} {s['recall']:>7.0%}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset")
    parser.add_argument("--sheet", action="store_true", help="write the labelling sheet for the scenario quotes")
    parser.add_argument("--demo", action="store_true", help="check a few example quotes")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    quotes_path = args.processed / "quotes.parquet"
    if args.sheet:
        if not quotes_path.exists():
            print(f"No scenario quotes yet ({quotes_path}). Collect them, then run python -m shevent_ml.data.build.")
            return 1
        sheet = write_sheet(pd.read_parquet(quotes_path))
        print(f"{len(sheet)} quotes written to {SHEET_FILE}. Fill in level and not_included, then save the")
        print(f"quote_id, level, not_included and labelled_by columns as {LABELS_FILE} (commit it).")
        return 0

    checker = QuoteChecker(PriceEstimator.load())
    if args.demo:
        print(
            "Demo quotes for a 300-guest mehndi in Gulberg, Sat 19 Dec 2026 (synthetic-trained #2, not market prices)"
        )
        for quote in DEMO_QUOTES:
            result = checker.check({"plan": DEMO_PLAN, **quote})
            low, high = result["typical_range"]
            print(
                f"- {quote['category']} ({quote['vendor_tier']} vendor): Rs {quote['quoted_pkr']:,} {quote['unit']}"
                f" -> {result['level']} (typical Rs {low:,}-{high:,} for {quote['vendor_tier']} vendors)"
            )
            if result["ask_about"]:
                print(f"    ask about: {', '.join(result['ask_about'])}")
            if result["charged_extra"]:
                print(f"    charged extra: {', '.join(result['charged_extra'])}")
        return 0

    print(
        "Synthetic check (typical synthetic prices x markup -> share of each level; tests the rule, not real quotes):"
    )
    for compared_with, markups in planted_check(checker, args.processed).items():
        print(f"  compared with {compared_with.replace('_', ' ')}:")
        for markup, shares in markups.items():
            print(f"    {markup:<6} " + "  ".join(f"{name} {share:>4.0%}" for name, share in shares.items()))
    if not quotes_path.exists() or not LABELS_FILE.exists():
        print(f"No labelled scenario quotes yet ({LABELS_FILE}). Collect the quotes, run --sheet, have it labelled,")
        print("then rerun this. Meanwhile, --demo shows what the checker returns.")
        return 1
    prices = pd.read_parquet(args.processed / "prices.parquet")
    train_prices = prices[~is_test(prices, load_split())]
    vendors = pd.read_parquet(args.processed / "vendors.parquet")
    report = evaluate(checker, pd.read_parquet(quotes_path), load_labels(), train_prices, vendors)
    print_report(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
