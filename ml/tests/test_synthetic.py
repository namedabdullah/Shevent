import json

import numpy as np
import pandas as pd
import pytest

from shevent_ml.config import load_config
from shevent_ml.features.calendar import calendar_features
from shevent_ml.synthetic.generate import CATEGORIES, fit_base_prices, generate, write

SETTINGS = load_config("synthetic")


@pytest.fixture(scope="module")
def synthetic():
    return generate(6000, SETTINGS, seed=7)


def test_same_seed_same_events():
    a, _ = generate(200, SETTINGS, seed=3)
    b, _ = generate(200, SETTINGS, seed=3)
    pd.testing.assert_frame_equal(a, b)


def test_events_are_consistent(synthetic):
    events, services = synthetic
    shares = events[[f"share_{c}" for c in CATEGORIES]]
    assert np.allclose(shares.sum(axis=1), 1)
    assert (shares > 0).all().all()
    assert np.allclose(events[[f"spend_{c}" for c in CATEGORIES]].sum(axis=1), events["total_spend_pkr"])
    # Hosts plan a budget and spend it or overspend it (to the nearest thousand).
    assert (events["total_budget_pkr"] <= events["total_spend_pkr"] + 500).all()
    assert (events["guest_count_actual"] <= events["guest_count_invited"]).all()
    for event_type, spec in SETTINGS["event_types"].items():
        guests = events.loc[events["event_type"] == event_type, "guest_count_invited"]
        assert guests.between(spec["guests"]["min"], spec["guests"]["max"]).all()
    assert len(services) == len(events) * len(CATEGORIES)
    catering = services[services["category"] == "catering"].set_index("event_id")
    assert (catering["price_basis"] == "per_head").all()
    joined = catering.join(events.set_index("event_id")["guest_count_invited"])
    assert np.allclose(joined["unit_price_pkr"] * joined["guest_count_invited"], joined["cost_pkr"])


def test_weddings_follow_the_wedding_calendar(synthetic):
    events, _ = synthetic
    weddings = events[events["event_type"].str.startswith("wedding")]
    days = pd.Series(pd.date_range(SETTINGS["dates"]["start"], SETTINGS["dates"]["end"]))
    days_per_season = calendar_features(days)["season"].astype(str).value_counts()
    per_day = weddings["season"].value_counts() / days_per_season
    assert per_day["ramadan"] < 0.1 * per_day["off_peak"]
    assert per_day["peak_wedding_season"] > 1.5 * per_day["off_peak"]
    corporate = events[events["event_type"] == "corporate_dinner"]
    assert corporate["is_weekend"].mean() < 0.25  # 2 of 7 days are weekend days


def test_price_effects_show_in_the_data(synthetic):
    events, services = synthetic
    catering = services[services["category"] == "catering"].set_index("event_id").join(events.set_index("event_id"))
    by_area = catering.groupby("area")["unit_price_pkr"].median()
    assert by_area["DHA"] / by_area["Johar Town"] == pytest.approx(1.2, rel=0.1)
    by_tier = catering.groupby("tier")["unit_price_pkr"].median()
    assert by_tier["budget"] < by_tier["mid"] < by_tier["premium"]
    decor_heavy = events["preferences"].str.contains("decor_heavy")
    assert events.loc[decor_heavy, "share_decor"].mean() > events.loc[~decor_heavy, "share_decor"].mean()
    dhol = events.loc[events["preferences"].str.contains("live_dhol"), "event_type"]
    assert set(dhol) <= {"wedding_mehndi", "wedding_baraat"}


def test_fit_base_prices_uses_real_medians_where_there_are_enough():
    prices = pd.DataFrame(
        {
            "category": ["catering"] * 5 + ["decor"] * 2,
            "price_tier": ["mid"] * 5 + ["premium"] * 2,
            "price_basis": ["per_head"] * 5 + ["flat"] * 2,
            "area": ["DHA", "DHA", "Johar Town", "Johar Town", "Johar Town", "DHA", "DHA"],
            "mid_pkr_adj": [3600, 3600, 2000, 2600, 2800, 900000, 900000],
        }
    )
    base, fitted = fit_base_prices(prices, SETTINGS, min_prices=5)
    # DHA prices are divided by DHA's 1.2 multiplier first: [3000, 3000, 2000, 2600, 2800].
    assert base["catering"]["mid"] == 2800
    assert base["decor"]["premium"] == SETTINGS["base_prices"]["decor"]["premium"]  # only two prices
    assert fitted == ["catering.mid (5 prices)"]
    assert SETTINGS["base_prices"]["catering"]["mid"] != 2800  # the settings themselves are untouched


def test_write_records_the_assumptions(tmp_path):
    events, manifest = write(50, tmp_path, seed=1, settings=SETTINGS)
    assert len(pd.read_parquet(tmp_path / "synthetic_events.parquet")) == 50
    saved = json.loads((tmp_path / "synthetic_manifest.json").read_text())
    assert saved["synthetic_hash"] == manifest["synthetic_hash"]
    assert saved["sources"]["base_prices"] == "placeholder"
    assert write(50, tmp_path, seed=2, settings=SETTINGS)[1]["synthetic_hash"] != manifest["synthetic_hash"]


def test_prices_without_a_tier_set_the_mid_price_and_bundles_are_ignored():
    prices = pd.DataFrame(
        {
            "category": ["decor"] * 6,
            "price_tier": [""] * 6,
            "price_basis": ["flat"] * 6,
            "area": ["Johar Town"] * 6,  # multiplier 1.0
            "mid_pkr_adj": [20000, 30000, 30000, 40000, 50000, 900000],
            "is_combo": [False] * 5 + [True],
        }
    )
    base, fitted = fit_base_prices(prices, SETTINGS, min_prices=5)
    configured = SETTINGS["base_prices"]["decor"]
    assert base["decor"]["mid"] == 30000  # the bundle (900,000) is left out
    assert base["decor"]["premium"] == pytest.approx(30000 * configured["premium"] / configured["mid"])
    assert fitted == ["decor.mid (5 prices without a tier; budget and premium keep the config's ratio)"]
    assert base["catering"] == SETTINGS["base_prices"]["catering"]  # no catering prices: unchanged
