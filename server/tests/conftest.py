# shevent_ml first: it loads the right C++ runtime before pandas or LightGBM (see shevent_ml/__init__.py).
import shevent_ml  # noqa: F401, I001

from datetime import date

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.assistant import Assistant
from app.assistant.extract import SCHEMA
from app.catalog import StaticCatalog
from app.main import create_app
from app.services import FIXTURE_VENDORS, Services
from shevent_ml.config import CATEGORIES
from shevent_ml.models.price_estimator import PriceEstimator
from shevent_ml.reviews.labels import settings as review_settings

PLAN = {
    "event_type": "wedding_mehndi",
    "guest_count": 300,
    "area": "Gulberg",
    "venue_type": "marquee",
    "event_date": "2026-12-19",
    "total_budget_pkr": 2_500_000,
}
TODAY = date(2026, 11, 8)
# What the host types, and how the model reads it.
CHAT = "Mehndi in a marquee for 300 guests in Gulberg on 19 December, around 25 lakh"
READING = {"event_type": "wedding_mehndi", "guest_count": 300, "area": "Gulberg", "venue_type": "marquee",
           "date_text": "19 December", "event_date": "2026-12-19", "budget_text": "25 lakh"}  # fmt: skip
SHARES = {"venue": 0.27, "catering": 0.38, "decor": 0.12, "dj_sound": 0.07, "lighting": 0.07, "photography": 0.09}


class FakeEstimator:
    """Catering Rs 1,500-2,500 per head; every other category Rs 1-2 lakh. Premium x2. The plan methods are
    PriceEstimator's own, so batching and per-head scaling are the real code."""

    version = "cost-test"
    estimate_plan = PriceEstimator.estimate_plan
    estimate_plan_tiers = PriceEstimator.estimate_plan_tiers

    def predict(self, X):
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


CATERER = "00000000-0000-4000-8000-000000000201"
# Three reviews of one demo caterer and what the fake #6 reads in them.
REVIEWS = pd.DataFrame(
    {
        "vendor_id": [CATERER] * 3,
        "text": ["Delicious food, polite staff", "Tasty food but they came late", "Late again and the food was cold"],
    }
)
READINGS = {
    "Delicious food, polite staff": {"food_quality": "positive", "staff_behaviour": "positive"},
    "Tasty food but they came late": {"food_quality": "positive", "punctuality": "negative"},
    "Late again and the food was cold": {"food_quality": "negative", "punctuality": "negative"},
}


class FakeReviewModel:
    """Fixed readings, shaped like ReviewModel.predict's answer."""

    version = "reviews-test"
    aspects = list(review_settings()["aspects"])

    def predict(self, texts):
        return pd.DataFrame([dict.fromkeys(self.aspects, "not_mentioned") | READINGS.get(t, {}) for t in texts])


class FakePortfolioChecker:
    """A fixed answer, shaped like PortfolioChecker.check's; anything but JPEG bytes isn't an image."""

    version = "portfolio-test"

    def check(self, data, vendor_id):
        if not data.startswith(bytes.fromhex("ffd8ff")):
            raise ValueError("not a readable image")
        match = {"media_id": "M-0495", "vendor_id": "venue-1", "phash_distance": 0, "clip_similarity": 1.0}
        return {
            "tags": [{"label": "stage", "score": 0.81}, {"label": "floral", "score": 0.64}],
            "duplicate": {"status": "duplicate" if vendor_id != "venue-1" else "unique",
                          "matches": [match] if vendor_id != "venue-1" else []},
            "phash": "81ce79598e117cb3",
            "model_version": self.version,
        }  # fmt: skip


class FakeAllocator:
    """A fixed split, shaped like BudgetAllocator.allocate's answer."""

    version = "alloc-test"

    def predict(self, plans):
        return pd.DataFrame([SHARES] * len(plans), index=plans.index)

    def allocate(self, plan, minimums=None):
        budget = plan["total_budget_pkr"]
        return {
            "allocation": {c: {"share": SHARES[c], "pkr": round(SHARES[c] * budget, -3)} for c in CATEGORIES},
            "budget_too_low": False,
            "minimum_budget_pkr": sum((minimums or {}).values()),
            "warnings": [],
            "explanations": ["Catering takes the largest share for 300 guests."],
            "model_version": self.version,
        }


class FakeLLM:
    """Stands in for Ollama. Extraction answers with `reading` (a dict, or a function of the prompt), replies with
    `reply`; either may be an exception to raise."""

    version = "llm-test"

    def __init__(self, reading=READING, reply="Catering takes the biggest share. Open the plan to see vendors."):
        self.reading, self.reply, self.calls = reading, reply, []

    def warm_up(self):
        pass

    def chat(self, messages, schema=None, max_tokens=300):
        self.calls.append((messages, schema))
        answer = self.reply if schema is None else self.reading
        answer = answer(messages) if callable(answer) else answer
        if isinstance(answer, Exception):
            raise answer
        return answer if schema is None else {key: answer.get(key) for key in SCHEMA["required"]}


@pytest.fixture
def services(tmp_path):
    services = Services(
        StaticCatalog.from_fixture(FIXTURE_VENDORS),
        price_estimator=FakeEstimator(),
        allocator=FakeAllocator(),
        feedback_path=tmp_path / "feedback.jsonl",
        review_model=FakeReviewModel(),
        reviews=REVIEWS,
        portfolio=FakePortfolioChecker(),
    )
    services.assistant = Assistant(FakeLLM(), services, llm_replies=True, today=lambda: TODAY)
    return services


@pytest.fixture
def client(services):
    with TestClient(create_app(services)) as client:
        yield client
