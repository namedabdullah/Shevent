import pandas as pd

from shevent_ml.data.import_dataset import import_dataset

VENDORS = pd.DataFrame(
    {
        "vendor_id": ["VEN-001", "CAT-001", "PHO-001"],
        "name": ["Hall One", "Food Co", "Pic Studio"],
        "category": ["Venue", "Catering", "Photography"],
        "sub_type": ["marriage_hall", "caterer", "photo_video"],
        "base_area": ["Gulberg", "Other", "Other"],
        "areas_served": ["Gulberg", "Other", "Other"],
        "event_types": ["wedding|corporate", "", "birthday"],
        "date_added": ["2026-11-09"] * 3,
        "notes": ["", "locality: Faisal Town; address: somewhere", "locality: Gulshan-e-Ravi"],
    }
)
PRICES = pd.DataFrame(
    {
        "price_id": ["P-1", "P-2", "P-3"],
        "vendor_id": ["VEN-001", "VEN-001", "CAT-001"],
        "category": ["Venue", "Venue", "Catering"],
        "package_name": ["Hall rent", "Marquee air conditioning", "Mehndi menu"],
        "unit": ["per_event", "per_event", "per_head"],
        "price_min_pkr": ["60000", "40000", "2200"],
        "event_type": ["wedding", "any", "mehndi"],
        "source_type": ["directory", "directory", "listing_article"],
    }
)
REVIEWS = pd.DataFrame({"review_id": ["R-1"], "vendor_id": ["CAT-001"], "source_type": ["directory"], "text": ["Good"]})
MEDIA = pd.DataFrame(
    {"media_id": ["M-1"], "vendor_id": ["PHO-001"], "file_name": ["a.jpg"], "date_collected": ["2026-11-09"]}
)
QUOTES = pd.DataFrame(columns=["quote_id", "vendor_id", "scenario_id", "quoted_pkr"])


def test_the_dataset_folder_becomes_template_csvs_with_the_apps_values(tmp_path):
    raw = tmp_path / "shevent_dataset" / "data" / "raw"
    raw.mkdir(parents=True)
    for name, df in [("vendors", VENDORS), ("price_observations", PRICES), ("reviews", REVIEWS),
                     ("portfolio_media", MEDIA), ("scenario_quotes", QUOTES)]:  # fmt: skip
        df.to_csv(raw / f"{name}.csv", index=False)
    out = tmp_path / "out"
    summary = import_dataset(tmp_path / "shevent_dataset", out)

    vendors = pd.read_csv(out / "vendors.csv", dtype=str, keep_default_na=False).set_index("vendor_id")
    assert vendors["category"].tolist() == ["venue", "catering", "photography"]
    assert vendors.loc["VEN-001", "sub_type"] == "banquet" and vendors.loc["CAT-001", "sub_type"] == ""
    # The locality in the notes is a reference area; Gulshan-e-Ravi isn't, so it stays Other.
    assert vendors["base_area"].tolist() == ["Gulberg", "Faisal Town", "Other"]
    assert vendors.loc["VEN-001", "event_types"].split("|") == [
        "wedding_mehndi", "wedding_baraat", "wedding_walima", "engagement", "corporate_dinner", "corporate_other"
    ]  # fmt: skip
    assert vendors.loc["VEN-001", "collected_date"] == "2026-11-09"

    prices = pd.read_csv(out / "price_observations.csv", dtype=str, keep_default_na=False)
    assert prices["obs_id"].tolist() == ["P-1", "P-3"]  # the air conditioning add-on is left out
    assert prices["event_type"].tolist() == ["", "wedding_mehndi"] and prices["source_type"].tolist()[1] == "directory"
    assert pd.read_csv(out / "reviews.csv", dtype=str).loc[0, "source"] == "directory"
    assert pd.read_csv(out / "portfolio_media.csv", dtype=str).loc[0, "collected_date"] == "2026-11-09"
    assert summary["areas_from_notes"] == 1 and summary["add_ons_left_out"] == 1
