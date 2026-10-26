import json

import pandas as pd
import pytest

from shevent_ml.config import TEMPLATE_DIR
from shevent_ml.data.build import build

SETTINGS = {
    "default_hours": {"dj_sound": 4},
    "cpi": {"reference_month": "2026-10", "monthly_index": {}, "fallback_annual_rate": 0.0},
}


def write(raw_dir, name, rows):
    pd.DataFrame(rows).to_csv(raw_dir / f"{name}.csv", index=False)


@pytest.fixture
def raw_dir(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    write(raw, "vendors", [
        {"vendor_id": "EXAMPLE-CAT-001", "name": "Example", "category": "catering", "base_area": "Gulberg"},
        {"vendor_id": "CAT-001", "name": "Lahore Caterers", "category": "catering", "base_area": "DHA Phase 5",
         "areas_served": "Gulberg III|Defence"},
        {"vendor_id": "DJS-001", "name": "Beat Box", "category": "dj_sound", "base_area": "Johar Town"},
    ])
    write(raw, "price_observations", [
        {"obs_id": "P-0001", "vendor_id": "CAT-001", "category": "catering", "package_name": "Silver Menu",
         "unit": "per_head", "price_min_pkr": "1800", "price_date": "2026-10-01", "confidence": "medium"},
        {"obs_id": "P-0002", "vendor_id": "CAT-001", "category": "catering", "package_name": "silver  menu",
         "unit": "per_head", "price_min_pkr": "1800", "price_date": "2026-09-01", "confidence": "high"},
        {"obs_id": "P-0003", "vendor_id": "DJS-001", "category": "dj_sound", "unit": "per_hour",
         "price_min_pkr": "10000", "price_date": "2026-10-01", "confidence": "high"},
        {"obs_id": "P-0004", "vendor_id": "DJS-001", "category": "dj_sound", "unit": "per_head",
         "price_min_pkr": "500", "price_date": "2026-10-01", "confidence": "high"},
        {"obs_id": "P-0005", "vendor_id": "VEN-999", "category": "venue", "unit": "per_slot",
         "price_min_pkr": "300000", "price_date": "2026-10-01", "confidence": "high"},
    ])
    write(raw, "scenario_quotes", [
        {"quote_id": "Q-001", "vendor_id": "DJS-001", "category": "dj_sound", "scenario_id": "S2",
         "quoted_pkr": "8000", "unit": "per_hour", "quote_date": "2026-10-20"},
    ])
    write(raw, "reviews", [
        {"review_id": "R-0001", "vendor_id": "CAT-001", "rating": "5", "text": "Great food, call 0300-1234567",
         "language": "en"},
        {"review_id": "R-0002", "vendor_id": "CAT-001", "rating": "5", "text": "great food, call 0300-1234567",
         "language": "en"},
    ])
    return raw


def test_build_writes_clean_tables(raw_dir, tmp_path):
    out = tmp_path / "processed"
    manifest = build(raw_dir, out, SETTINGS)

    vendors = pd.read_parquet(out / "vendors.parquet").set_index("vendor_id")
    assert list(vendors.index) == ["CAT-001", "DJS-001"]  # EXAMPLE row removed
    assert vendors.at["CAT-001", "base_area"] == "DHA"
    assert vendors.at["CAT-001", "areas_served"] == "DHA|Gulberg"

    areas = pd.read_parquet(out / "vendor_areas.parquet")
    assert sorted(areas.loc[areas["vendor_id"] == "CAT-001", "area"]) == ["DHA", "Gulberg"]

    prices = pd.read_parquet(out / "prices.parquet").set_index("obs_id")
    assert list(prices.index) == ["P-0002", "P-0003"]
    assert prices.at["P-0002", "area"] == "DHA"
    assert prices.at["P-0003", "price_basis"] == "flat"
    assert prices.at["P-0003", "low_pkr"] == 40_000  # 10,000 per hour x 4 default hours

    quotes = pd.read_parquet(out / "quotes.parquet").set_index("quote_id")
    assert quotes.at["Q-001", "price_pkr"] == 24_000  # scenario S2 is 3 hours
    assert quotes.at["Q-001", "area"] == "DHA"

    reviews = pd.read_parquet(out / "reviews.parquet")
    assert list(reviews["text"]) == ["Great food, call [phone]"]

    assert not (out / "media.parquet").exists()
    assert manifest["dropped"] == {
        "price_observations": {"unknown vendor": 1, "unit not used for this category": 1, "duplicate price": 1},
        "reviews": {"duplicate review": 1},
    }
    assert json.loads((out / "manifest.json").read_text(encoding="utf-8"))["dataset_hash"] == manifest["dataset_hash"]


def test_dataset_hash_tracks_settings(raw_dir, tmp_path):
    first = build(raw_dir, tmp_path / "a", SETTINGS)["dataset_hash"]
    assert build(raw_dir, tmp_path / "b", SETTINGS)["dataset_hash"] == first
    changed = {**SETTINGS, "default_hours": {"dj_sound": 5}}
    assert build(raw_dir, tmp_path / "c", changed)["dataset_hash"] != first


def test_build_handles_an_export_with_only_example_rows(tmp_path):
    manifest = build(TEMPLATE_DIR, tmp_path / "out", SETTINGS)
    assert manifest["rows"] == {"vendors": 0, "vendor_areas": 0, "prices": 0, "quotes": 0, "reviews": 0, "media": 0}


def test_build_needs_vendors(tmp_path):
    with pytest.raises(FileNotFoundError):
        build(tmp_path, tmp_path / "out", SETTINGS)
