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

from .assistant import Assistant, OllamaClient
from .catalog import StaticCatalog, SupabaseCatalog, for_event, summary

log = logging.getLogger(__name__)

FIXTURE_VENDORS = REPO_ROOT / "packages" / "core" / "fixtures" / "vendors.json"
MATCHES_DEFAULT = 10
SPONSORED_SHOWN = 3
DEFAULT_LLM = "qwen2.5:3b-instruct"
# #6's pros and cons, worded as what reviews say, never as an accusation.
PROS = {
    "punctuality": "On time",
    "food_quality": "Guests praise the food",
    "sound_quality": "Good sound and music",
    "staff_behaviour": "Polite, helpful staff",
    "value_for_money": "Good value for money",
    "hidden_charges": "No surprise charges",
    "photo_video_quality": "Photos and videos praised",
}
CONS = {
    "punctuality": "Some reviews mention late arrival",
    "food_quality": "Some reviews mention problems with the food",
    "sound_quality": "Some reviews mention sound problems",
    "staff_behaviour": "Some reviews mention unhelpful staff",
    "value_for_money": "Some reviews say the price felt high",
    "hidden_charges": "Some reviews mention extra charges",
    "photo_video_quality": "Some reviews mention late or disappointing photos",
}


class Unavailable(Exception):
    """A model this request needs isn't loaded (its artifact is missing)."""


class Services:
    def __init__(
        self, catalog, price_estimator=None, allocator=None, feedback_path=None, package_settings=None, prices=None,
        review_model=None, reviews=None, portfolio=None,
    ):  # fmt: skip
        """prices: vendors' listed prices (prices.parquet rows, vendor_id being the app's id); without them every
        price is #2's estimate. reviews: the collected reviews (vendor_id being the app's id), read once by #6."""
        self.catalog = catalog
        self.price_estimator = price_estimator
        self.allocator = allocator
        self.feedback_path = Path(feedback_path or DATA_DIR / "feedback" / "feedback.jsonl")
        self.feedback_lock = threading.Lock()
        self.assistant = None  # #8, set by load_services (it calls back into estimate)
        if price_estimator is not None:
            # One #2 cache for the whole server: #3, #4 and #5 asking about the same plan share one prediction.
            self.builder = PackageBuilder(prices, price_estimator, settings=package_settings)
            self.estimates = self.builder.estimates
            self.matcher = self.builder.matcher
            self.quote_checker = QuoteChecker(price_estimator)
        else:
            self.builder = self.estimates = self.matcher = self.quote_checker = None
        self.review_model = review_model
        self.portfolio = portfolio  # #7, a PortfolioChecker
        self.review_labels = None
        if review_model is not None and reviews is not None and len(reviews):
            labels = review_model.predict(reviews["text"].tolist())
            self.review_labels = labels.assign(vendor_id=reviews["vendor_id"].to_numpy())

    def versions(self):
        return {
            "budget_allocator": getattr(self.allocator, "version", None),
            "price_estimator": getattr(self.price_estimator, "version", None),
            "review_insights": getattr(self.review_model, "version", None),
            "portfolio_check": getattr(self.portfolio, "version", None),
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

    def review_insights(self, vendor_id):
        """POST /v1/reviews/insights: #6's reading of the vendor's reviews, as praise and complaint counts per aspect
        (a mixed review counts in both) and a few pros and cons. A vendor without reviews gets empty lists."""
        self.require("review_model")
        rows = pd.DataFrame() if self.review_labels is None else self.review_labels
        rows = rows[rows["vendor_id"] == vendor_id] if len(rows) else rows
        aspects, pros, cons = [], [], []
        for aspect in self.review_model.aspects:
            labels = rows[aspect] if len(rows) else pd.Series(dtype=str)
            positive = int(labels.isin(["positive", "mixed"]).sum())
            negative = int(labels.isin(["negative", "mixed"]).sum())
            if positive or negative:
                aspects.append({"aspect": aspect, "positive": positive, "negative": negative})
            # One review, or one misreading by #6, shouldn't become a headline: pros and cons need two reviews each.
            if positive >= 2 and positive > negative:
                pros.append(f"{PROS[aspect]} ({positive} of {len(rows)} reviews)")
            if negative >= 2:
                cons.append(f"{CONS[aspect]} ({negative} of {len(rows)} reviews)")
        aspects.sort(key=lambda a: -(a["positive"] + a["negative"]))
        return {
            "vendor_id": vendor_id,
            "review_count": len(rows),
            "aspects": aspects,
            "pros": pros,
            "cons": cons,
            "model_version": self.review_model.version,
        }

    def portfolio_check(self, data, vendor_id):
        """POST /v1/portfolio/check: #7's tags for an uploaded photo, and whether it copies another vendor's.
        Raises ValueError for a file that isn't a readable image."""
        self.require("portfolio")
        return self.portfolio.check(data, vendor_id)

    def assistant_chat(self, messages):
        """POST /v1/assistant/chat: #8's turn. It estimates through self.estimate, so it needs #1 and #2 too."""
        self.require("assistant", "allocator", "price_estimator")
        return self.assistant.chat(messages)

    def feedback(self, record):
        """POST /v1/feedback: one JSON line per finished event, for retraining #1-#3 (README §11). No contact
        details: the plan, what was spent, guests and the host's rating."""
        line = json.dumps({"received_at": datetime.now(UTC).isoformat(), **record}, default=str)
        with self.feedback_lock:
            self.feedback_path.parent.mkdir(parents=True, exist_ok=True)
            with self.feedback_path.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
        return {"accepted": True}


def load_portfolio(env=os.environ):
    """#7's checker: the collected photos' index and CLIP embeddings (python -m shevent_ml.images.build) and the CLIP
    model. Without any of them, /v1/portfolio/check answers 503. PORTFOLIO_CHECK=0 skips it (CLIP takes ~15 s and
    ~600 MB to load)."""
    index_path = Path(env.get("IMAGE_INDEX_PATH") or PROCESSED_DIR / "image_index.parquet")
    embeddings_path = index_path.with_name("image_embeddings.npy")
    if env.get("PORTFOLIO_CHECK") == "0":
        return None
    if not (index_path.exists() and embeddings_path.exists()):
        log.warning("No image index (%s): /v1/portfolio/check will answer 503", index_path)
        return None
    embeddings = np.load(embeddings_path)
    if not len(embeddings):
        log.warning("The image index was built without CLIP (--no-clip): /v1/portfolio/check will answer 503")
        return None
    # The CLIP weights come from the local Hugging Face cache, so starting the server needs no internet.
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    try:
        from shevent_ml.images.check import PortfolioChecker
        from shevent_ml.images.embed import ClipEmbedder

        embedder = ClipEmbedder()
    except Exception as error:  # open_clip missing, or the weights not cached
        log.warning("CLIP couldn't load (%s): /v1/portfolio/check will answer 503", error)
        return None
    return PortfolioChecker(pd.read_parquet(index_path), embeddings, embedder, vendor_ids=app_vendor_id)


def load_services(env=os.environ):
    """Models from ml/artifacts and vendors from Supabase (SUPABASE_URL and SUPABASE_KEY, the publishable key), or
    the demo vendors in packages/core/fixtures when no database is configured."""
    from shevent_ml.models.budget_allocator import ARTIFACT_DIR as ALLOCATOR_DIR
    from shevent_ml.models.budget_allocator import BudgetAllocator
    from shevent_ml.models.price_estimator import ARTIFACT_DIR as ESTIMATOR_DIR
    from shevent_ml.models.price_estimator import PriceEstimator
    from shevent_ml.reviews.model import ARTIFACT_DIR as REVIEWS_DIR
    from shevent_ml.reviews.model import ReviewModel

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
    # Collected reviews (#6), keyed by app ids like the prices.
    reviews_path = Path(env.get("REVIEWS_PATH") or PROCESSED_DIR / "reviews.parquet")
    reviews = None
    if reviews_path.exists():
        reviews = pd.read_parquet(reviews_path)
        reviews = reviews.assign(vendor_id=reviews["vendor_id"].map(app_vendor_id))
    else:
        log.warning("No collected reviews (%s): review insights will be empty", reviews_path)
    services = Services(
        catalog,
        prices=prices,
        price_estimator=load(PriceEstimator, ESTIMATOR_DIR, "price estimator (#2)"),
        allocator=load(BudgetAllocator, ALLOCATOR_DIR, "budget allocator (#1)"),
        feedback_path=env.get("FEEDBACK_PATH"),
        review_model=load(ReviewModel, REVIEWS_DIR, "review insights (#6)"),
        reviews=reviews,
        portfolio=load_portfolio(env),
    )
    # #8 talks to a local Ollama; set OLLAMA_MODEL= (empty) to turn the assistant off.
    model = env.get("OLLAMA_MODEL", DEFAULT_LLM)
    if model:
        llm = OllamaClient(
            env.get("OLLAMA_URL", "http://127.0.0.1:11434"),
            model,
            float(env.get("OLLAMA_TIMEOUT_SECONDS", 90)),
            keep_alive=env.get("OLLAMA_KEEP_ALIVE", "30m"),
        )
        services.assistant = Assistant(llm, services, llm_replies=env.get("ASSISTANT_LLM_REPLIES") == "1")
    return services
