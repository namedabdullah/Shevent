"""Convert the data lead's dataset folder (shevent_dataset/data/raw/*.csv) into the export CSVs in data/raw.

    python -m shevent_ml.data.import_dataset C:/Users/me/Downloads/shevent_dataset
    python -m shevent_ml.data.import_dataset <folder> --out data/raw

The folder's CSVs follow the collection guide but name some columns and values differently, so this writes all five
tables in the template format (data/templates/), ready for scripts/validate_data.py and shevent_ml.data.build:

- Categories, venue and DJ sub types, event types and source types are mapped to the app's values
  (configs/dataset_import.yaml). A price for a plain "wedding" gets no single event type.
- A vendor the folder puts in "Other" gets back the area its notes name ("locality: Faisal Town"), when that locality
  is a reference area or one the workbook import already placed (configs/workbook_import.yaml).
- Air conditioning and heating add-ons are left out of the prices: they aren't a category's price.
- Reviews get the source and collection date the template asks for. Notes, addresses included, stay in data/raw only.
"""

import argparse
import re
import sys
from pathlib import Path

import pandas as pd

from shevent_ml.config import RAW_DIR, TEMPLATE_DIR, load_config
from shevent_ml.data.load import RAW_TABLES, load_reference, read_export_csv


def to_template(df, name):
    columns = pd.read_csv(TEMPLATE_DIR / f"{name}.csv", nrows=0).columns
    return df.reindex(columns=columns).fillna("")


def locality(notes):
    found = re.search(r"locality:\s*([^;]+)", notes)
    return found.group(1).strip() if found else ""


def area_from_notes(row, localities, aliases):
    """The vendor's area, or the reference area its notes' locality lies in when the folder says 'Other'."""
    if row["base_area"] != "Other":
        return row["base_area"]
    place = locality(row["notes"])
    return localities.get(place) or aliases.get(place.lower()) or "Other"


def convert_vendors(df, settings, localities, aliases):
    out = df.copy()
    out["category"] = out["category"].map(settings["categories"])
    out["sub_type"] = out["sub_type"].map(settings["sub_types"]).fillna("")
    out["base_area"] = out.apply(area_from_notes, axis=1, localities=localities, aliases=aliases)
    out["event_types"] = out["event_types"].map(
        lambda v: "|".join(t for kind in v.split("|") if kind for t in settings["vendor_event_types"].get(kind, []))
    )
    out["collected_date"] = out["date_added"]
    return to_template(out, "vendors")


def convert_prices(df, vendors, settings):
    skip = df["package_name"].str.contains(settings["skip_packages"], case=False, regex=True)
    out = df[~skip].copy()
    out["obs_id"] = out["price_id"]
    out["category"] = out["category"].map(settings["categories"])
    out["event_type"] = out["event_type"].map(settings["price_event_types"]).fillna("")
    out["source_type"] = out["source_type"].replace(settings["source_types"])
    out["collected_date"] = out["vendor_id"].map(vendors.set_index("vendor_id")["collected_date"])
    return to_template(out, "price_observations"), int(skip.sum())


def convert_reviews(df, vendors):
    out = df.assign(
        source=df["source_type"], collected_date=df["vendor_id"].map(vendors.set_index("vendor_id")["collected_date"])
    )
    return to_template(out, "reviews")


def import_dataset(folder, out_dir=RAW_DIR, settings=None):
    settings = settings or load_config("dataset_import")
    localities = load_config("workbook_import")["locality_areas"]
    aliases = load_reference()["area_aliases"]
    raw = folder / "data" / "raw" if (folder / "data" / "raw").is_dir() else folder
    tables = {name: read_export_csv(raw / f"{name}.csv") for name in RAW_TABLES if (raw / f"{name}.csv").exists()}

    vendors = convert_vendors(tables["vendors"], settings, localities, aliases)
    prices, add_ons = convert_prices(tables["price_observations"], vendors, settings)
    converted = {
        "vendors": vendors,
        "price_observations": prices,
        "reviews": convert_reviews(tables["reviews"], vendors),
        "portfolio_media": to_template(tables["portfolio_media"].rename(columns={"date_collected": "collected_date"}),
                                       "portfolio_media"),
        # A quote's category is its vendor's.
        "scenario_quotes": to_template(
            tables["scenario_quotes"].assign(
                category=tables["scenario_quotes"]["vendor_id"].map(vendors.set_index("vendor_id")["category"])
            ),
            "scenario_quotes",
        ),
    }  # fmt: skip
    placed = (tables["vendors"]["base_area"] == "Other") & (vendors["base_area"] != "Other")
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, df in converted.items():
        df.to_csv(out_dir / f"{name}.csv", index=False, encoding="utf-8")
    return {
        "rows": {name: len(df) for name, df in converted.items()},
        "vendors": vendors.groupby("category").size().to_dict(),
        "vendors_in_other_area": int((vendors["base_area"] == "Other").sum()),
        "areas_from_notes": int(placed.sum()),
        "add_ons_left_out": add_ons,
        "unmapped_categories": int(vendors["category"].eq("").sum() + prices["category"].eq("").sum()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path, help="the dataset folder (or its data/raw)")
    parser.add_argument("--out", type=Path, default=RAW_DIR, help="where to write the CSVs (default data/raw)")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    summary = import_dataset(args.folder, args.out)
    print(f"Wrote {', '.join(f'{n}.csv ({r})' for n, r in summary['rows'].items())} to {args.out}")
    print(f"  vendors: {summary['vendors']} ({summary['vendors_in_other_area']} outside the reference areas,")
    print(f"           {summary['areas_from_notes']} placed from the locality in their notes)")
    print(f"  {summary['add_ons_left_out']} air conditioning / heating add-ons left out of the prices")
    if summary["unmapped_categories"]:
        print(f"  {summary['unmapped_categories']} rows with a category not in configs/dataset_import.yaml")
    return 0


if __name__ == "__main__":
    sys.exit(main())
