"""The models behind each endpoint, loaded once at startup, and the code that turns their output into the contract.

Each model loads from its saved artifact (ml/artifacts/). A missing artifact doesn't stop the server: the endpoints
that need it answer 503 and /health says which model is missing.
"""

import json
import logging
import os
import threading
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd

from shevent_ml.config import CATEGORIES, DATA_DIR, PROCESSED_DIR, REPO_ROOT
from shevent_ml.data.app_seed import app_vendor_id
from shevent_ml.features.calendar import calendar_features
from shevent_ml.models.budget_allocator import price_minimums
from shevent_ml.models.matching import listed_totals
from shevent_ml.models.packages import PackageBuilder
from shevent_ml.models.price_features import TIER_RANK
from shevent_ml.models.quote_checker import QuoteChecker

from .catalog import StaticCatalog, SupabaseCatalog, for_event, summary

log = logging.getLogger(__name__)

FIXTURE_VENDORS = REPO_ROOT / "packages" / "core" / "fixtures" / "vendors.json"
MATCHES_DEFAULT = 10
SPONSORED_SHOWN = 3


class Unavailable(Exception):
    """A model this request needs isn't loaded (its artifact is missing)."""


class Services:
    def __init__(
        self, catalog, price_estimator=None, allocator=None, feedback_path=None, package_settings=None, prices=None
    ):
        """prices: vendors' listed prices (prices.parquet rows, vendor_id being the app's id); without them every
        price is #2's estimate."""
        self.catalog = catalog
        self.price_estimator = price_estimator
        self.allocator = allocator
        self.feedback_path = Path(feedback_path or DATA_DIR / "feedback" / "feedback.jsonl")
        self.feedback_lock = threading.Lock()
        if price_estimator is not None:
            # One #2 cache for the whole server: #3, #4 and #5 asking about the same plan share one prediction.
            self.builder = PackageBuilder(prices, price_estimator, settings=package_settings)
            self.estimates = self.builder.estimates
            self.matcher = self.builder.matcher
            self.quote_checker = QuoteChecker(price_estimator)
        else:
            self.builder = self.estimates = self.matcher = self.quote_checker = None

    def versions(self):
        return {
            "budget_allocator": getattr(self.allocator, "version", None),
            "price_estimator": getattr(self.price_estimator, "version", None),
        }

    def require(self, *names):
        missing = [name for name in names if getattr(self, name) is None]
        if missing:
            raise Unavailable(f"Model not loaded: {', '.join(missing)}. Train it and restart the server.")

    def _category_budgets(self, plan):
        """#1's split in rupees, without the guardrails and explanations (for #3's price fit inside #4)."""
        shares = self.allocator.predict(pd.DataFrame([plan])).iloc[0]
        return {c: float(shares[c]) * plan["total_budget_pkr"] for c in CATEGORIES}

    def _range(self, plan, category, row):
        """The vendor's listed range for this event if it has one, else #2's for its tier."""
        if row["price_source"] == "listed":
            guests, ids = plan["guest_count"], [row["vendor_id"]]
            prices = self.matcher.prices
            low = listed_totals(prices, category, guests, ids, "low_pkr_adj").iloc[0]
            high = listed_totals(prices, category, guests, ids, "high_pkr_adj").iloc[0]
            if pd.notna(low) and pd.notna(high):
                return [float(min(low, row["likely_pkr"])), float(max(high, row["likely_pkr"]))]
        tier = row["price_tier"]
        estimate = self.estimates.estimate_plan(plan, tier if tier in TIER_RANK else None).loc[category]
        return [float(estimate["low"]), float(estimate["high"])]

    def estimate(self, plan):
        """POST /v1/estimate: #1's split with its guardrails, and #2's range for each category."""
        self.require("allocator", "price_estimator")
        result = self.allocator.allocate(plan, minimums=price_minimums(self.estimates, plan))
        ranges = self.estimates.estimate_plan(plan)
        season = calendar_features(pd.to_datetime(pd.Series([plan["event_date"]]))).iloc[0]["season"]
        return {
            "allocation": {
                c: {
                    "share": float(item["share"]),
                    "pkr": float(item["pkr"]),
                    "range": [float(ranges.loc[c, "low"]), float(ranges.loc[c, "high"])],
                }
                for c, item in result["allocation"].items()
            },
            "season_factor": season,
            "warnings": result["warnings"],
            "explanations": result["explanations"],
            "model_version": f"{self.allocator.version}+{self.price_estimator.version}",
        }

    def recommend(self, plan, category, budget, limit=None):
        """POST /v1/recommend: #3's ranking. Sponsored vendors come back in their own list, never in the matches."""
        self.require("price_estimator")
        vendors = for_event(self.catalog.vendors(), plan["area"])
        scored = self.matcher.score(plan, category, vendors, budget=budget)
        scored = scored.sort_values(["score", "vendor_id"], ascending=[False, True])

        def as_match(row):
            return {
                **summary(row),
                "score": round(float(np.clip(row["score"], 0, 1)), 3),
                "price_range": self._range(plan, category, row),
                "reasons": row["reasons"],
                "is_new": bool(row["new_vendor"]),
            }

        organic = scored[~scored["sponsored"]].head(limit or MATCHES_DEFAULT)
        return {
            "category": category,
            "matches": [as_match(row) for row in organic.to_dict("records")],
            "sponsored": [
                as_match(row) for row in scored[scored["sponsored"]].head(SPONSORED_SHOWN).to_dict("records")
            ],
            "model_version": f"match-v1/{self.price_estimator.version}",
        }

    def packages(self, plan, categories, unavailable=()):
        """POST /v1/packages: #4's bundles, each item with the vendor's public summary."""
        self.require("price_estimator")
        vendors = for_event(self.catalog.vendors(), plan["area"])
        budgets = self._category_budgets(plan) if self.allocator is not None else None
        result = self.builder.build(plan, categories, vendors, unavailable or (), budgets)
        by_id = {row["vendor_id"]: row for row in vendors.to_dict("records")}
        packages = [
            {
                "kind": package["kind"],
                "total_pkr": package["total_pkr"],
                "items": [
                    {
                        "vendor": summary(by_id[item["vendor_id"]]),
                        "price_pkr": item["price_pkr"],
                        "price_is_estimate": item["price_is_estimate"],
                        "price_range": item["price_range"],
                        "score": item["score"],
                    }
                    for item in package["items"]
                ],
            }
            for package in result["packages"]
        ]
        return {
            "budget_pkr": result["budget_pkr"],
            "packages": packages,
            "unfilled_categories": result["unfilled_categories"],
            "cheapest_total_pkr": result["cheapest_total_pkr"],
            "model_version": result["model_version"],
        }

    def quote_check(self, request):
        """POST /v1/quote-check: #5's fairness level and checklist."""
        self.require("quote_checker")
        result = self.quote_checker.check(request)
        if result["level"] is None:
            raise Unavailable("No price range for this event and category.")
        return result

    def feedback(self, record):
        """POST /v1/feedback: one JSON line per finished event, for retraining #1-#3 (README §11). No contact
        details: the plan, what was spent, guests and the host's rating."""
        line = json.dumps({"received_at": datetime.now(UTC).isoformat(), **record}, default=str)
        with self.feedback_lock:
            self.feedback_path.parent.mkdir(parents=True, exist_ok=True)
            with self.feedback_path.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
        return {"accepted": True}


def load_services(env=os.environ):
    """Models from ml/artifacts and vendors from Supabase (SUPABASE_URL and SUPABASE_KEY, the publishable key), or
    the demo vendors in packages/core/fixtures when no database is configured."""
    from shevent_ml.models.budget_allocator import ARTIFACT_DIR as ALLOCATOR_DIR
    from shevent_ml.models.budget_allocator import BudgetAllocator
    from shevent_ml.models.price_estimator import ARTIFACT_DIR as ESTIMATOR_DIR
    from shevent_ml.models.price_estimator import PriceEstimator

    def load(cls, path, name):
        if (path / "meta.json").exists():
            return cls.load(path)
        log.warning("No %s artifact in %s: its endpoints will answer 503", name, path)
        return None

    if env.get("SUPABASE_URL") and env.get("SUPABASE_KEY"):
        catalog = SupabaseCatalog(env["SUPABASE_URL"], env["SUPABASE_KEY"], int(env.get("CATALOG_TTL_SECONDS", 300)))
    else:
        log.warning("SUPABASE_URL / SUPABASE_KEY not set: ranking the demo vendors in %s", FIXTURE_VENDORS)
        catalog = StaticCatalog.from_fixture(FIXTURE_VENDORS)
    # Collected listed prices, keyed by the app ids the collected vendors were loaded with (data.app_seed).
    prices_path = Path(env.get("PRICES_PATH") or PROCESSED_DIR / "prices.parquet")
    prices = None
    if prices_path.exists():
        prices = pd.read_parquet(prices_path)
        prices = prices.assign(vendor_id=prices["vendor_id"].map(app_vendor_id))
    else:
        log.warning("No listed prices (%s): every vendor price is #2's estimate", prices_path)
    return Services(
        catalog,
        prices=prices,
        price_estimator=load(PriceEstimator, ESTIMATOR_DIR, "price estimator (#2)"),
        allocator=load(BudgetAllocator, ALLOCATOR_DIR, "budget allocator (#1)"),
        feedback_path=env.get("FEEDBACK_PATH"),
    )
