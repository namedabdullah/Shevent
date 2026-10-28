import numpy as np
import pandas as pd
import pytest

from shevent_ml.config import load_config
from shevent_ml.eval.baselines import rank_by_rating
from shevent_ml.eval.matching_set import score_ranker
from shevent_ml.models.matching import VendorMatcher, listed_prices, price_fit

SETTINGS = load_config("matching")
PLAN = {
    "event_type": "wedding_mehndi",
    "guest_count": 300,
    "area": "Gulberg",
    "venue_type": "marquee",
    "event_date": "2026-12-19",
    "total_budget_pkr": 2_500_000,
}  # catering budget: 38% = Rs 9.5 lakh


def vendor(
    vid,
    area="Gulberg",
    served="",
    cap=(None, None),
    tier="",
    events="",
    rating=None,
    reviews=None,
    category="catering",
    **extra,
):
    return {
        "vendor_id": vid,
        "name": f"Vendor {vid}",
        "category": category,
        "sub_type": "",
        "base_area": area,
        "areas_served": served or area,
        "capacity_min": cap[0],
        "capacity_max": cap[1],
        "price_tier": tier,
        "event_types": events,
        "rating": rating,
        "review_count": reviews,
        **extra,
    }


def price(vid, per_head=None, flat=None, guests=(None, None), combo=False, category="catering"):
    basis, amount = ("per_head", per_head) if per_head else ("flat", flat)
    return {
        "vendor_id": vid,
        "category": category,
        "price_basis": basis,
        "mid_pkr_adj": float(amount),
        "guest_min": guests[0],
        "guest_max": guests[1],
        "is_combo": combo,
    }


def test_price_fit_curve():
    scores = price_fit([0.5, 1.0, 1.3, 1.6, 2.0, 0.2], SETTINGS)
    assert scores.tolist() == pytest.approx([1.0, 1.0, 0.5, 0.0, 0.0, 0.8])


def test_listed_prices_skip_bundles_and_prices_for_other_guest_counts():
    prices = pd.DataFrame(
        [
            price("A", per_head=2000),
            price("A", per_head=3000),
            price("B", per_head=9999, combo=True),
            price("C", flat=30000, guests=(100, 199), category="venue"),
            price("C", flat=90000, guests=(200, 600), category="venue"),
        ]
    )
    assert listed_prices(prices, "catering").loc["A", "per_head"] == 2500
    assert "B" not in listed_prices(prices, "catering").index
    assert listed_prices(prices, "venue", guests=500).loc["C", "flat"] == 90000


def test_parts_and_reasons():
    vendors = pd.DataFrame(
        [
            vendor("FIT", cap=(50, 800), events="wedding_mehndi|birthday", rating=4.6, reviews=120),
            vendor("FAR", area="DHA", rating=4.9, reviews=300),
            vendor("SMALL", cap=(10, 150)),
            vendor("NEW", reviews=2),
            vendor("BLANK", area="Other", served="Other"),
        ]
    )
    prices = pd.DataFrame([price("FIT", per_head=2500), price("FAR", per_head=4500)])
    scored = VendorMatcher(SETTINGS, prices=prices).score(PLAN, "catering", vendors).set_index("vendor_id")

    fit = scored.loc["FIT"]
    assert (fit["price"], fit["location"], fit["capacity"], fit["experience"]) == (1.0, 1.0, 1.0, 1.0)
    assert fit["reasons"][:4] == [
        "Listed price (about Rs 7.5 lakh) fits your Rs 9.5 lakh catering budget",
        "Serves Gulberg",
        "Handles 300 guests",
        "Does mehndi events",
    ]
    far = scored.loc["FAR"]  # 4,500 x 300 = 13.5 lakh, 42% over the budget
    assert far["price"] == pytest.approx(1 - 0.42 / 0.6, abs=0.01)
    assert any("over your Rs 9.5 lakh budget" in r for r in far["reasons"])
    assert any(r.startswith("Based in DHA") for r in far["reasons"])
    assert "SMALL" not in scored.index  # 300 guests is over its maximum of 150
    assert scored.loc["NEW", "new_vendor"] and "New on Shevent" in scored.loc["NEW", "reasons"]
    blank = scored.loc["BLANK"]
    assert not blank["new_vendor"] and blank["location"] == SETTINGS["location"]["area_unknown"]
    assert blank["reasons"] == ["Few details listed yet: ask about price, capacity and the date"]
    assert scored.loc["FIT", "score"] > scored.loc["FAR", "score"]


def test_sponsored_vendors_come_back_separately():
    vendors = pd.DataFrame(
        [
            vendor("A", rating=4.0, reviews=50),
            vendor("B", rating=4.5, reviews=50, sponsored=True),
            vendor("C", area="DHA", reviews=50),
        ]
    )
    result = VendorMatcher(SETTINGS).recommend(PLAN, "catering", vendors)
    assert [m["vendor_id"] for m in result["matches"]] == ["A", "C"]
    assert [m["vendor_id"] for m in result["sponsored"]] == ["B"]
    assert result["category_budget_pkr"] == 950_000


def test_tiered_vendors_without_a_listed_price_use_the_price_estimator():
    class FakeEstimator:
        def estimate_plan(self, plan, tier=None):
            mid = {"budget": 500_000.0, "mid": 900_000.0, "premium": 2_000_000.0}[tier]
            return pd.DataFrame({"mid": [mid]}, index=["catering"])

    vendors = pd.DataFrame([vendor("CHEAP", tier="budget"), vendor("LUX", tier="premium"), vendor("UNKNOWN")])
    scored = VendorMatcher(SETTINGS, price_estimator=FakeEstimator()).score(PLAN, "catering", vendors)
    scored = scored.set_index("vendor_id")
    assert scored.loc["CHEAP", "price"] == 1.0 and scored.loc["LUX", "price"] == 0.0
    assert np.isnan(scored.loc["UNKNOWN", "price"])  # no price and no tier: scored as unknown
    assert scored.loc["CHEAP", "reasons"][0].startswith("Typical price for its tier")


def test_the_matcher_beats_sort_by_rating_on_rated_queries():
    """A rater who wants vendors in the area, within budget and big enough, whatever their stars."""
    rng = np.random.default_rng(3)
    areas = ["Gulberg", "DHA", "Johar Town"]
    vendors, prices = [], []
    for i in range(60):
        vid = f"CAT-{i:03}"
        vendors.append(
            vendor(
                vid,
                area=areas[i % 3],
                cap=(50, int(rng.choice([200, 1000]))),
                rating=round(float(rng.uniform(3.5, 5)), 1),
                reviews=int(rng.integers(10, 300)),
            )
        )
        prices.append(price(vid, per_head=float(rng.choice([2000, 3000, 5000]))))
    vendors, prices = pd.DataFrame(vendors), pd.DataFrame(prices)
    queries = [{**PLAN, "query_id": f"Q{a}", "area": a, "guests": 300, "category": "catering"} for a in areas]
    labels = []
    for q in queries:
        for v, p in zip(vendors.to_dict("records"), prices["mid_pkr_adj"], strict=True):
            relevance = (v["base_area"] == q["area"]) + (p * 300 <= 950_000) + (v["capacity_max"] >= 300)
            labels.append({"query_id": q["query_id"], "vendor_id": v["vendor_id"], "relevance": int(relevance)})
    labels = pd.DataFrame(labels)
    matcher = VendorMatcher(SETTINGS, prices=prices)
    ours = score_ranker(matcher.rank, labels, vendors, queries)
    baseline = score_ranker(lambda q, c: rank_by_rating(c), labels, vendors, queries)
    assert ours["ndcg@10"] > baseline["ndcg@10"] + 0.1
    assert ours["precision@5"] >= baseline["precision@5"]
