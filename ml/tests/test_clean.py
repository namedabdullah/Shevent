import numpy as np
import pandas as pd

from shevent_ml.data.clean import duplicate_prices, map_area, map_area_list, normalize_units, scrub_phone_numbers
from shevent_ml.data.load import load_reference

ALIASES = {"dha phase 5": "DHA", "defence": "DHA", "gulberg iii": "Gulberg"}


def test_map_area_ignores_case_and_spaces():
    assert map_area(" dha PHASE 5 ", ALIASES) == "DHA"


def test_map_area_unknown_becomes_other_and_blank_stays_blank():
    assert map_area("Shahdara", ALIASES) == "Other"
    assert map_area("", ALIASES) == ""


def test_map_area_list_dedupes_and_sorts():
    assert map_area_list("Defence| Gulberg III|DHA Phase 5|", ALIASES) == ["DHA", "Gulberg"]


def test_reference_aliases_cover_common_spellings():
    aliases = load_reference()["area_aliases"]
    assert map_area("DHA Phase 5", aliases) == "DHA"
    assert map_area("Gulberg III", aliases) == "Gulberg"
    assert map_area("Expo Centre", aliases) == "Johar Town"


def test_normalize_units():
    df = pd.DataFrame({
        "unit": ["per_head", "per_slot", "per_hour", "per_hour", "per_hour"],
        "category": ["catering", "venue", "dj_sound", "lighting", "venue"],
        "low_pkr": [1800.0, 300000.0, 10000.0, 5000.0, 1000.0],
        "high_pkr": [2000.0, 300000.0, 12000.0, 5000.0, 1000.0],
        "hours": [np.nan, np.nan, 3.0, np.nan, np.nan],
    })
    out = normalize_units(df, {"dj_sound": 4, "lighting": 5})

    assert list(out["price_basis"]) == ["per_head", "flat", "flat", "flat", "flat"]
    assert list(out["low_pkr"][:4]) == [1800, 300000, 30000, 25000]  # row hours win over the default
    assert out.at[2, "high_pkr"] == 36000
    assert out.at[3, "unit_note"] == "per_hour x 5h"
    assert np.isnan(out.at[4, "low_pkr"])  # no hours and no default: left for the caller to drop


def test_duplicate_prices_keeps_most_confident_then_newest():
    df = pd.DataFrame({
        "vendor_id": ["CAT-001"] * 3 + ["CAT-002"],
        "category": ["catering"] * 4,
        "unit": ["per_head"] * 4,
        "package_name": ["Silver Menu", "silver  menu", "SILVER MENU", "Silver Menu"],
        "low_pkr": [1800.0] * 4,
        "high_pkr": [1800.0] * 4,
        "confidence": ["medium", "high", "high", "medium"],
        "price_date": pd.to_datetime(["2026-10-01", "2026-08-01", "2026-09-01", "2026-10-01"]),
    })
    assert list(duplicate_prices(df)) == [True, True, False, False]


def test_scrub_phone_numbers():
    text = pd.Series(["Call 0300-1234567 or +92 321 7654321", "No number here"])
    assert list(scrub_phone_numbers(text)) == ["Call [phone] or [phone]", "No number here"]
