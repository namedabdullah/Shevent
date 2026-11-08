"""Put the collected vendors in the app database, so the apps and the model server show real Lahore vendors.

    python -m shevent_ml.data.app_seed     # data/processed/vendors.parquet -> supabase/seeds/collected_vendors.sql

Then load the file:

    local:   pnpm db:reset   (runs supabase/seed.sql, then supabase/seeds/*.sql)
             or, keeping the data you have: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -1 -f FILE
    hosted:  psql "<connection string from Dashboard > Connect>" -1 -f FILE

Only public listing facts are written: business name, category, type, base area and areas served. No phone numbers,
addresses or people's names; those stay in the private sheet. The file is git-ignored like the rest of the collected
data. Each vendor's id is a UUID derived from its research vendor_id, so loading again updates rows in place, and
the model server can match listed prices (prices.parquet) to app vendors. Listings start unverified, unclaimed and
without consent to an indexable profile. Loading again never touches those three, or a listing its owner has
claimed.
"""

import argparse
import re
import sys
import uuid
from pathlib import Path

import pandas as pd

from shevent_ml.config import CATEGORIES, PROCESSED_DIR, REPO_ROOT
from shevent_ml.models.price_features import AREAS, EVENT_TYPES, TIER_RANK

SEED_FILE = REPO_ROOT / "supabase" / "seeds" / "collected_vendors.sql"
# Fixed forever: changing it would give every collected vendor a new id in the app.
NAMESPACE = uuid.UUID("5b0c1f3e-6a51-4d6e-9c8a-2f4e7d9b3a10")
MAX_SLUG = 80


def app_vendor_id(research_id):
    """The app's id (public.vendors.id) for a collected vendor."""
    return str(uuid.uuid5(NAMESPACE, research_id))


def slug(name, research_id):
    """URL slug: the name in lowercase ASCII words, then the research id, which keeps it unique."""
    suffix = research_id.lower()
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[: MAX_SLUG - len(suffix) - 1].strip("-")
    return f"{base}-{suffix}" if base else suffix


def sql_text(value):
    return "null" if value is None else "'" + str(value).replace("'", "''") + "'"


def sql_array(values, enum):
    if not values:
        return f"'{{}}'::public.{enum}[]"
    return f"array[{', '.join(sql_text(v) for v in values)}]::public.{enum}[]"


def _split(value):
    return [v for v in str(value or "").split("|") if v]


def _int_or_null(value):
    return "null" if pd.isna(value) else str(int(value))


def vendor_rows(vendors):
    """The collected vendors as public.vendors values, skipping anything the database would reject."""
    rows = []
    for v in vendors.itertuples():
        name = str(v.name).strip()
        if v.category not in CATEGORIES or v.base_area not in AREAS or not 2 <= len(name) <= 120:
            continue
        areas = [a for a in dict.fromkeys([v.base_area, *_split(v.areas_served)]) if a in AREAS]
        cap_min, cap_max = v.capacity_min, v.capacity_max
        if pd.notna(cap_min) and pd.notna(cap_max) and cap_min > cap_max:
            cap_min = cap_max = float("nan")
        years = v.years_active if pd.notna(v.years_active) and 0 <= v.years_active <= 100 else float("nan")
        rows.append(
            {
                "id": app_vendor_id(v.vendor_id),
                "slug": slug(name, v.vendor_id),
                "name": name,
                "category": v.category,
                "sub_type": (str(v.sub_type).strip()[:40] or None) if pd.notna(v.sub_type) else None,
                "base_area": v.base_area,
                "areas_served": areas,
                "capacity_min": cap_min if pd.notna(cap_min) and cap_min > 0 else float("nan"),
                "capacity_max": cap_max if pd.notna(cap_max) and cap_max > 0 else float("nan"),
                "price_tier": v.price_tier if v.price_tier in TIER_RANK else None,
                "event_types": [e for e in _split(v.event_types) if e in EVENT_TYPES],
                "years_active": years,
            }
        )
    return rows


def seed_sql(rows):
    values = ",\n".join(
        "  ("
        + ", ".join(
            [
                sql_text(r["id"]),
                sql_text(r["slug"]),
                sql_text(r["name"]),
                sql_text(r["category"]),
                sql_text(r["sub_type"]),
                sql_text(r["base_area"]),
                sql_array(r["areas_served"], "lahore_area"),
                _int_or_null(r["capacity_min"]),
                _int_or_null(r["capacity_max"]),
                sql_text(r["price_tier"]),
                sql_array(r["event_types"], "event_type"),
                _int_or_null(r["years_active"]),
            ]
        )
        + ")"
        for r in rows
    )
    columns = [
        "slug", "name", "category", "sub_type", "base_area", "areas_served", "capacity_min", "capacity_max",
        "price_tier", "event_types", "years_active",
    ]  # fmt: skip
    updates = ",\n  ".join(f"{c} = excluded.{c}" for c in columns)
    return f"""-- Collected vendors (python -m shevent_ml.data.app_seed). Generated: don't edit, and don't commit.
-- Public listing facts only. Load with psql -1 (one transaction) or pnpm db:reset.

insert into public.vendors
  (id, {", ".join(columns)})
values
{values}
on conflict (id) do update set
  {updates}
-- A listing its owner has claimed is theirs to edit.
where public.vendors.owner_id is null;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset")
    parser.add_argument("--out", type=Path, default=SEED_FILE)
    args = parser.parse_args()

    vendors = pd.read_parquet(args.processed / "vendors.parquet")
    rows = vendor_rows(vendors)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(seed_sql(rows), encoding="utf-8")
    print(f"{len(rows)} of {len(vendors)} vendors written to {args.out}")
    for category, count in pd.Series([r["category"] for r in rows]).value_counts().items():
        print(f"  {category:<12} {count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
