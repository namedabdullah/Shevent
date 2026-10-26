"""The baselines each model must beat (README section 10), and the report of their scores on the test set.

    python -m shevent_ml.eval.baselines            # needs data/processed/ and data/splits/test_split.json
    python -m shevent_ml.eval.baselines --mlflow   # also logs the scores to the "baselines" MLflow experiment

#2 median price lookup · #1 fixed planner split per event type · #3 sort by rating.
"""

import argparse
import json
import sys
from pathlib import Path

import mlflow
import pandas as pd

from shevent_ml.config import PROCESSED_DIR, load_config, mlflow_tracking_uri
from shevent_ml.data.split import is_test, load_split
from shevent_ml.eval.metrics import interval_coverage, mape, pinball_loss

CATEGORIES = ["venue", "catering", "decor", "dj_sound", "lighting"]


class MedianPriceLookup:
    """#2 baseline: the median training price of the row's category x price basis x area.

    Cells with fewer than min_prices prices use the category x price basis median from every area. The range is
    the cell's interval quantiles, so its coverage can be compared with the model's 80% range.
    """

    KEYS = ["category", "price_basis", "area"]

    def __init__(self, min_prices=3, interval=(0.1, 0.9)):
        self.min_prices = min_prices
        self.interval = tuple(interval)

    def _stats(self, prices, keys, target):
        low, high = self.interval
        grouped = prices.groupby(keys, observed=True)[target]
        return pd.DataFrame(
            {"low": grouped.quantile(low), "mid": grouped.median(), "high": grouped.quantile(high), "n": grouped.size()}
        )

    def fit(self, prices, target="mid_pkr_adj"):
        self.cells_ = self._stats(prices, self.KEYS, target)
        self.fallback_ = self._stats(prices, self.KEYS[:2], target)
        return self

    def predict(self, rows):
        """low / mid / high for each row (by category, price_basis, area). NaN for a category x basis never seen."""
        cell = rows[self.KEYS].join(self.cells_, on=self.KEYS)
        fallback = rows[self.KEYS[:2]].join(self.fallback_, on=self.KEYS[:2])
        use_cell = cell["n"] >= self.min_prices
        return pd.DataFrame(
            {col: cell[col].where(use_cell, fallback[col]) for col in ["low", "mid", "high"]}, index=rows.index
        )


class FixedPlannerSplit:
    """#1 baseline: the same budget split for every event of a type, whatever its size, place or date."""

    def __init__(self, default, by_event_type=None, source="placeholder"):
        self.default = default
        self.by_event_type = by_event_type or {}
        self.source = source

    @classmethod
    def from_config(cls, settings=None):
        settings = (settings or load_config("baselines"))["planner_split"]
        return cls(settings["default"], settings.get("by_event_type"), settings.get("source", "placeholder"))

    def predict(self, events):
        """One share column per category, each row summing to 1."""
        rows = [self.by_event_type.get(event_type, self.default) for event_type in events["event_type"]]
        shares = pd.DataFrame(rows, index=events.index).reindex(columns=CATEGORIES).fillna(0.0)
        return shares.div(shares.sum(axis=1), axis=0)


def rank_by_rating(candidates):
    """#3 baseline: candidates sorted by rating, then number of reviews; unrated vendors last."""
    return candidates.sort_values(
        ["rating", "review_count", "vendor_id"], ascending=[False, False, True], na_position="last", kind="stable"
    )


def score_price_baseline(model, rows, target):
    predicted = model.predict(rows)
    known = predicted["mid"].notna() & rows[target].notna()
    actual, predicted = rows.loc[known, target], predicted[known]
    return {
        "rows": int(len(rows)),
        "scored": int(known.sum()),
        "mape": mape(actual, predicted["mid"]),
        "pinball_low": pinball_loss(actual, predicted["low"], model.interval[0]),
        "pinball_mid": pinball_loss(actual, predicted["mid"], 0.5),
        "pinball_high": pinball_loss(actual, predicted["high"], model.interval[1]),
        "coverage": interval_coverage(actual, predicted["low"], predicted["high"]),
    }


def run(processed_dir=PROCESSED_DIR, split=None, settings=None):
    """Fits the #2 baseline on the training prices and scores it on the test prices and the scenario quotes."""
    settings = settings or load_config("baselines")
    split = split or load_split()
    prices = pd.read_parquet(processed_dir / "prices.parquet")
    test = is_test(prices, split)
    lookup = MedianPriceLookup(**settings["median_lookup"]).fit(prices[~test])

    report = {"dataset_hash": split["dataset_hash"], "price_estimator": {}}
    report["price_estimator"]["test_prices"] = score_price_baseline(lookup, prices[test], "mid_pkr_adj")
    for category, rows in prices[test].groupby("category"):
        report["price_estimator"][f"test_prices.{category}"] = score_price_baseline(lookup, rows, "mid_pkr_adj")
    quotes_path = processed_dir / "quotes.parquet"
    if quotes_path.exists():
        quotes = pd.read_parquet(quotes_path)
        report["price_estimator"]["scenario_quotes"] = score_price_baseline(lookup, quotes, "price_pkr_adj")

    planner = FixedPlannerSplit.from_config(settings)
    report["budget_allocator"] = {"source": planner.source, "status": "needs the host survey splits to score"}
    report["vendor_matching"] = {"status": "needs the relevance-labelled matching set to score"}
    return report


def log_to_mlflow(report):
    mlflow.set_tracking_uri(mlflow_tracking_uri())
    mlflow.set_experiment("baselines")
    with mlflow.start_run(run_name="median_price_lookup"):
        mlflow.set_tag("dataset_version", report["dataset_hash"])
        for subset, scores in report["price_estimator"].items():
            mlflow.log_metrics({f"{subset}.{name}": value for name, value in scores.items()})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset")
    parser.add_argument("--mlflow", action="store_true", help="log the scores to MLflow")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    report = run(args.processed)
    (args.processed / "baseline_metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if args.mlflow:
        log_to_mlflow(report)

    print(f"Baselines on dataset {report['dataset_hash']} (scores to beat)")
    print(f"  {'#2 median lookup':<28} {'rows':>5} {'MAPE':>7} {'pinball@.5':>11} {'80% cover':>10}")
    for subset, s in report["price_estimator"].items():
        print(f"  {subset:<28} {s['scored']:>5} {s['mape']:>7.1%} {s['pinball_mid']:>11,.0f} {s['coverage']:>10.0%}")
    if report["budget_allocator"]["source"] == "placeholder":
        print("  #1 planner split: shares in configs/baselines.yaml are placeholders, not interview averages")
    print(f"  #1 planner split: {report['budget_allocator']['status']}")
    print(f"  #3 sort by rating: {report['vendor_matching']['status']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
