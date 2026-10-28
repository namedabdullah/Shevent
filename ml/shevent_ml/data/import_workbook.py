"""Convert the vendor research workbook (Shevent_Lahore_Vendor_Dataset_*.xlsx) into the export CSVs.

    python -m shevent_ml.data.import_workbook data/Shevent_Lahore_Vendor_Dataset_EXPANDED.xlsx
    python -m shevent_ml.data.import_workbook <workbook> --out data/raw

Writes vendors.csv and price_observations.csv in the template format (data/templates/), ready for
scripts/validate_data.py and python -m shevent_ml.data.build. What it does:

- Vendors from "Vendor Directory" and "NEW Leads ..." get project IDs by category (VEN-001, CAT-001, ...); the
  workbook ID (SHV-...) is kept in notes. Phone numbers and street addresses are never copied.
- Localities are mapped to the reference areas where certain (configs/workbook_import.yaml); others become "Other"
  with the locality in notes. Capacity, tier, rating and event types aren't in the workbook, so they stay blank.
- Prices come from "Published Prices" plus the per-head rates that only appear in the vendor directory. Venue menu
  rates are catering prices, as the workbook files them. Bundled packages are marked as combos, so the price model
  leaves them out. A price without a date gets the research date, lower confidence and a note saying so.
"""

import argparse
import re
import sys
from pathlib import Path

import pandas as pd

from shevent_ml.config import RAW_DIR, TEMPLATE_DIR, load_config
from shevent_ml.data.load import load_reference

CATEGORIES = {
    "Venues": "venue",
    "Catering": "catering",
    "Decoration": "decor",
    "DJ / Sound": "dj_sound",
    "DJ/Sound": "dj_sound",
    "Lighting": "lighting",
    "Photography": "photography",
    "Photographers": "photography",
    "Photography / Video": "photography",
    "Photo & Video": "photography",
}
PREFIX = {"venue": "VEN", "catering": "CAT", "decor": "DEC", "dj_sound": "DJS", "lighting": "LGT", "photography": "PHO"}
UNITS = {
    "per head": "per_head",
    "per setup": "per_setup",
    "per event": "per_event",
    "per hour": "per_hour",
    "per booking": "per_event",
}
SOURCE_TYPES = {
    "official website": "website",
    "vendor directory": "directory",
    "venue directory": "directory",
    "public web directory / supplier website": "directory",
    "public business listing": "google_maps",
}
EVENT_WORDS = [
    ("mehndi", "wedding_mehndi"),
    ("dholki", "wedding_mehndi"),
    ("mayun", "wedding_mehndi"),
    ("nikah", "engagement"),
    ("engagement", "engagement"),
    ("birthday", "birthday"),
]
# Words in a workbook "Scope" that mark a lower-confidence price.
LOW_CONFIDENCE_SCOPES = ("calculator example", "unspecified package", "ambiguous")


def normalise_name(name):
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def venue_type(name, services):
    """Only what the name or the listed services say outright; otherwise blank."""
    text = f"{name} {services}".lower()
    for word, kind in [
        ("marquee", "marquee"),
        ("farmhouse", "farmhouse"),
        ("lawn", "lawn"),
        ("garden", "lawn"),
        ("hotel", "hotel"),
        ("banquet", "banquet"),
        ("hall", "banquet"),
        ("event complex", "banquet"),
    ]:
        if word in text:
            return kind
    return ""


def dj_type(name, services):
    """The name decides first ('Al Wahab Sound System' rents sound even if it lists a DJ), then the services."""
    for text in (name.lower(), services.lower()):
        words = re.findall(r"[a-z]+", text)
        if "dj" in words:
            return "dj"
        if "sound" in words:
            return "sound_system"
    return ""


def read_vendors(workbook):
    """Both vendor sheets, on one set of column names."""
    sheets = []
    for sheet in workbook.sheet_names:
        if sheet == "Vendor Directory" or sheet.startswith("NEW Leads"):
            df = workbook.parse(sheet, dtype=str).fillna("")
            df = df.rename(
                columns={
                    "ID": "Vendor ID",
                    "Vendor": "Vendor name",
                    "Area": "Locality",
                    "Listed price minimum PKR": "Listed price low PKR",
                    "Listed price maximum PKR": "Listed price high PKR",
                    "Pricing scope": "Price unit / scope",
                }
            )
            sheets.append(df.assign(sheet=sheet))
    vendors = pd.concat(sheets, ignore_index=True)
    return vendors[vendors["Vendor ID"].str.strip() != ""]


def build_vendor_rows(raw, settings, area_aliases):
    rows, skipped = [], []
    counters = dict.fromkeys(PREFIX.values(), 0)
    for r in raw.itertuples(index=False):
        record = r._asdict()
        category = CATEGORIES.get(record["Primary_category"].strip())
        if category is None:
            skipped.append((record["Vendor_ID"], f"unknown category '{record['Primary_category']}'"))
            continue
        counters[PREFIX[category]] += 1
        locality = record["Locality"].strip()
        area = settings["locality_areas"].get(locality) or area_aliases.get(locality.lower())
        notes = [f"workbook id {record['Vendor_ID']}"]
        if not area:
            area = "Other"
            notes.append("locality not stated" if locality.lower() in ("", "lahore") else f"locality: {locality}")
        services = record["Advertised_services"]
        sub_type = {"venue": venue_type, "dj_sound": dj_type}.get(category, lambda *_: "")(
            record["Vendor_name"], services
        )
        url = record["Source_URL"]
        source = record["Source_type"].strip().lower()
        notes.append(f"services: {services}" if services else "")
        notes.append(f"verification: {record['Verification_status']}")
        if url and "google.com/maps" not in url and source != "official website":
            notes.append(f"source: {url}")
        rows.append(
            {
                "vendor_id": f"{PREFIX[category]}-{counters[PREFIX[category]]:03}",
                "name": record["Vendor_name"].strip(),
                "category": category,
                "sub_type": sub_type,
                "base_area": area,
                "maps_url": url if "google.com/maps" in url else "",
                "website_url": url if source == "official website" else "",
                "reached_by_us": "no",
                "collected_by": settings["collected_by"],
                "collected_date": record["Research_date"][:10],
                "notes": "; ".join(n for n in notes if n),
                "_workbook_id": record["Vendor_ID"],
                "_name_key": normalise_name(record["Vendor_name"]),
                "_source": source,
            }
        )
    return pd.DataFrame(rows), skipped


def to_number(value):
    number = pd.to_numeric(str(value).replace(",", ""), errors="coerce")
    return "" if pd.isna(number) else f"{number:g}"


def guest_range(text):
    text = text.lower()
    span = re.search(r"(\d+)\s*-\s*(\d+)\s*guests", text)
    if span:
        return span.group(1), span.group(2)
    minimum = re.search(r"min\s*(\d+)", text)
    return (minimum.group(1), "") if minimum else ("", "")


def event_type(text):
    text = text.lower()
    return next((kind for word, kind in EVENT_WORDS if word in text), "")


def price_row(vendor, category, package, low, high, unit, scope, date, source, research_date):
    """One price_observations row; returns None for rows that aren't a category price."""
    dated = bool(re.match(r"\d{4}-\d{2}-\d{2}", date))
    confidence = "medium" if source == "website" else "low"
    if any(word in scope.lower() for word in LOW_CONFIDENCE_SCOPES):
        confidence = "low"
    notes = [f"workbook: {scope}" if scope else "workbook price"]
    if "bundle" in f"{package} {scope}".lower():
        notes.append("combo: bundled package, not a standalone rate")
    if not dated:
        notes.append("price date not stated; research date used")
    guest_min, guest_max = guest_range(f"{package} {scope}")
    return {
        "vendor_id": vendor["vendor_id"],
        "category": category,
        "package_name": package,
        "unit": unit,
        "price_min_pkr": low,
        "price_max_pkr": high,
        "guest_min": guest_min,
        "guest_max": guest_max,
        "event_type": event_type(package),
        "season_note": "unspecified",
        "price_date": date[:10] if dated else research_date,
        "source_type": source,
        "source_ref": "",
        "confidence": confidence,
        "notes": "; ".join(notes),
    }


def build_price_rows(workbook, vendors, raw_vendors, settings):
    by_name = vendors.set_index("_name_key")
    by_workbook_id = vendors.set_index("_workbook_id")
    rows, skipped = [], []
    published = workbook.parse("Published Prices", dtype=str).fillna("")
    for p in published.itertuples(index=False):
        record = dict(zip(published.columns, p, strict=True))
        key = normalise_name(record["Vendor"])
        if key not in by_name.index:
            skipped.append((record["Vendor"], "vendor not in the vendor sheets"))
            continue
        vendor = by_name.loc[key]
        package = record["Package / offering"].strip()
        if package in settings["skip_packages"]:
            skipped.append((record["Vendor"], f"'{package}' isn't a category price"))
            continue
        unit = UNITS.get(record["Unit"].strip().lower())
        category = "catering" if unit == "per_head" else CATEGORIES.get(record["Category"].strip())
        source = SOURCE_TYPES.get(record["Source type"].strip().lower(), "directory")
        rows.append(
            price_row(
                vendor,
                category,
                package,
                to_number(record["Min price PKR"]),
                to_number(record["Max price PKR"]),
                unit,
                record["Scope"].strip(),
                record["Listed price date"].strip(),
                source,
                vendor["collected_date"],
            )
        )

    # Directory prices not already in Published Prices: the directory often summarises a vendor's published prices
    # as one range (e.g. 2,900-3,600 for a 2,900 and a 3,600 package), so any shared amount means it's a repeat.
    seen = {(r["vendor_id"], amount) for r in rows for amount in (r["price_min_pkr"], r["price_max_pkr"]) if amount}
    for r in raw_vendors.itertuples(index=False):
        record = r._asdict()
        low = to_number(record["Listed_price_low_PKR"])
        if not low or record["Vendor_ID"] not in by_workbook_id.index:
            continue
        vendor = by_workbook_id.loc[record["Vendor_ID"]]
        high = to_number(record["Listed_price_high_PKR"])
        if (vendor["vendor_id"], low) in seen or (vendor["vendor_id"], high) in seen:
            continue
        scope = record["Price_unit___scope"].strip()
        per_head = "/ head" in scope.lower()
        unit = "per_head" if per_head else "per_event"
        detail = re.sub(r"^PKR\s*/\s*(head\s*)?", "", scope).strip()
        if detail.startswith("(") and detail.endswith(")"):
            detail = detail[1:-1]
        package = f"Per-head {detail}" if per_head else detail
        source = SOURCE_TYPES.get(record["Source_type"].strip().lower(), "directory")
        rows.append(
            price_row(
                vendor,
                "catering" if per_head else vendor["category"],
                package,
                low,
                high,
                unit,
                scope,
                record["Price_date"].strip(),
                source,
                vendor["collected_date"],
            )
        )
    prices = pd.DataFrame(rows)
    prices.insert(0, "obs_id", [f"P-{i:04}" for i in range(1, len(prices) + 1)])
    prices["collected_by"] = settings["collected_by"]
    prices["collected_date"] = prices["vendor_id"].map(vendors.set_index("vendor_id")["collected_date"])
    return prices, skipped


def to_template(df, name):
    columns = pd.read_csv(TEMPLATE_DIR / f"{name}.csv", nrows=0).columns
    return df.reindex(columns=columns).fillna("")


def import_workbook(path, out_dir=RAW_DIR, settings=None):
    settings = settings or load_config("workbook_import")
    workbook = pd.ExcelFile(path)
    raw_vendors = read_vendors(workbook)
    raw_vendors.columns = [re.sub(r"\W", "_", c) for c in raw_vendors.columns]
    vendors, skipped_vendors = build_vendor_rows(raw_vendors, settings, load_reference()["area_aliases"])
    prices, skipped_prices = build_price_rows(workbook, vendors, raw_vendors, settings)

    out_dir.mkdir(parents=True, exist_ok=True)
    to_template(vendors, "vendors").to_csv(out_dir / "vendors.csv", index=False, encoding="utf-8")
    to_template(prices, "price_observations").to_csv(out_dir / "price_observations.csv", index=False, encoding="utf-8")
    return {
        "vendors": vendors.groupby("category").size().to_dict(),
        "vendors_in_other_area": int((vendors["base_area"] == "Other").sum()),
        "prices": prices.groupby(["category", "unit"]).size().to_dict(),
        "combos": int(prices["notes"].str.contains("combo").sum()),
        "undated": int(prices["notes"].str.contains("date not stated").sum()),
        "skipped": skipped_vendors + skipped_prices,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--out", type=Path, default=RAW_DIR, help="where to write the CSVs (default data/raw)")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    summary = import_workbook(args.workbook, args.out)
    print(f"Wrote {args.out / 'vendors.csv'} and price_observations.csv")
    print(f"  vendors: {summary['vendors']} ({summary['vendors_in_other_area']} outside the reference areas)")
    print(f"  prices:  {summary['prices']}")
    print(f"  {summary['combos']} bundled packages marked as combos; {summary['undated']} prices without a date")
    for item, reason in summary["skipped"]:
        print(f"  skipped {item}: {reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
