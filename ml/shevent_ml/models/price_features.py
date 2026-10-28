"""Model rows for #2: real prices, scenario quotes and synthetic events on the same feature columns.

Each source knows different things. Synthetic events have a date, guests and preferences; real prices have a tier
and sometimes a guest range or a season note but no event date; scenario quotes have the event but no tier. What a
source doesn't know is left missing, and LightGBM learns what to do with missing values.
"""

import numpy as np
import pandas as pd

from shevent_ml.config import CATEGORIES, REFERENCE_DIR
from shevent_ml.features.calendar import SEASONS, calendar_features
from shevent_ml.features.events import PREFERENCES, VENUE_TYPES
from shevent_ml.features.vendors import TIER_RANK

PRICE_BASES = ["per_head", "flat"]
# The basis each category is estimated on for an event plan.
DEFAULT_BASIS = {c: "per_head" if c == "catering" else "flat" for c in CATEGORIES}


def _reference(field):
    vocab = pd.read_csv(REFERENCE_DIR / "vocab.csv", dtype=str)
    return [v for v in vocab.loc[vocab["field"] == field, "value"] if v != "any"]


AREAS = sorted(pd.read_csv(REFERENCE_DIR / "areas.csv", dtype=str)["area"].unique())
EVENT_TYPES = _reference("event_type")

# Fixed category lists, so an area or event type the model never saw becomes missing instead of a new code.
CATEGORICAL = {
    "category": CATEGORIES,
    "price_basis": PRICE_BASES,
    "area": AREAS,
    "event_type": EVENT_TYPES,
    "venue_type": VENUE_TYPES,
    "season": SEASONS,
}
NUMERIC = ["tier_rank", "log_guests", "hours", "month", "is_weekend", *[f"pref_{p}" for p in PREFERENCES]]
FEATURES = [*CATEGORICAL, *NUMERIC]

SEASON_FROM_NOTE = {"peak": "peak_wedding_season", "off_peak": "off_peak", "ramadan": "ramadan"}


def encode(rows):
    """The FEATURES columns with fixed categorical types. Missing columns are added as missing values."""
    out = pd.DataFrame(index=rows.index)
    for col, values in CATEGORICAL.items():
        source = rows[col] if col in rows else pd.Series(np.nan, index=rows.index)
        out[col] = pd.Categorical(source.where(source.isin(values)), categories=values)
    for col in NUMERIC:
        out[col] = pd.to_numeric(rows[col], errors="coerce").astype(float) if col in rows else np.nan
    return out


def _guests(low, high):
    """Midpoint of a guest range; one end alone if that's all there is."""
    return pd.concat([low, high], axis=1).mean(axis=1)


def real_rows(prices):
    """data/processed/prices.parquet -> (features, PKR target). Combo packages are left out: they bundle categories."""
    prices = prices[~prices["is_combo"].fillna(False).astype(bool)]
    rows = pd.DataFrame(
        {
            "category": prices["category"],
            "price_basis": prices["price_basis"],
            "area": prices["area"],
            "event_type": prices["event_type"],
            "venue_type": prices["sub_type"].where(prices["category"] == "venue"),
            "season": prices["season_note"].map(SEASON_FROM_NOTE),
            "tier_rank": prices["price_tier"].map(TIER_RANK),
            "log_guests": np.log1p(_guests(prices["guest_min"], prices["guest_max"])),
            "hours": prices["hours"],
        },
        index=prices.index,
    )
    return encode(rows), prices["mid_pkr_adj"].astype(float)


def quote_rows(quotes):
    """Scenario quotes -> (features, PKR target). The scenario gives a month and 'Saturday' or 'Weekday'."""
    mid_month = pd.to_datetime(quotes["event_month"] + "-15", errors="coerce")
    calendar = calendar_features(mid_month)
    rows = pd.DataFrame(
        {
            "category": quotes["category"],
            "price_basis": quotes["price_basis"],
            "area": quotes["area"],
            "event_type": quotes["event_type"],
            "venue_type": quotes["venue_type"],
            "season": calendar["season"].astype(object),
            "log_guests": np.log1p(pd.to_numeric(quotes["guests"], errors="coerce")),
            "hours": quotes["hours"],
            "month": calendar["month"].astype(float),
            "is_weekend": quotes["day"].map({"Saturday": 1.0, "Sunday": 1.0, "Friday": 0.0, "Weekday": 0.0}),
        },
        index=quotes.index,
    )
    return encode(rows), quotes["price_pkr_adj"].astype(float)


def synthetic_rows(events, services, tier_dropout=0.0, rng=None):
    """Synthetic events x categories -> (features, PKR target, event_id). tier_dropout hides the tier on that share."""
    rows = services.merge(events, on="event_id", how="left")
    tier = rows["tier"].map(TIER_RANK).astype(float)
    if tier_dropout:
        rng = rng or np.random.default_rng(0)
        tier = tier.where(rng.random(len(rows)) >= tier_dropout)
    preferences = rows["preferences"].fillna("").str.split("|")
    features = pd.DataFrame(
        {
            "category": rows["category"],
            "price_basis": rows["price_basis"],
            "area": rows["area"],
            "event_type": rows["event_type"],
            "venue_type": rows["venue_type"],
            "season": rows["season"],
            "tier_rank": tier,
            "log_guests": np.log1p(rows["guest_count_invited"]),
            "month": pd.to_datetime(rows["event_date"]).dt.month,
            "is_weekend": rows["is_weekend"].astype(float),
            **{f"pref_{p}": preferences.map(lambda chosen, p=p: float(p in chosen)) for p in PREFERENCES},
        }
    )
    return encode(features), rows["unit_price_pkr"].astype(float), rows["event_id"]


def plan_rows(plan, tier=None):
    """One row per category for an event plan (the #1/#2 request), on each category's default basis."""
    date = pd.to_datetime(pd.Series([plan["event_date"]]))
    calendar = calendar_features(date).iloc[0]
    chosen = set(plan.get("preferences") or [])
    base = {
        "area": plan["area"],
        "event_type": plan["event_type"],
        "venue_type": plan.get("venue_type"),
        "season": calendar["season"],
        "tier_rank": TIER_RANK.get(tier, np.nan),
        "log_guests": np.log1p(plan["guest_count"]),
        "month": float(calendar["month"]),
        "is_weekend": float(calendar["is_weekend"]),
        **{f"pref_{p}": float(p in chosen) for p in PREFERENCES},
    }
    rows = pd.DataFrame([{**base, "category": c, "price_basis": DEFAULT_BASIS[c]} for c in CATEGORIES])
    return encode(rows)
