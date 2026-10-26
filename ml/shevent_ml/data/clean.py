"""Cleaning steps that work on one table at a time: area names, price units, duplicates and phone numbers."""

import re

import numpy as np

# Same pattern as scripts/validate_data.py.
PHONE_PATTERN = re.compile(r"(\+92|0092|\b0)\s?3\d{2}[\s-]?\d{7}\b")
CONFIDENCE_RANK = {"high": 0, "medium": 1, "low": 2}


def map_area(value, aliases):
    """'DHA Phase 5' -> 'DHA'. Blank stays blank and anything not in the reference list becomes 'Other'."""
    if not value.strip():
        return ""
    return aliases.get(value.strip().lower(), "Other")


def map_area_list(value, aliases):
    """'Gulberg III|Defence' -> ['DHA', 'Gulberg']."""
    return sorted({map_area(a, aliases) for a in value.split("|") if a.strip()})


def normalize_units(df, default_hours):
    """Puts every price on one of two bases, so prices in different units can be compared.

    Expects unit, category, low_pkr, high_pkr and hours columns. per_head stays per head, because the guest
    count is a model input. per_event, per_package, per_setup and per_slot are already one price for the
    whole booking ('flat'). per_hour becomes flat by multiplying by the row's hours, or by the category's
    default hours when the row has none; with neither, the price becomes NaN so the caller can drop it.
    """
    out = df.copy()
    out["price_basis"] = np.where(out["unit"] == "per_head", "per_head", "flat")
    out["unit_note"] = ""
    hourly = out["unit"] == "per_hour"
    if hourly.any():
        hours = out.loc[hourly, "hours"].fillna(out.loc[hourly, "category"].map(default_hours))
        out.loc[hourly, "low_pkr"] = out.loc[hourly, "low_pkr"] * hours
        out.loc[hourly, "high_pkr"] = out.loc[hourly, "high_pkr"] * hours
        out.loc[hourly, "unit_note"] = hours.map(lambda h: f"per_hour x {h:g}h")
    return out


def duplicate_prices(df):
    """True for rows that repeat a price already recorded for the same vendor, category, unit, package and amounts.

    In each group the row kept is the most confident one, then the most recent.
    """
    ranked = df.assign(
        _package=df["package_name"].str.lower().str.split().str.join(" "),
        _rank=df["confidence"].map(CONFIDENCE_RANK).fillna(len(CONFIDENCE_RANK)),
    ).sort_values(["_rank", "price_date"], ascending=[True, False], kind="stable")
    repeated = ranked.duplicated(subset=["vendor_id", "category", "unit", "_package", "low_pkr", "high_pkr"])
    return repeated.reindex(df.index)


def scrub_phone_numbers(text):
    return text.str.replace(PHONE_PATTERN, "[phone]", regex=True)
