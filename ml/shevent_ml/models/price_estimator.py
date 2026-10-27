"""#2 Price Range Estimator: low / likely / high price of a vendor category for an event.

    python -m shevent_ml.models.price_estimator            # train, calibrate, score, save to ml/artifacts/
    python -m shevent_ml.models.price_estimator --mlflow   # also log the run to MLflow

Three LightGBM quantile models (10%, 50%, 90%) on log price. The 10-90% range is then calibrated with conformalized
quantile regression (Romano et al., 2019): on prices the models didn't train on, measure how far outside the range
real prices fall, and widen (or narrow) the range by the amount that makes it hold `coverage` of them.

Training uses synthetic events plus the real training prices. Scores that count come from real test prices and the
scenario quotes only, next to the median-lookup baseline on the same rows.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import lightgbm as lgb
import mlflow
import numpy as np
import pandas as pd

from shevent_ml.config import PROCESSED_DIR, REPO_ROOT, SEED, load_config
from shevent_ml.data.split import is_test, load_split
from shevent_ml.eval.baselines import MedianPriceLookup, score_price_baseline
from shevent_ml.eval.metrics import interval_coverage, mape, pinball_loss
from shevent_ml.models.price_features import (
    CATEGORICAL,
    FEATURES,
    plan_rows,
    quote_rows,
    real_rows,
    synthetic_rows,
)
from shevent_ml.tracking import training_run

ARTIFACT_DIR = REPO_ROOT / "ml" / "artifacts" / "price_estimator"


def conformal_margin(low, high, actual, coverage):
    """How much to widen [low, high] (same scale as the inputs) so it holds `coverage` of new values.

    The score of each calibration value is how far it falls outside the range (negative when inside). The margin is
    the ceil((n + 1) * coverage)-th smallest score: with exchangeable data the widened range then covers at least
    `coverage` of new values.
    """
    scores = np.sort(np.maximum(np.asarray(low) - actual, np.asarray(actual) - high))
    rank = math.ceil((len(scores) + 1) * coverage)
    return float(scores[min(rank, len(scores)) - 1])


class PriceEstimator:
    def __init__(self, settings=None):
        self.settings = settings or load_config("price_estimator")
        self.quantiles = self.settings["quantiles"]
        self.boosters = []
        self.margin = 0.0
        self.calibrated_on = None
        self.version = None

    def fit(self, X, price, weight=None):
        params = {k: v for k, v in self.settings["lightgbm"].items() if k != "num_boost_round"}
        rounds = self.settings["lightgbm"]["num_boost_round"]
        data = lgb.Dataset(
            X[FEATURES], np.log(price), weight=weight, categorical_feature=list(CATEGORICAL), free_raw_data=False
        )
        self.boosters = [
            lgb.train({**params, "objective": "quantile", "alpha": q, "seed": SEED}, data, num_boost_round=rounds)
            for q in self.quantiles
        ]
        return self

    def _log_quantiles(self, X):
        """(n, 3) log prices, sorted per row so the low is never above the likely (no quantile crossing)."""
        return np.sort(np.column_stack([b.predict(X[FEATURES]) for b in self.boosters]), axis=1)

    def calibrate(self, X, price, source):
        q = self._log_quantiles(X)
        self.margin = conformal_margin(q[:, 0], q[:, -1], np.log(price.to_numpy()), self.settings["coverage"])
        self.calibrated_on = {"source": source, "rows": int(len(X))}
        return self

    def predict(self, X):
        """low / mid / high in PKR (per head or for the whole booking, as each row's price_basis says)."""
        q = self._log_quantiles(X)
        # A negative margin narrows the range; it never narrows past the likely price.
        low = np.minimum(q[:, 0] - self.margin, q[:, 1])
        high = np.maximum(q[:, -1] + self.margin, q[:, 1])
        return pd.DataFrame({"low": np.exp(low), "mid": np.exp(q[:, 1]), "high": np.exp(high)}, index=X.index)

    def drivers(self, X, top=3):
        """The event's features that move each row's likely price most, as (feature, value, % effect), from TreeSHAP.

        Category and price basis are left out: they set what is being priced, so they explain nothing to a host.
        """
        median = self.boosters[len(self.boosters) // 2]
        contributions = median.predict(X[FEATURES], pred_contrib=True)[:, :-1]  # last column is the base value
        explainable = np.array([f not in ("category", "price_basis") for f in FEATURES])
        out = []
        for i, row in enumerate(contributions):
            order = [j for j in np.argsort(-np.abs(row)) if explainable[j]][:top]
            out.append([(FEATURES[j], X.iloc[i][FEATURES[j]], round(100 * (math.exp(row[j]) - 1))) for j in order])
        return out

    def estimate_plan(self, plan, tier=None):
        """Per-category ranges for an event plan, in PKR for the whole event (per-head prices times guests)."""
        rows = plan_rows(plan, tier)
        prices = self.predict(rows)
        guests = np.where(rows["price_basis"] == "per_head", plan["guest_count"], 1)
        totals = prices.mul(guests, axis=0).round(-3)
        return totals.set_index(rows["category"].astype(str))

    def save(self, path=ARTIFACT_DIR, report=None):
        path.mkdir(parents=True, exist_ok=True)
        for q, booster in zip(self.quantiles, self.boosters, strict=True):
            booster.save_model(str(path / f"q{round(q * 100):02}.txt"))
        meta = {
            "version": self.version,
            "margin": self.margin,
            "calibrated_on": self.calibrated_on,
            "settings": self.settings,
            "features": FEATURES,
            "report": report,
        }
        (path / "meta.json").write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")

    @classmethod
    def load(cls, path=ARTIFACT_DIR):
        meta = json.loads((path / "meta.json").read_text(encoding="utf-8"))
        model = cls(meta["settings"])
        model.boosters = [lgb.Booster(model_file=str(path / f"q{round(q * 100):02}.txt")) for q in model.quantiles]
        model.margin, model.calibrated_on, model.version = meta["margin"], meta["calibrated_on"], meta["version"]
        return model


def score(predicted, actual, quantiles):
    """The same scores the baseline gets (eval.baselines.score_price_baseline), on the PKR scale."""
    return {
        "rows": int(len(actual)),
        "scored": int(len(actual)),
        "mape": mape(actual, predicted["mid"]),
        "pinball_low": pinball_loss(actual, predicted["low"], quantiles[0]),
        "pinball_mid": pinball_loss(actual, predicted["mid"], 0.5),
        "pinball_high": pinball_loss(actual, predicted["high"], quantiles[-1]),
        "coverage": interval_coverage(actual, predicted["low"], predicted["high"]),
    }


def _hash(*parts):
    return hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()[:8]


def train(processed_dir=PROCESSED_DIR, settings=None, split=None, log=print):
    """Trains, calibrates and scores the estimator. Returns (model, report)."""
    settings = settings or load_config("price_estimator")
    rng = np.random.default_rng(SEED)
    events = pd.read_parquet(processed_dir / "synthetic_events.parquet")
    services = pd.read_parquet(processed_dir / "synthetic_services.parquet")
    synthetic_manifest = json.loads((processed_dir / "synthetic_manifest.json").read_text(encoding="utf-8"))

    X_syn, y_syn, event_ids = synthetic_rows(events, services, settings["tier_dropout"], rng)
    held_events = set(rng.choice(events["event_id"], round(len(events) * settings["synthetic_holdout"]), replace=False))
    held = event_ids.isin(held_events).to_numpy()
    # Half the held-out synthetic events check the model; the other half can calibrate it if real prices are few.
    held_calibration = held & (rng.random(len(held)) < 0.5)
    held_check = held & ~held_calibration

    parts = [(X_syn[~held], y_syn[~held], np.ones((~held).sum()))]
    real = {}
    prices_path = processed_dir / "prices.parquet"
    if prices_path.exists():
        split = split or load_split()
        prices = pd.read_parquet(prices_path)
        test = is_test(prices, split)
        train_vendors = sorted(prices.loc[~test, "vendor_id"].unique())
        n_cal = round(len(train_vendors) * settings["calibration"]["real_fraction"])
        cal_vendors = set(rng.choice(train_vendors, n_cal, replace=False)) if n_cal else set()
        calibrating = prices["vendor_id"].isin(cal_vendors)
        real = {"prices": prices, "test": test, "fit": ~test & ~calibrating, "calibration": ~test & calibrating}
        X_real, y_real = real_rows(prices[real["fit"]])
        parts.append((X_real, y_real, np.full(len(X_real), settings["real_weight"])))

    X = pd.concat([p[0] for p in parts])
    model = PriceEstimator(settings).fit(X, pd.concat([p[1] for p in parts]), np.concatenate([p[2] for p in parts]))

    X_cal, y_cal = real_rows(real["prices"][real["calibration"]]) if real else (X_syn.iloc[:0], y_syn.iloc[:0])
    if len(X_cal) >= settings["calibration"]["min_real_rows"]:
        model.calibrate(X_cal, y_cal, "real")
    else:
        log(f"  only {len(X_cal)} real calibration prices: calibrating the range on held-out synthetic events")
        model.calibrate(X_syn[held_calibration], y_syn[held_calibration], "synthetic")

    report = {
        "calibrated_on": model.calibrated_on,
        "synthetic_check": score(model.predict(X_syn[held_check]), y_syn[held_check], model.quantiles),
    }
    if real:
        train_prices = real["prices"][~real["test"]]
        baseline = MedianPriceLookup(**load_config("baselines")["median_lookup"]).fit(train_prices)
        X_test, y_test = real_rows(real["prices"][real["test"]])
        test_prices = real["prices"].loc[X_test.index]
        report["test_prices"] = score(model.predict(X_test), y_test, model.quantiles)
        report["test_prices_baseline"] = score_price_baseline(baseline, test_prices, "mid_pkr_adj")
        quotes_path = processed_dir / "quotes.parquet"
        if quotes_path.exists():
            quotes = pd.read_parquet(quotes_path)
            X_q, y_q = quote_rows(quotes)
            report["scenario_quotes"] = score(model.predict(X_q), y_q, model.quantiles)
            report["scenario_quotes_baseline"] = score_price_baseline(baseline, quotes, "price_pkr_adj")

    dataset = json.loads((processed_dir / "manifest.json").read_text())["dataset_hash"] if real else "none"
    report["dataset_hash"] = dataset
    report["synthetic_hash"] = synthetic_manifest["synthetic_hash"]
    report["synthetic_sources"] = synthetic_manifest["sources"]
    model.version = f"cost-v1-{_hash(settings, dataset, synthetic_manifest['synthetic_hash'])}"
    return model, report


def print_report(report, log=print):
    def row(name, s):
        log(f"  {name:<26} {s['scored']:>6} {s['mape']:>7.1%} {s['pinball_mid']:>12,.0f} {s['coverage']:>9.0%}")

    log(f"  {'':<26} {'rows':>6} {'MAPE':>7} {'pinball@.5':>12} {'80% cover':>9}")
    for name in ["test_prices", "test_prices_baseline", "scenario_quotes", "scenario_quotes_baseline"]:
        if name in report:
            row(name.replace("_baseline", " (median lookup)"), report[name])
    if "test_prices" not in report:
        log("  No real prices yet: the only score is on held-out synthetic events, which proves the code works,")
        log("  not that the model knows Lahore prices.")
    row("synthetic check", report["synthetic_check"])
    placeholders = [k for k, v in report["synthetic_sources"].items() if v == "placeholder"]
    if placeholders:
        log(f"  Synthetic data still uses placeholder assumptions: {', '.join(placeholders)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset")
    parser.add_argument("--out", type=Path, default=ARTIFACT_DIR, help="where to save the model")
    parser.add_argument("--mlflow", action="store_true", help="log the run to MLflow")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    model, report = train(args.processed)
    model.save(args.out, report)
    print(f"Price estimator {model.version} saved to {args.out} (range calibrated on {model.calibrated_on['source']})")
    print_report(report)
    if args.mlflow:
        with training_run("price_estimator", report["dataset_hash"], {"model_version": model.version}):
            for subset in ["test_prices", "scenario_quotes", "synthetic_check"]:
                if subset in report:
                    mlflow.log_metrics({f"{subset}.{k}": v for k, v in report[subset].items()})
            mlflow.set_tag("synthetic_hash", report["synthetic_hash"])
            mlflow.log_artifacts(str(args.out), "price_estimator")
    return 0


if __name__ == "__main__":
    sys.exit(main())
