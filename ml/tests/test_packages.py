import itertools

import numpy as np
import pandas as pd
import pytest

from shevent_ml.config import load_config
from shevent_ml.models.packages import PACKAGE_KINDS, PackageBuilder, evaluate, greedy_package
from shevent_ml.models.price_estimator import PriceEstimator

SETTINGS = load_config("packages")
PLAN = {
    "event_type": "wedding_mehndi",
    "guest_count": 300,
    "area": "Gulberg",
    "venue_type": "marquee",
    "event_date": "2026-12-19",
    "total_budget_pkr": 2_000_000,
}
CATEGORIES = ["venue", "catering", "decor"]


class FakeEstimator:
    """Catering Rs 1,500-2,500 per head; every other category Rs 1-2 lakh for the booking. Premium vendors x2.
    Borrows PriceEstimator's plan methods, so the one-prediction-for-all-tiers path is the real one."""

    version = "cost-test"
    estimate_plan = PriceEstimator.estimate_plan
    estimate_plan_tiers = PriceEstimator.estimate_plan_tiers

    def __init__(self):
        self.calls = 0

    def predict(self, X):
        self.calls += 1
        per_head = (X["price_basis"] == "per_head").to_numpy()
        premium = np.where(X["tier_rank"].to_numpy() == 2, 2.0, 1.0)
        return pd.DataFrame(
            {
                "low": np.where(per_head, 1500.0, 100_000.0) * premium,
                "mid": np.where(per_head, 2000.0, 150_000.0) * premium,
                "high": np.where(per_head, 2500.0, 200_000.0) * premium,
            },
            index=X.index,
        )


def vendor(vid, category, area="Gulberg", cap=(None, None), tier="", rating=None, reviews=None, **extra):
    return {
        "vendor_id": vid,
        "name": f"Vendor {vid}",
        "category": category,
        "sub_type": "",
        "base_area": area,
        "areas_served": area,
        "capacity_min": cap[0],
        "capacity_max": cap[1],
        "price_tier": tier,
        "event_types": "wedding_mehndi",
        "rating": rating,
        "review_count": reviews,
        **extra,
    }


def price(vid, category, amount, basis="flat"):
    return {
        "vendor_id": vid,
        "category": category,
        "price_basis": basis,
        "low_pkr_adj": 0.9 * amount,
        "mid_pkr_adj": float(amount),
        "high_pkr_adj": 1.2 * amount,
        "guest_min": None,
        "guest_max": None,
        "is_combo": False,
    }


@pytest.fixture
def market():
    """Three listed vendors per category at three price points, the dearer ones better rated."""
    vendors, prices = [], []
    amounts = {
        "venue": [300_000, 500_000, 800_000],
        "catering": [1500, 2200, 3200],  # per head
        "decor": [100_000, 250_000, 400_000],
    }
    for category, points in amounts.items():
        for i, amount in enumerate(points):
            vid = f"{category[:3].upper()}-{i}"
            vendors.append(vendor(vid, category, rating=4.0 + 0.4 * i, reviews=40))
            prices.append(price(vid, category, amount, "per_head" if category == "catering" else "flat"))
    return pd.DataFrame(vendors), pd.DataFrame(prices)


def build(market, plan=PLAN, categories=CATEGORIES, **kwargs):
    vendors, prices = market
    return PackageBuilder(prices, FakeEstimator(), settings=SETTINGS).build(plan, categories, vendors, **kwargs)


def chosen(package):
    return {item["category"]: item["vendor_id"] for item in package["items"]}


def test_three_different_packages_one_vendor_per_category_all_within_budget(market):
    result = build(market)
    assert [p["kind"] for p in result["packages"]] == PACKAGE_KINDS
    picks = [frozenset(chosen(p).items()) for p in result["packages"]]
    assert len(set(picks)) == 3
    for package in result["packages"]:
        assert sorted(chosen(package)) == sorted(CATEGORIES)
        assert package["total_pkr"] == sum(item["price_pkr"] for item in package["items"]) <= PLAN["total_budget_pkr"]
    assert result["unfilled_categories"] == [] and result["cheapest_total_pkr"] is None


def test_each_kind_wins_on_its_own_goal(market):
    packages = {p["kind"]: p for p in build(market)["packages"]}

    def mean(package, key):
        return np.mean([item[key] for item in package["items"]])

    # Balanced is solved first, so it has the best match score of any bundle within budget. The later kinds are the
    # best bundles that differ from those before them.
    assert mean(packages["balanced"], "score") == max(mean(p, "score") for p in packages.values())
    assert packages["cheapest"]["total_pkr"] == 300_000 + 1500 * 300 + 100_000  # the cheapest vendor everywhere
    assert mean(packages["highest_quality"], "quality") > mean(packages["cheapest"], "quality")


def test_balanced_is_the_true_optimum(market):
    """Against brute force over every bundle: the highest total match score within budget, cheapest on ties."""
    vendors, prices = market
    builder = PackageBuilder(prices, FakeEstimator(), settings=SETTINGS)
    pools = builder.pools(PLAN, CATEGORIES, vendors)
    best = None
    for rows in itertools.product(*(pool.itertuples() for pool in pools.values())):
        cost = sum(r.price_pkr for r in rows)
        if cost <= PLAN["total_budget_pkr"]:
            key = (sum(round(r.match * 1000) for r in rows), -cost)
            best = max(best or key, key)
    balanced = next(p for p in builder.build(PLAN, CATEGORIES, vendors)["packages"] if p["kind"] == "balanced")
    assert (sum(round(i["score"] * 1000) for i in balanced["items"]), -balanced["total_pkr"]) == best


def test_vendors_that_cannot_take_the_event_are_never_chosen(market):
    vendors, prices = market
    cheap = [
        vendor("FAR", "decor", area="DHA"),  # listed only for another area
        vendor("BIG", "decor", cap=(None, 100)),  # can't handle 300 guests
        vendor("AD", "decor", sponsored=True),
        vendor("BOOKED", "decor"),
    ]
    vendors = pd.concat([vendors, pd.DataFrame(cheap)], ignore_index=True)
    prices = pd.concat([prices, pd.DataFrame([price(v["vendor_id"], "decor", 1000) for v in cheap])], ignore_index=True)
    result = PackageBuilder(prices, FakeEstimator(), settings=SETTINGS).build(
        PLAN, CATEGORIES, vendors, unavailable=["BOOKED"]
    )
    picked = {item["vendor_id"] for p in result["packages"] for item in p["items"]}
    assert picked and not picked & {"FAR", "BIG", "AD", "BOOKED"}


def test_a_budget_too_small_for_any_bundle_says_what_the_cheapest_costs(market):
    result = build(market, plan={**PLAN, "total_budget_pkr": 500_000})
    assert result["packages"] == []
    assert result["cheapest_total_pkr"] == 300_000 + 1500 * 300 + 100_000


def test_a_category_nobody_covers_is_reported_and_the_rest_still_packaged(market):
    result = build(market, categories=[*CATEGORIES, "photography"])
    assert result["unfilled_categories"] == ["photography"]
    assert all(sorted(chosen(p)) == sorted(CATEGORIES) for p in result["packages"])


def test_unlisted_vendors_are_priced_by_2_for_their_tier_and_marked_as_estimates(market):
    vendors, prices = market
    vendors = pd.concat(
        [vendors, pd.DataFrame([vendor("LIGHT-P", "lighting", tier="premium"), vendor("LIGHT-X", "lighting")])]
    )
    builder = PackageBuilder(prices, FakeEstimator(), settings=SETTINGS)
    pool = builder.pool(PLAN, "lighting", vendors).set_index("vendor_id")
    assert pool.loc["LIGHT-P", "price_pkr"] == 300_000 and pool.loc["LIGHT-X", "price_pkr"] == 150_000
    assert pool["price_is_estimate"].all()
    assert (pool.loc["LIGHT-X", "price_low"], pool.loc["LIGHT-X", "price_high"]) == (100_000, 200_000)
    # Listed prices keep the listed range, scaled to the event.
    catering = builder.pool(PLAN, "catering", vendors).set_index("vendor_id").loc["CAT-0"]
    assert not catering["price_is_estimate"]
    assert (catering["price_low"], catering["price_pkr"], catering["price_high"]) == (405_000, 450_000, 540_000)
    # Without #2, a vendor with no listed price can't be priced, so it can't be packaged.
    assert PackageBuilder(prices, None, settings=SETTINGS).pool(PLAN, "lighting", vendors).empty


def test_one_request_asks_2_for_one_prediction(market):
    vendors, prices = market
    estimator = FakeEstimator()
    vendors = pd.concat([vendors, pd.DataFrame([vendor("LIGHT-P", "lighting", tier="premium")])])
    PackageBuilder(prices, estimator, settings=SETTINGS).build(PLAN, [*CATEGORIES, "lighting"], vendors)
    assert estimator.calls == 1


def test_fewer_packages_when_too_few_bundles_differ(market):
    vendors, prices = market
    one_each = vendors[vendors["vendor_id"].str.endswith("-0")]
    result = PackageBuilder(prices, FakeEstimator(), settings=SETTINGS).build(PLAN, CATEGORIES, one_each)
    assert [p["kind"] for p in result["packages"]] == ["balanced"]


def test_greedy_baseline_can_go_over_budget_where_the_solver_does_not(market):
    vendors, prices = market
    builder = PackageBuilder(prices, FakeEstimator(), settings=SETTINGS)
    # Each category's best match fits its own share of a Rs 30 lakh budget, but the shares add up to more than 100%.
    builder.matcher.settings = {**builder.matcher.settings, "fallback_shares": {c: 0.5 for c in CATEGORIES}}
    plan = {**PLAN, "total_budget_pkr": 1_200_000}
    greedy = greedy_package(builder, plan, builder.pools(plan, CATEGORIES, vendors))
    assert greedy["total_pkr"] > plan["total_budget_pkr"]
    assert all(p["total_pkr"] <= plan["total_budget_pkr"] for p in builder.build(plan, CATEGORIES, vendors)["packages"])


def test_evaluate_reports_the_exit_gate_and_the_baseline(market):
    vendors, prices = market
    builder = PackageBuilder(prices, FakeEstimator(), settings=SETTINGS)
    report = evaluate(builder, [PLAN, {**PLAN, "total_budget_pkr": 400_000}], vendors, CATEGORIES)
    assert report["plans"] == 2 and report["with_package"] == 0.5
    assert report["packages_within_budget"] == 1.0 and report["packages_distinct"] == 1.0
    assert 0 <= report["greedy_within_budget"] <= 1 and report["seconds_max"] > 0


def test_budgets_from_the_caller_set_the_price_fit(market):
    """The server passes #1's split once per request; a smaller venue budget makes the dearer venues fit worse."""
    vendors, prices = market
    builder = PackageBuilder(prices, FakeEstimator(), settings=SETTINGS)
    default = builder.pool(PLAN, "venue", vendors).set_index("vendor_id")["match"]
    tight = builder.pool(PLAN, "venue", vendors, budget=300_000).set_index("vendor_id")["match"]
    assert tight["VEN-2"] < default["VEN-2"] and tight["VEN-0"] == default["VEN-0"]
