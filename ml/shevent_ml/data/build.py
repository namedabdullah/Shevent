"""Build data/processed/ from a raw export.

    python -m shevent_ml.data.build                       # data/raw -> data/processed
    python -m shevent_ml.data.build --raw D:/export --out data/processed

Rows the models can't use (unknown vendor, wrong unit, missing price or date, duplicates) are dropped and
counted in manifest.json. Run scripts/validate_data.py first and fix what it reports, so little is dropped.
manifest.json also holds dataset_hash: log it as the dataset version of every training run.
"""

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from shevent_ml.config import PROCESSED_DIR, RAW_DIR, REFERENCE_DIR, load_config
from shevent_ml.data.clean import duplicate_prices, map_area, map_area_list, normalize_units, scrub_phone_numbers
from shevent_ml.data.cpi import cpi_factors
from shevent_ml.data.load import RAW_TABLES, load_raw, load_reference, read_export_csv
from shevent_ml.data.survey import build_survey

OUTPUT_TABLES = ["vendors", "vendor_areas", "prices", "quotes", "reviews", "media", "survey"]

VENDOR_COLUMNS = [
    "vendor_id",
    "name",
    "category",
    "sub_type",
    "base_area",
    "areas_served",
    "capacity_min",
    "capacity_max",
    "price_tier",
    "event_types",
    "rating",
    "review_count",
    "years_active",
]
PRICE_COLUMNS = [
    "obs_id",
    "vendor_id",
    "category",
    "sub_type",
    "area",
    "price_tier",
    "package_name",
    "unit",
    "price_basis",
    "unit_note",
    "low_pkr",
    "high_pkr",
    "cpi_factor",
    "low_pkr_adj",
    "high_pkr_adj",
    "mid_pkr_adj",
    "guest_min",
    "guest_max",
    "hours",
    "event_type",
    "season_note",
    "is_combo",
    "inclusions",
    "exclusions",
    "price_date",
    "source_type",
    "confidence",
]
QUOTE_COLUMNS = [
    "quote_id",
    "vendor_id",
    "category",
    "scenario_id",
    "event_type",
    "guests",
    "hours",
    "area",
    "venue_type",
    "day",
    "event_month",
    "unit",
    "price_basis",
    "unit_note",
    "price_pkr",
    "cpi_factor",
    "price_pkr_adj",
    "inclusions",
    "exclusions",
    "negotiable",
    "quote_date",
]
REVIEW_COLUMNS = ["review_id", "vendor_id", "rating", "text", "language", "source", "review_date"]
MEDIA_COLUMNS = ["media_id", "vendor_id", "file_name", "source_url", "category_hint", "collected_date"]


class DropLog:
    """Counts the rows each step removes, by table and reason, for manifest.json."""

    def __init__(self):
        self.counts = defaultdict(Counter)

    def keep(self, table, df, mask, reason):
        self.counts[table][reason] += int((~mask).sum())
        return df[mask]

    def as_dict(self):
        return {
            table: {reason: n for reason, n in reasons.items() if n}
            for table, reasons in self.counts.items()
            if any(reasons.values())
        }


def to_number(series):
    return pd.to_numeric(series, errors="coerce")


def to_date(series):
    return pd.to_datetime(series, format="%Y-%m-%d", errors="coerce")


def unit_allowed(df, ref):
    allowed = [
        unit in ref["category_units"].get(category, ())
        for unit, category in zip(df["unit"], df["category"], strict=True)
    ]
    return pd.Series(allowed, index=df.index, dtype=bool)


def apply_cpi(df, dates, cpi):
    factor = cpi_factors(dates, cpi["reference_month"], cpi.get("monthly_index"), cpi["fallback_annual_rate"])
    return df.assign(
        cpi_factor=factor,
        low_pkr_adj=(df["low_pkr"] * factor).round(),
        high_pkr_adj=(df["high_pkr"] * factor).round(),
        mid_pkr_adj=((df["low_pkr"] + df["high_pkr"]) / 2 * factor).round(),
    )


def build_vendors(df, ref, log):
    df = log.keep(
        "vendors",
        df,
        (df["vendor_id"] != "") & df["category"].isin(ref["category_units"]),
        "missing vendor_id or unknown category",
    )
    df = log.keep("vendors", df, ~df["vendor_id"].duplicated(), "duplicate vendor_id")
    out = df.copy()
    aliases = ref["area_aliases"]
    out["base_area"] = out["base_area"].map(lambda a: map_area(a, aliases))
    # Built as an object Series, so an export with no vendors yet still has a text column.
    out["areas_served"] = pd.Series(
        [
            "|".join(sorted(set(map_area_list(served, aliases)) | ({base} if base else set())))
            for served, base in zip(out["areas_served"], out["base_area"], strict=True)
        ],
        index=out.index,
        dtype=object,
    )
    out["event_types"] = out["event_types"].map(lambda v: "|".join(sorted(filter(None, v.split("|")))))
    for col in ["capacity_min", "capacity_max", "rating", "review_count", "years_active"]:
        out[col] = to_number(out[col])
    return out[VENDOR_COLUMNS]


def build_vendor_areas(vendors):
    """One row per vendor and area served (base area included), for location matching."""
    long = vendors[["vendor_id", "areas_served"]].assign(area=vendors["areas_served"].str.split("|"))
    long = long.explode("area")
    return long.loc[long["area"].fillna("") != "", ["vendor_id", "area"]]


def build_prices(df, vendors, ref, settings, log):
    table = "price_observations"
    out = df.assign(
        low_pkr=to_number(df["price_min_pkr"]),
        high_pkr=to_number(df["price_max_pkr"]),
        guest_min=to_number(df["guest_min"]),
        guest_max=to_number(df["guest_max"]),
        hours=to_number(df["hours"]),
        price_date=to_date(df["price_date"]),
    )
    # A single "starting from" price has no maximum.
    out["high_pkr"] = out["high_pkr"].fillna(out["low_pkr"])

    out = log.keep(table, out, out["vendor_id"].isin(vendors["vendor_id"]), "unknown vendor")
    out = log.keep(table, out, unit_allowed(out, ref), "unit not used for this category")
    out = log.keep(table, out, (out["low_pkr"] > 0) & (out["high_pkr"] >= out["low_pkr"]), "missing or invalid price")
    out = log.keep(table, out, out["price_date"].notna(), "missing or invalid price_date")
    out = log.keep(table, out, ~duplicate_prices(out), "duplicate price")

    # Area and tier come from the vendor; the price's own category is kept, because combo packages differ.
    vendor_info = vendors.set_index("vendor_id")[["base_area", "sub_type", "price_tier"]]
    out = out.join(vendor_info, on="vendor_id").rename(columns={"base_area": "area"})
    out["is_combo"] = out["notes"].str.contains("combo", case=False)

    out = normalize_units(out, settings["default_hours"])
    out = log.keep(table, out, out["low_pkr"].notna(), "per_hour price without hours")
    out = apply_cpi(out, out["price_date"], settings["cpi"])
    return out[PRICE_COLUMNS]


def build_quotes(df, vendors, ref, settings, log):
    """Scenario quotes, joined to the scenario they answer. These stay in the test set."""
    table = "scenario_quotes"
    scenarios = ref["scenarios"].assign(
        guests=lambda s: to_number(s["guests"]),
        hours=lambda s: to_number(s["hours"]),
        event_month=lambda s: pd.to_datetime(s["month"], format="%B %Y").dt.strftime("%Y-%m"),
        area=lambda s: s["area"].map(lambda a: map_area(a, ref["area_aliases"])),
    )[["scenario_id", "event_type", "guests", "hours", "area", "venue_type", "day", "event_month"]]

    out = df.assign(low_pkr=to_number(df["quoted_pkr"]), quote_date=to_date(df["quote_date"]))
    out["high_pkr"] = out["low_pkr"]
    out = log.keep(table, out, out["vendor_id"].isin(vendors["vendor_id"]), "unknown vendor")
    out = log.keep(table, out, out["scenario_id"].isin(scenarios["scenario_id"]), "unknown scenario")
    out = log.keep(table, out, unit_allowed(out, ref), "unit not used for this category")
    out = log.keep(table, out, out["low_pkr"] > 0, "missing or invalid price")
    out = log.keep(table, out, out["quote_date"].notna(), "missing or invalid quote_date")

    out = out.merge(scenarios, on="scenario_id", how="left")
    out = normalize_units(out, settings["default_hours"])
    out = apply_cpi(out, out["quote_date"], settings["cpi"])
    out = out.rename(columns={"low_pkr": "price_pkr", "low_pkr_adj": "price_pkr_adj"})
    return out[QUOTE_COLUMNS]


def build_reviews(df, vendors, log):
    table = "reviews"
    out = df.assign(
        rating=to_number(df["rating"]), review_date=to_date(df["review_date"]), text=scrub_phone_numbers(df["text"])
    )
    out = log.keep(table, out, out["vendor_id"].isin(vendors["vendor_id"]), "unknown vendor")
    out = log.keep(table, out, out["text"] != "", "empty text")
    repeated = out.assign(_text=out["text"].str.lower()).duplicated(subset=["vendor_id", "_text"])
    out = log.keep(table, out, ~repeated, "duplicate review")
    return out[REVIEW_COLUMNS]


def build_media(df, vendors, log):
    table = "portfolio_media"
    out = df.assign(collected_date=to_date(df["collected_date"]))
    out = log.keep(table, out, out["vendor_id"].isin(vendors["vendor_id"]), "unknown vendor")
    out = log.keep(table, out, out["file_name"] != "", "missing file_name")
    out = log.keep(table, out, ~out["file_name"].duplicated(), "duplicate file_name")
    return out[MEDIA_COLUMNS]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dataset_hash(raw_files, settings):
    """Changes whenever the raw export, the reference lists or the settings change."""
    parts = dict(raw_files)
    parts.update({f"reference/{p.name}": sha256(p) for p in sorted(REFERENCE_DIR.glob("*.csv"))})
    parts["settings"] = settings
    return hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()[:12]


def build(raw_dir=RAW_DIR, out_dir=PROCESSED_DIR, settings=None):
    settings = settings or load_config("pipeline")
    ref = load_reference()
    raw = load_raw(raw_dir)
    if "vendors" not in raw:
        raise FileNotFoundError(f"{raw_dir / 'vendors.csv'} not found; every other table links to vendors")

    log = DropLog()
    vendors = build_vendors(raw["vendors"], ref, log)
    tables = {"vendors": vendors, "vendor_areas": build_vendor_areas(vendors)}
    if "price_observations" in raw:
        tables["prices"] = build_prices(raw["price_observations"], vendors, ref, settings, log)
    if "scenario_quotes" in raw:
        tables["quotes"] = build_quotes(raw["scenario_quotes"], vendors, ref, settings, log)
    if "reviews" in raw:
        tables["reviews"] = build_reviews(raw["reviews"], vendors, log)
    if "portfolio_media" in raw:
        tables["media"] = build_media(raw["portfolio_media"], vendors, log)
    # The host survey has no template: Google Forms names the columns after the questions.
    survey_path = raw_dir / "host_survey.csv"
    if survey_path.exists():
        tables["survey"] = build_survey(read_export_csv(survey_path), ref["area_aliases"])

    out_dir.mkdir(parents=True, exist_ok=True)
    for name in OUTPUT_TABLES:
        (out_dir / f"{name}.parquet").unlink(missing_ok=True)
    for name, df in tables.items():
        df.reset_index(drop=True).to_parquet(out_dir / f"{name}.parquet", index=False)

    raw_files = {f"{name}.csv": sha256(raw_dir / f"{name}.csv") for name in RAW_TABLES if name in raw}
    if survey_path.exists():
        raw_files["host_survey.csv"] = sha256(survey_path)
    manifest = {
        "dataset_hash": dataset_hash(raw_files, settings),
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "raw_files": raw_files,
        "settings": settings,
        "rows": {name: len(df) for name, df in tables.items()},
        "dropped": log.as_dict(),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--raw", type=Path, default=RAW_DIR, help="folder with the exported CSVs")
    parser.add_argument("--out", type=Path, default=PROCESSED_DIR, help="where to write the parquet tables")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    manifest = build(args.raw, args.out)
    print(f"Dataset {manifest['dataset_hash']} written to {args.out}")
    for name, rows in manifest["rows"].items():
        print(f"  {name:<14} {rows:>5} rows")
    for table, reasons in manifest["dropped"].items():
        for reason, rows in reasons.items():
            print(f"  dropped from {table}: {rows} x {reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
