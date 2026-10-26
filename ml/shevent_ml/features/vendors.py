"""Features of a vendor (the #3 matching inputs), built from data/processed/vendors.parquet."""

import numpy as np
import pandas as pd

TIER_RANK = {"budget": 0, "mid": 1, "premium": 2}

# A vendor with few reviews has its rating pulled toward its category's average, as if it also had this many
# reviews at that average. Five 5-star reviews shouldn't automatically outrank two hundred 4.6-star ones.
RATING_PRIOR_REVIEWS = 20


def shrunk_rating(rating, review_count, category, prior_reviews=RATING_PRIOR_REVIEWS):
    """Bayesian average of each vendor's rating with its category's mean rating (per review, not per vendor).

    A vendor with no rating, or a rating but no review count, gets the category mean: there's no evidence to move it.
    """
    reviews = review_count.fillna(0).clip(lower=0).where(rating.notna(), 0)
    weighted = (rating * reviews).fillna(0)
    totals = pd.DataFrame({"weighted": weighted, "reviews": reviews}).groupby(category).transform("sum")
    category_mean = (totals["weighted"] / totals["reviews"].where(totals["reviews"] > 0)).fillna(rating.mean())
    return (category_mean * prior_reviews + weighted) / (prior_reviews + reviews)


def split_count(values):
    return values.fillna("").map(lambda v: len([x for x in v.split("|") if x]))


def vendor_features(vendors, prior_reviews=RATING_PRIOR_REVIEWS):
    """One row per vendor, indexed by vendor_id."""
    out = pd.DataFrame(index=vendors["vendor_id"].to_numpy())
    out.index.name = "vendor_id"
    for col in ["category", "sub_type", "base_area"]:
        out[col] = vendors[col].to_numpy()
    out["tier_rank"] = vendors["price_tier"].map(TIER_RANK).to_numpy()
    for col in ["capacity_min", "capacity_max", "rating", "review_count", "years_active"]:
        out[col] = pd.to_numeric(vendors[col], errors="coerce").to_numpy()
    out["log_reviews"] = np.log1p(out["review_count"].fillna(0))
    out["rating_shrunk"] = shrunk_rating(out["rating"], out["review_count"], out["category"], prior_reviews)
    out["n_areas_served"] = split_count(vendors["areas_served"]).to_numpy()
    out["n_event_types"] = split_count(vendors["event_types"]).to_numpy()
    return out
