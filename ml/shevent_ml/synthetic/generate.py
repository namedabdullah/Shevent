"""Synthetic events for training #1 (budget split) and #2 (price ranges), from the assumptions in synthetic.yaml.

    python -m shevent_ml.synthetic.generate                    # 20,000 events -> data/processed/synthetic_*.parquet
    python -m shevent_ml.synthetic.generate --n 50000 --fit-prices

Each event samples a type, guest list, area, venue, date, price tier and preferences, then prices every category
from its base price times documented effects (season, weekend, area, venue, guests, event type, preferences) and
log-normal noise. The planned budget is the spend less a sampled overspend. Real prices are scarce and have no event
date, so this is how the models see the effects at all; they are still evaluated only on held-out real data.
"""

import argparse
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd

from shevent_ml.config import PROCESSED_DIR, SEED, load_config
from shevent_ml.features.calendar import calendar_features
from shevent_ml.features.events import OUTDOOR_VENUES

CATEGORIES = ["venue", "catering", "decor", "dj_sound", "lighting"]
TIERS = ["budget", "mid", "premium"]
PER_HEAD = {"catering"}

EVENT_COLUMNS = [
    "event_id",
    "event_type",
    "guest_count_invited",
    "guest_count_actual",
    "area",
    "venue_type",
    "event_date",
    "hijri_month",
    "is_weekend",
    "season",
    "tier",
    "preferences",
    "total_budget_pkr",
    "total_spend_pkr",
    *[f"spend_{c}" for c in CATEGORIES],
    *[f"share_{c}" for c in CATEGORIES],
]


def _choice(rng, weights, size):
    """Draws `size` keys of a {value: weight} dict, in proportion to the weights."""
    keys = list(weights)
    p = np.array([weights[k] for k in keys], dtype=float)
    return np.array(keys, dtype=object)[rng.choice(len(keys), size=size, p=p / p.sum())]


def fit_base_prices(prices, settings, min_prices=5):
    """base_prices with each category x tier replaced by the real median where there are min_prices prices.

    Prices are first divided by their area's multiplier, so they describe the reference area like the config does.
    Only the basis the generator uses is fitted (per head for catering, one price for the rest). Returns the new
    table and the list of fitted cells.
    """
    base = {cat: dict(tiers) for cat, tiers in settings["base_prices"].items()}
    area_price = prices["area"].map(settings["area_price"]).fillna(1.0)
    rows = prices.assign(reference_price=prices["mid_pkr_adj"] / area_price)
    fitted = []
    for (category, tier), group in rows.groupby(["category", "price_tier"]):
        basis = "per_head" if category in PER_HEAD else "flat"
        group = group[group["price_basis"] == basis]
        if category in base and tier in TIERS and len(group) >= min_prices:
            base[category][tier] = float(group["reference_price"].median())
            fitted.append(f"{category}.{tier} ({len(group)} prices)")
    return base, fitted


def _event_dates(rng, event_types, settings):
    """A date for each event, weighted by how likely that kind of event is on each day of the range."""
    days = pd.Series(pd.date_range(settings["dates"]["start"], settings["dates"]["end"], freq="D"))
    calendar = calendar_features(days)
    dates = np.empty(len(event_types), dtype="datetime64[ns]")
    for event_type, spec in settings["event_types"].items():
        rows = np.flatnonzero(event_types == event_type)
        if not len(rows):
            continue
        weight = np.where(calendar["is_weekend"].to_numpy(dtype=bool), spec["weekend_demand"], 1.0)
        if spec["wedding"]:
            weight = weight * calendar["season"].astype(str).map(settings["wedding_demand"]).to_numpy(dtype=float)
        dates[rows] = days.to_numpy()[rng.choice(len(days), size=len(rows), p=weight / weight.sum())]
    return pd.Series(dates)


def generate(n, settings=None, seed=SEED, base_prices=None):
    """Returns (events, services): one row per event, and one row per event and category with its unit price."""
    settings = settings or load_config("synthetic")
    base_prices = base_prices or settings["base_prices"]
    rng = np.random.default_rng(seed)
    specs = settings["event_types"]

    event_type = _choice(rng, {t: s["weight"] for t, s in specs.items()}, n)
    tier = _choice(rng, settings["tiers"], n)
    area = _choice(rng, settings["area_weights"], n)

    invited = np.zeros(n)
    attendance = np.zeros(n)
    venue = np.empty(n, dtype=object)
    for t, spec in specs.items():
        rows = np.flatnonzero(event_type == t)
        g = spec["guests"]
        drawn = np.exp(rng.normal(np.log(g["median"]), g["sigma"], len(rows)))
        invited[rows] = np.clip(np.round(drawn / 5) * 5, g["min"], g["max"])
        a = spec["attendance"]
        attendance[rows] = np.clip(rng.normal(a["mean"], a["sd"], len(rows)), 0.4, 1.0)
        venue[rows] = _choice(rng, spec["venues"], len(rows))
    invited = invited.astype(int)

    dates = _event_dates(rng, event_type, settings)
    calendar = calendar_features(dates)
    season = calendar["season"].astype(str).to_numpy()
    weekend = calendar["is_weekend"].to_numpy(dtype=bool)

    chosen = {}
    for name, pref in settings["preferences"].items():
        allowed = np.isin(event_type, pref.get("event_types", list(specs)))
        chosen[name] = allowed & (rng.random(n) < pref["probability"])
    preferences = ["|".join(name for name in chosen if chosen[name][i]) for i in range(n)]

    # Effects every category shares: season, weekend and area.
    shared = (
        pd.Series(season).map(settings["season_price"]).to_numpy(dtype=float)
        * np.where(weekend, settings["weekend_price"], 1.0)
        * pd.Series(area).map(settings["area_price"]).fillna(1.0).to_numpy(dtype=float)
    )
    size = invited / settings["reference_guests"]
    outdoor = np.isin(venue, list(OUTDOOR_VENUES))

    spend, unit_price = {}, {}
    for cat in CATEGORIES:
        price = pd.Series(tier).map(base_prices[cat]).to_numpy(dtype=float) * shared
        price *= np.array([specs[t]["category_price"].get(cat, 1.0) for t in event_type])
        for name, pref in settings["preferences"].items():
            price *= np.where(chosen[name], pref["price"].get(cat, 1.0), 1.0)
        if cat == "venue":
            price *= pd.Series(venue).map(settings["venue_price"]).to_numpy(dtype=float)
        if cat == "lighting":
            price *= np.where(outdoor, settings["outdoor_lighting"], 1.0)
        if cat not in PER_HEAD:
            price *= size ** settings["guest_elasticity"][cat]
        price *= np.exp(rng.normal(0, settings["noise_sigma"][cat], n))
        unit_price[cat] = np.round(price, -1) if cat in PER_HEAD else np.round(price, -3)
        spend[cat] = unit_price[cat] * invited if cat in PER_HEAD else unit_price[cat]

    total = sum(spend.values())
    overspend = _choice(rng, settings["overspend"], n).astype(float)
    events = pd.DataFrame(
        {
            "event_id": [f"SYN-{i:06}" for i in range(1, n + 1)],
            "event_type": event_type,
            "guest_count_invited": invited,
            "guest_count_actual": np.round(invited * attendance).astype(int),
            "area": area,
            "venue_type": venue,
            "event_date": dates.dt.normalize(),
            "hijri_month": calendar["hijri_month"].to_numpy(),
            "is_weekend": weekend,
            "season": season,
            "tier": tier,
            "preferences": preferences,
            "total_budget_pkr": np.round(total / (1 + overspend), -3),
            "total_spend_pkr": total,
            **{f"spend_{c}": spend[c] for c in CATEGORIES},
            **{f"share_{c}": spend[c] / total for c in CATEGORIES},
        }
    )
    services = pd.DataFrame(
        {
            "event_id": np.repeat(events["event_id"].to_numpy(), len(CATEGORIES)),
            "category": np.tile(CATEGORIES, n),
            "price_basis": np.tile(["per_head" if c in PER_HEAD else "flat" for c in CATEGORIES], n),
            "unit_price_pkr": np.column_stack([unit_price[c] for c in CATEGORIES]).ravel(),
            "cost_pkr": np.column_stack([spend[c] for c in CATEGORIES]).ravel(),
        }
    )
    return events[EVENT_COLUMNS], services


def synthetic_hash(n, seed, settings, base_prices):
    """Changes whenever anything that shapes the synthetic data changes. Log it with the real dataset_hash."""
    parts = {"n": n, "seed": seed, "settings": settings, "base_prices": base_prices}
    return hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()[:12]


def write(n, out_dir=PROCESSED_DIR, seed=SEED, fit_prices=False, settings=None):
    settings = settings or load_config("synthetic")
    base_prices, fitted = settings["base_prices"], []
    if fit_prices:
        prices = pd.read_parquet(out_dir / "prices.parquet")
        base_prices, fitted = fit_base_prices(prices, settings)
    events, services = generate(n, settings, seed, base_prices)

    out_dir.mkdir(parents=True, exist_ok=True)
    events.to_parquet(out_dir / "synthetic_events.parquet", index=False)
    services.to_parquet(out_dir / "synthetic_services.parquet", index=False)
    manifest = {
        "synthetic_hash": synthetic_hash(n, seed, settings, base_prices),
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "n": n,
        "seed": seed,
        "sources": settings["sources"],
        "fitted_base_prices": fitted,
        "base_prices": base_prices,
        "settings": settings,
    }
    (out_dir / "synthetic_manifest.json").write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    return events, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--n", type=int, default=20_000, help="number of events")
    parser.add_argument("--out", type=Path, default=PROCESSED_DIR, help="where to write the parquet tables")
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--fit-prices", action="store_true", help="fit base prices from <out>/prices.parquet")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    events, manifest = write(args.n, args.out, args.seed, args.fit_prices)
    print(f"{len(events)} synthetic events ({manifest['synthetic_hash']}) written to {args.out}")
    placeholders = [group for group, source in manifest["sources"].items() if source == "placeholder"]
    if placeholders:
        print(f"  placeholder assumptions: {', '.join(placeholders)} (see ml/configs/synthetic.yaml)")
    for cell in manifest["fitted_base_prices"]:
        print(f"  fitted from real prices: {cell}")
    # Mean split per event type: compare it with the planner interviews' splits.
    shares = events.groupby("event_type")[[f"share_{c}" for c in CATEGORIES]].mean()
    shares.columns = CATEGORIES
    print("\nMean budget split by event type")
    print((shares * 100).round(1).to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
