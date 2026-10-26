"""Read the daily CSV export and the reference lists, with the same reading rules as scripts/validate_data.py."""

import pandas as pd

from shevent_ml.config import REFERENCE_DIR, TEMPLATE_DIR

RAW_TABLES = ["vendors", "price_observations", "scenario_quotes", "reviews", "portfolio_media"]


def read_export_csv(path):
    """All columns as stripped strings, with blank rows and the template's EXAMPLE rows removed."""
    df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    df.columns = [c.strip() for c in df.columns]
    df = df.apply(lambda col: col.str.strip())
    df = df[(df != "").any(axis=1)]
    if len(df.columns):
        df = df[~df[df.columns[0]].str.upper().str.startswith("EXAMPLE")]
    return df.reset_index(drop=True)


def load_raw(raw_dir):
    """Every export table found in raw_dir. Optional columns missing from the export are added as blanks."""
    tables = {}
    for name in RAW_TABLES:
        path = raw_dir / f"{name}.csv"
        if not path.exists():
            continue
        df = read_export_csv(path)
        template_columns = pd.read_csv(TEMPLATE_DIR / f"{name}.csv", nrows=0).columns
        tables[name] = df.reindex(columns=list(dict.fromkeys([*template_columns, *df.columns])), fill_value="")
    return tables


def load_reference(reference_dir=REFERENCE_DIR):
    areas = pd.read_csv(reference_dir / "areas.csv", dtype=str)
    categories = pd.read_csv(reference_dir / "categories.csv", dtype=str)
    return {
        "area_aliases": {alias.lower(): area for alias, area in zip(areas["alias"], areas["area"], strict=True)},
        "category_units": {r.category: set(r.allowed_units.split("|")) for r in categories.itertuples()},
        "scenarios": pd.read_csv(reference_dir / "scenarios.csv", dtype=str),
    }
