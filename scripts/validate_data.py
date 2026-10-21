"""Validate the Phase 1 data export and report progress against the collection targets.

Reads the CSVs exported from the team's Google Sheet (see data/DATA_COLLECTION_GUIDE.md),
checks them against the reference lists in data/reference/, and prints:
  1. progress vs. targets
  2. the category x area coverage matrix
  3. every problem found, with the spreadsheet row number so it can be fixed in Sheets

Usage:
    python scripts/validate_data.py data/raw
    python scripts/validate_data.py data/raw --issues-csv data/raw/issues.csv

Exit code is 1 if any errors were found (warnings alone don't fail).
"""

import argparse
import re
import sys
from datetime import date
from pathlib import Path

import pandas as pd

REFERENCE_DIR = Path(__file__).resolve().parent.parent / "data" / "reference"

TARGETS = {
    "vendors": 120,
    "price_observations": 300,
    "scenario_quotes": 25,
    "host_survey": 40,
    "interviews": 3,
    "reviews": 300,
    "portfolio_media": 500,
}
MIN_VENDORS_PER_CELL = 5

# Plausible PKR range per unit. Values outside are flagged as warnings, not errors,
# because real outliers exist (e.g., luxury farmhouses).
PRICE_BOUNDS = {
    "per_head": (150, 25_000),
    "per_hour": (1_000, 500_000),
    "per_event": (5_000, 30_000_000),
    "per_package": (5_000, 30_000_000),
    "per_slot": (10_000, 30_000_000),
    "per_setup": (5_000, 20_000_000),
}
STALE_PRICE_DAYS = 365

PHONE_PATTERN = re.compile(r"(\+92|0092|\b0)\s?3\d{2}[\s-]?\d{7}\b")

TABLE_SPECS = {
    "vendors": {
        "id": "vendor_id",
        "id_pattern": r"^(VEN|CAT|DEC|DJS|LGT)-\d{3}$",
        "required": ["vendor_id", "name", "category", "base_area", "collected_by", "collected_date"],
        "enums": {"price_tier": "price_tier", "reached_by_us": "yes_no"},
        "list_enums": {"event_types": "event_type"},
        "numbers": {"capacity_min": (1, 20_000), "capacity_max": (1, 20_000), "rating": (0, 5),
                    "review_count": (0, 1_000_000), "years_active": (0, 100)},
        "dates": ["collected_date"],
    },
    "price_observations": {
        "id": "obs_id",
        "id_pattern": r"^P-\d{4}$",
        "required": ["obs_id", "vendor_id", "category", "unit", "price_min_pkr", "price_date",
                     "source_type", "collected_by", "collected_date", "confidence"],
        "enums": {"unit": "unit", "event_type": "event_type", "season_note": "season_note",
                  "source_type": "source_type", "confidence": "confidence"},
        "list_enums": {},
        "numbers": {"price_min_pkr": (1, None), "price_max_pkr": (1, None), "guest_min": (1, 20_000),
                    "guest_max": (1, 20_000), "hours": (0.5, 72)},
        "dates": ["price_date", "collected_date"],
    },
    "scenario_quotes": {
        "id": "quote_id",
        "id_pattern": r"^Q-\d{3}$",
        "required": ["quote_id", "vendor_id", "category", "scenario_id", "quoted_pkr", "unit",
                     "quote_date", "collected_by"],
        "enums": {"unit": "unit", "negotiable": "yes_no", "source_type": "source_type"},
        "list_enums": {},
        "numbers": {"quoted_pkr": (1, None)},
        "dates": ["quote_date"],
    },
    "reviews": {
        "id": "review_id",
        "id_pattern": r"^R-\d{4}$",
        "required": ["review_id", "vendor_id", "text", "language", "collected_by", "collected_date"],
        "enums": {"language": "language", "source": "source_type"},
        "list_enums": {},
        "numbers": {"rating": (1, 5)},
        "dates": ["review_date", "collected_date"],
    },
    "portfolio_media": {
        "id": "media_id",
        "id_pattern": r"^M-\d{4}$",
        "required": ["media_id", "vendor_id", "file_name", "source_url", "collected_by", "collected_date"],
        "enums": {},
        "list_enums": {},
        "numbers": {},
        "dates": ["collected_date"],
    },
}


class Issues:
    def __init__(self):
        self.items = []

    def add(self, severity, table, row, column, message):
        self.items.append({"severity": severity, "table": table, "row": row, "column": column, "message": message})

    def error(self, table, row, column, message):
        self.add("ERROR", table, row, column, message)

    def warn(self, table, row, column, message):
        self.add("WARNING", table, row, column, message)

    def count(self, severity):
        return sum(1 for i in self.items if i["severity"] == severity)


def sheet_row(index):
    """Pandas index -> row number as seen in Google Sheets (header is row 1)."""
    return int(index) + 2


def load_reference():
    categories = pd.read_csv(REFERENCE_DIR / "categories.csv", dtype=str)
    areas = pd.read_csv(REFERENCE_DIR / "areas.csv", dtype=str)
    vocab = pd.read_csv(REFERENCE_DIR / "vocab.csv", dtype=str, keep_default_na=False)
    scenarios = pd.read_csv(REFERENCE_DIR / "scenarios.csv", dtype=str)
    return {
        "categories": {
            r.category: {"prefix": r.id_prefix, "units": set(r.allowed_units.split("|")),
                         "sub_types": set(r.sub_types.split("|"))}
            for r in categories.itertuples()
        },
        "areas": set(areas["area"]),
        "core_areas": list(dict.fromkeys(areas.loc[areas["core"] == "yes", "area"])),
        "area_aliases": {a.lower(): c for a, c in zip(areas["alias"], areas["area"])},
        "vocab": vocab.groupby("field")["value"].apply(set).to_dict(),
        "scenarios": set(scenarios["scenario_id"]),
    }


def load_csv(path):
    if not path.exists():
        return None
    df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    df.columns = [c.strip() for c in df.columns]
    df = df.apply(lambda col: col.str.strip())
    df = df[(df != "").any(axis=1)]
    id_col = df.columns[0] if len(df.columns) else None
    if id_col:
        df = df[~df[id_col].str.upper().str.startswith("EXAMPLE")]
    return df


def check_area(value, table, index, column, ref, issues):
    if value in ref["areas"]:
        return
    canonical = ref["area_aliases"].get(value.lower())
    if canonical:
        issues.error(table, sheet_row(index), column, f"'{value}' -> use standard name '{canonical}'")
    else:
        issues.error(table, sheet_row(index), column, f"unknown area '{value}' (use 'Other' and put the name in notes)")


def check_common(table, df, spec, ref, issues):
    """Checks shared by all tables: columns, required fields, IDs, enums, numbers, dates, phone numbers."""
    missing_cols = [c for c in spec["required"] if c not in df.columns]
    for col in missing_cols:
        issues.error(table, 1, col, "column missing from export (header renamed or deleted?)")

    for col in spec["required"]:
        if col in df.columns:
            for index in df.index[df[col] == ""]:
                issues.error(table, sheet_row(index), col, "required value is empty")

    id_col = spec["id"]
    if id_col in df.columns:
        ids = df[id_col]
        for index in ids.index[(ids != "") & ~ids.str.match(spec["id_pattern"])]:
            issues.error(table, sheet_row(index), id_col, f"'{ids[index]}' doesn't match the ID format")
        for index in ids.index[(ids != "") & ids.duplicated(keep="first")]:
            issues.error(table, sheet_row(index), id_col, f"duplicate ID '{ids[index]}'")

    for col, field in spec["enums"].items():
        if col not in df.columns:
            continue
        allowed = ref["vocab"].get(field, set())
        for index, value in df[col].items():
            if value and value not in allowed:
                issues.error(table, sheet_row(index), col, f"'{value}' not allowed; use one of: {', '.join(sorted(allowed))}")

    for col, field in spec["list_enums"].items():
        if col not in df.columns:
            continue
        allowed = ref["vocab"].get(field, set())
        for index, value in df[col].items():
            bad = [v for v in value.split("|") if v and v not in allowed]
            if bad:
                issues.error(table, sheet_row(index), col, f"not allowed: {', '.join(bad)}")

    for col, (low, high) in spec["numbers"].items():
        if col not in df.columns:
            continue
        for index, value in df[col].items():
            if not value:
                continue
            number = pd.to_numeric(value, errors="coerce")
            if pd.isna(number):
                issues.error(table, sheet_row(index), col, f"'{value}' is not a plain number (no commas, 'Rs', 'k' or 'lakh')")
            elif number < low or (high is not None and number > high):
                issues.error(table, sheet_row(index), col, f"{value} is outside the valid range")

    today = pd.Timestamp(date.today())
    for col in spec["dates"]:
        if col not in df.columns:
            continue
        for index, value in df[col].items():
            if not value:
                continue
            parsed = pd.to_datetime(value, format="%Y-%m-%d", errors="coerce")
            if pd.isna(parsed):
                issues.error(table, sheet_row(index), col, f"'{value}' is not a YYYY-MM-DD date")
            elif parsed > today:
                issues.error(table, sheet_row(index), col, f"{value} is in the future")

    for col in df.columns:
        for index, value in df[col].items():
            if value and PHONE_PATTERN.search(value):
                issues.error(table, sheet_row(index), col, "looks like a phone number; move it to the private contacts sheet")


def check_vendor_link(table, df, vendors, issues):
    """Every row must point at an existing vendor; returns that vendor's category per row."""
    known = dict(zip(vendors["vendor_id"], vendors["category"])) if vendors is not None else {}
    for index, vendor_id in df["vendor_id"].items():
        if vendor_id and vendor_id not in known:
            issues.error(table, sheet_row(index), "vendor_id", f"'{vendor_id}' not found in vendors")
    return known


def check_unit_and_price(table, df, index, category, unit, price, ref, issues):
    if category in ref["categories"] and unit and unit not in ref["categories"][category]["units"]:
        allowed = ", ".join(sorted(ref["categories"][category]["units"]))
        issues.error(table, sheet_row(index), "unit", f"'{unit}' isn't used for {category}; use one of: {allowed}")
    number = pd.to_numeric(price, errors="coerce")
    if unit in PRICE_BOUNDS and not pd.isna(number) and number > 0:
        low, high = PRICE_BOUNDS[unit]
        if not low <= number <= high:
            issues.warn(table, sheet_row(index), "price", f"{int(number):,} PKR {unit} looks unusual; double-check it")


def check_vendors(df, ref, issues):
    table = "vendors"
    for index, row in df.iterrows():
        category = row.get("category", "")
        if category and category not in ref["categories"]:
            issues.error(table, sheet_row(index), "category", f"unknown category '{category}'")
            continue
        if category:
            info = ref["categories"][category]
            if row["vendor_id"] and not row["vendor_id"].startswith(info["prefix"] + "-"):
                issues.error(table, sheet_row(index), "vendor_id", f"{category} vendors use the '{info['prefix']}-' prefix")
            if row.get("sub_type") and row["sub_type"] not in info["sub_types"]:
                issues.error(table, sheet_row(index), "sub_type", f"'{row['sub_type']}' isn't a {category} sub-type")
        if row.get("base_area"):
            check_area(row["base_area"], table, index, "base_area", ref, issues)
        for area in filter(None, row.get("areas_served", "").split("|")):
            check_area(area, table, index, "areas_served", ref, issues)
        cap_min = pd.to_numeric(row.get("capacity_min", ""), errors="coerce")
        cap_max = pd.to_numeric(row.get("capacity_max", ""), errors="coerce")
        if not pd.isna(cap_min) and not pd.isna(cap_max) and cap_min > cap_max:
            issues.error(table, sheet_row(index), "capacity_min", "capacity_min is larger than capacity_max")

    names = df["name"].str.lower().str.replace(r"[^a-z0-9]", "", regex=True) + "|" + df["category"]
    for index in names.index[names.duplicated(keep="first")]:
        issues.warn(table, sheet_row(index), "name", f"'{df.at[index, 'name']}' may be a duplicate vendor")


def check_prices(df, vendors, ref, issues):
    table = "price_observations"
    vendor_category = check_vendor_link(table, df, vendors, issues)
    today = pd.Timestamp(date.today())
    for index, row in df.iterrows():
        category = row["category"]
        if category and category not in ref["categories"]:
            issues.error(table, sheet_row(index), "category", f"unknown category '{category}'")
            continue
        owner = vendor_category.get(row["vendor_id"])
        if owner and category and owner != category:
            issues.warn(table, sheet_row(index), "category",
                        f"vendor is '{owner}' but price is '{category}' (OK only for combo packages; note 'combo')")
        check_unit_and_price(table, df, index, category, row["unit"], row["price_min_pkr"], ref, issues)
        low = pd.to_numeric(row["price_min_pkr"], errors="coerce")
        high = pd.to_numeric(row.get("price_max_pkr", ""), errors="coerce")
        if not pd.isna(low) and not pd.isna(high) and low > high:
            issues.error(table, sheet_row(index), "price_max_pkr", "price_min_pkr is larger than price_max_pkr")
        price_date = pd.to_datetime(row["price_date"], format="%Y-%m-%d", errors="coerce")
        if not pd.isna(price_date) and (today - price_date).days > STALE_PRICE_DAYS and row["confidence"] != "low":
            issues.warn(table, sheet_row(index), "confidence", "price is over a year old; set confidence to 'low'")


def check_quotes(df, vendors, ref, issues):
    table = "scenario_quotes"
    check_vendor_link(table, df, vendors, issues)
    for index, row in df.iterrows():
        if row["scenario_id"] and row["scenario_id"] not in ref["scenarios"]:
            issues.error(table, sheet_row(index), "scenario_id", f"'{row['scenario_id']}' must be one of {sorted(ref['scenarios'])}")
        check_unit_and_price(table, df, index, row["category"], row["unit"], row["quoted_pkr"], ref, issues)
    pairs = df["vendor_id"] + "|" + df["scenario_id"]
    for index in pairs.index[pairs.duplicated(keep="first")]:
        issues.warn(table, sheet_row(index), "scenario_id", "this vendor already has a quote for this scenario")


def check_reviews(df, vendors, issues):
    table = "reviews"
    check_vendor_link(table, df, vendors, issues)
    text = df["text"].str.lower().str.strip()
    for index in text.index[(text != "") & text.duplicated(keep="first")]:
        issues.warn(table, sheet_row(index), "text", "same review text appears earlier")


def check_media(df, vendors, issues):
    table = "portfolio_media"
    check_vendor_link(table, df, vendors, issues)
    for index, row in df.iterrows():
        if row["file_name"] and row["vendor_id"] and not row["file_name"].startswith(row["vendor_id"] + "_"):
            issues.warn(table, sheet_row(index), "file_name", f"should be named '{row['vendor_id']}_NN.jpg'")
    for index in df.index[(df["file_name"] != "") & df["file_name"].duplicated(keep="first")]:
        issues.error(table, sheet_row(index), "file_name", "duplicate file name")


def coverage_matrix(vendors, ref):
    categories = list(ref["categories"])
    matrix = pd.DataFrame(0, index=categories, columns=ref["core_areas"])
    if vendors is None:
        return matrix
    for _, row in vendors.iterrows():
        if row["category"] not in categories:
            continue
        served = {row["base_area"], *filter(None, row.get("areas_served", "").split("|"))}
        for area in served & set(ref["core_areas"]):
            matrix.at[row["category"], area] += 1
    return matrix


def print_progress(counts, extras):
    print("PROGRESS vs TARGETS")
    for name, target in TARGETS.items():
        have = counts.get(name)
        if have is None:
            print(f"  {name:<20} (no file)")
            continue
        pct = min(100, round(100 * have / target))
        bar = "#" * (pct // 5) + "." * (20 - pct // 5)
        print(f"  {name:<20} {have:>5} / {target:<5} [{bar}] {pct}%")
    for line in extras:
        print(f"  {line}")
    print()


def print_coverage(matrix):
    print(f"COVERAGE (vendors per category x core area, target >= {MIN_VENDORS_PER_CELL})")
    print(matrix.to_string())
    gaps = [(c, a, int(matrix.at[c, a])) for c in matrix.index for a in matrix.columns
            if matrix.at[c, a] < MIN_VENDORS_PER_CELL]
    filled = matrix.size - len(gaps)
    print(f"\n  Cells at target: {filled}/{matrix.size} ({round(100 * filled / matrix.size)}%)")
    if gaps:
        gaps.sort(key=lambda g: g[2])
        print("  Needs more vendors: " + ", ".join(f"{c} x {a} ({n})" for c, a, n in gaps))
    print()


def print_issues(issues):
    print(f"ISSUES: {issues.count('ERROR')} errors, {issues.count('WARNING')} warnings")
    for item in sorted(issues.items, key=lambda i: (i["severity"] != "ERROR", i["table"], i["row"])):
        print(f"  {item['severity']:<7} {item['table']} row {item['row']} [{item['column']}]: {item['message']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("data_dir", type=Path, help="folder with the exported CSVs (e.g., data/raw)")
    parser.add_argument("--issues-csv", type=Path, help="also write all issues to this CSV (to send back to the collector)")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    ref = load_reference()
    issues = Issues()
    tables = {name: load_csv(args.data_dir / f"{name}.csv") for name in TABLE_SPECS}

    if (args.data_dir / "private_contacts.csv").exists():
        issues.error("private_contacts", 0, "-", "private contacts file must NOT be in the shared export; delete it")

    for name, df in tables.items():
        if df is not None:
            check_common(name, df, TABLE_SPECS[name], ref, issues)

    vendors = tables["vendors"]
    if vendors is not None:
        check_vendors(vendors, ref, issues)
    if tables["price_observations"] is not None:
        check_prices(tables["price_observations"], vendors, ref, issues)
    if tables["scenario_quotes"] is not None:
        check_quotes(tables["scenario_quotes"], vendors, ref, issues)
    if tables["reviews"] is not None:
        check_reviews(tables["reviews"], vendors, issues)
    if tables["portfolio_media"] is not None:
        check_media(tables["portfolio_media"], vendors, issues)

    counts = {name: len(df) for name, df in tables.items() if df is not None}
    survey = load_csv(args.data_dir / "host_survey.csv")
    if survey is not None:
        counts["host_survey"] = len(survey)
    interviews_dir = args.data_dir / "interviews"
    if interviews_dir.exists():
        counts["interviews"] = len(list(interviews_dir.glob("*.md")))

    extras = []
    quotes = tables["scenario_quotes"]
    if quotes is not None and len(quotes):
        per_category = quotes.groupby("category")["vendor_id"].nunique().to_dict()
        extras.append("quoting vendors per category: " + ", ".join(f"{c}={n}" for c, n in per_category.items()))
    reviews = tables["reviews"]
    if reviews is not None and len(reviews):
        local = reviews["language"].isin(["roman_ur", "mixed", "ur"]).mean()
        extras.append(f"reviews in Urdu / Roman Urdu / mixed: {round(100 * local)}% (target >= 30%)")

    print()
    print_progress(counts, extras)
    print_coverage(coverage_matrix(vendors, ref))
    print_issues(issues)

    if args.issues_csv:
        pd.DataFrame(issues.items, columns=["severity", "table", "row", "column", "message"]).to_csv(
            args.issues_csv, index=False, encoding="utf-8-sig")
        print(f"\nIssues written to {args.issues_csv}")

    return 1 if issues.count("ERROR") else 0


if __name__ == "__main__":
    sys.exit(main())
