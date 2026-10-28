import json

import numpy as np
import pandas as pd
import pytest

from shevent_ml.config import CATEGORIES, load_config
from shevent_ml.eval.baselines import MedianPriceLookup
from shevent_ml.eval.metrics import mape
from shevent_ml.models.price_estimator import PriceEstimator, conformal_margin, train
from shevent_ml.models.price_features import encode, plan_rows, synthetic_rows
from shevent_ml.synthetic.generate import write

SETTINGS = {
    **load_config("price_estimator"),
    "lightgbm": {**load_config("price_estimator")["lightgbm"], "num_boost_round": 80},
}
PLAN = {
    "event_type": "wedding_mehndi",
    "guest_count": 300,
    "area": "Gulberg",
    "venue_type": "marquee",
    "event_date": "2026-12-19",
    "preferences": ["decor_heavy"],
}


@pytest.fixture(scope="module")
def synthetic_dir(tmp_path_factory):
    out = tmp_path_factory.mktemp("processed")
    write(3000, out, seed=5)
    return out


@pytest.fixture(scope="module")
def trained(synthetic_dir):
    return train(synthetic_dir, SETTINGS, log=lambda *_: None)


def test_conformal_margin_widens_to_the_requested_coverage():
    low, high = np.zeros(9), np.ones(9)
    actual = np.array([0.5, 0.5, 0.5, 0.5, 0.5, 1.2, 1.4, 1.6, 2.0])  # outside by 0.2, 0.4, 0.6, 1.0
    # Inside scores are -0.5; ceil(10 x 0.8) = 8th smallest score is 0.6.
    assert conformal_margin(low, high, actual, 0.8) == pytest.approx(0.6)
    # A range that's already too wide gets narrower (negative margin).
    assert conformal_margin(low - 5, high + 5, np.full(9, 0.5), 0.8) < 0


def test_synthetic_only_training_is_calibrated_and_labelled_as_such(trained):
    model, report = trained
    assert model.calibrated_on["source"] == "synthetic"
    assert "test_prices" not in report and report["dataset_hash"] == "none"
    assert 0.72 <= report["synthetic_check"]["coverage"] <= 0.88
    assert model.version.startswith("cost-v1-")


def test_model_beats_the_median_lookup_and_ranges_are_ordered(trained, synthetic_dir):
    model, _ = trained
    events = pd.read_parquet(synthetic_dir / "synthetic_events.parquet")
    services = pd.read_parquet(synthetic_dir / "synthetic_services.parquet")
    X, y, ids = synthetic_rows(events, services)
    check = ids.isin(events["event_id"].iloc[-300:]).to_numpy()
    predicted = model.predict(X[check])
    assert (predicted["low"] <= predicted["mid"]).all() and (predicted["mid"] <= predicted["high"]).all()
    rows = pd.DataFrame({c: X[c].astype(str) for c in ["category", "price_basis", "area"]}).assign(mid_pkr_adj=y)
    baseline = MedianPriceLookup().fit(rows[~check]).predict(rows[check])
    assert mape(y[check], predicted["mid"]) < mape(y[check], baseline["mid"])


def test_tier_moves_the_price_and_an_unknown_tier_sits_between(trained):
    model, _ = trained
    rows = pd.concat([plan_rows(PLAN, tier) for tier in ["budget", None, "premium"]])
    mid = model.predict(rows)["mid"].to_numpy().reshape(3, -1)
    assert (mid[0] < mid[2]).all()
    assert (mid[0] < mid[1]).sum() >= 4 and (mid[1] < mid[2]).sum() >= 4


def test_plan_estimate_scales_catering_by_guests(trained):
    model, _ = trained
    small, large = model.estimate_plan({**PLAN, "guest_count": 100}), model.estimate_plan(PLAN)
    assert list(large.index) == CATEGORIES
    assert large.loc["catering", "mid"] > 2 * small.loc["catering", "mid"]
    assert (large > 0).all().all()


def test_drivers_explain_the_event_not_the_category(trained):
    model, _ = trained
    drivers = model.drivers(plan_rows(PLAN), top=3)
    assert len(drivers) == len(CATEGORIES) and all(len(d) == 3 for d in drivers)
    features = {feature for row in drivers for feature, _, _ in row}
    assert not features & {"category", "price_basis"}


def test_save_and_load_give_the_same_predictions(trained, tmp_path):
    model, report = trained
    model.save(tmp_path, report)
    loaded = PriceEstimator.load(tmp_path)
    rows = plan_rows(PLAN)
    pd.testing.assert_frame_equal(model.predict(rows), loaded.predict(rows))
    assert loaded.version == model.version
    assert json.loads((tmp_path / "meta.json").read_text())["report"]["calibrated_on"]["source"] == "synthetic"


def test_unknown_values_become_missing():
    encoded = encode(pd.DataFrame({"category": ["decor"], "area": ["Narnia"], "event_type": ["any"]}))
    assert encoded["area"].isna().all() and encoded["event_type"].isna().all()
    assert encoded["category"].iloc[0] == "decor" and np.isnan(encoded["tier_rank"].iloc[0])


def fake_real_data(out):
    """60 vendors' prices that follow the synthetic base prices, a test split, and two scenario quotes."""
    rng = np.random.default_rng(2)
    base = load_config("synthetic")["base_prices"]
    rows = []
    for i in range(60):
        category = ["venue", "catering", "decor", "dj_sound", "lighting"][i % 5]
        tier = ["budget", "mid", "premium"][i % 3]
        area = ["Gulberg", "DHA", "Johar Town"][i % 3]
        for k in range(3):
            price = base[category][tier] * rng.lognormal(0, 0.2)
            rows.append(
                {
                    "obs_id": f"P{i}-{k}",
                    "vendor_id": f"V{i:03}",
                    "category": category,
                    "price_basis": "per_head" if category == "catering" else "flat",
                    "area": area,
                    "price_tier": tier,
                    "event_type": "any",
                    "sub_type": "marquee",
                    "season_note": "unspecified",
                    "guest_min": np.nan,
                    "guest_max": np.nan,
                    "hours": np.nan,
                    "is_combo": False,
                    "mid_pkr_adj": round(price, -2),
                }
            )
    pd.DataFrame(rows).to_parquet(out / "prices.parquet")
    pd.DataFrame(
        {
            "category": ["catering", "decor"],
            "price_basis": ["per_head", "flat"],
            "area": ["Gulberg", "DHA"],
            "event_type": ["wedding_mehndi", "corporate_dinner"],
            "venue_type": ["marquee", "banquet"],
            "event_month": ["2026-12", "2026-11"],
            "day": ["Saturday", "Weekday"],
            "guests": ["300", "120"],
            "hours": [4, 3],
            "vendor_id": ["V001", "V002"],
            "price_pkr_adj": [2600.0, 210000.0],
        }
    ).to_parquet(out / "quotes.parquet")
    (out / "manifest.json").write_text(json.dumps({"dataset_hash": "real123"}))
    return {
        "dataset_hash": "real123",
        "test_vendors": [f"V{i:03}" for i in range(0, 60, 5)] + [f"V{i:03}" for i in range(1, 60, 10)],
    }


def test_with_real_prices_it_calibrates_on_them_and_reports_next_to_the_baseline(synthetic_dir, tmp_path):
    for name in ["synthetic_events.parquet", "synthetic_services.parquet", "synthetic_manifest.json"]:
        (tmp_path / name).write_bytes((synthetic_dir / name).read_bytes())
    split = fake_real_data(tmp_path)
    model, report = train(tmp_path, SETTINGS, split=split, log=lambda *_: None)
    assert model.calibrated_on["source"] == "real" and model.calibrated_on["rows"] >= 30
    assert report["dataset_hash"] == "real123"
    for name in ["test_prices", "test_prices_baseline", "scenario_quotes", "scenario_quotes_baseline"]:
        assert report[name]["scored"] > 0, name
    assert report["test_prices"]["rows"] == report["test_prices_baseline"]["rows"]
