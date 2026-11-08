# shevent_ml first: it loads the right C++ runtime before pandas or LightGBM (see shevent_ml/__init__.py).
import shevent_ml  # noqa: F401, I001

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.catalog import StaticCatalog
from app.main import create_app
from app.services import FIXTURE_VENDORS, Services
from shevent_ml.config import CATEGORIES
from shevent_ml.models.price_estimator import PriceEstimator

PLAN = {
    "event_type": "wedding_mehndi",
    "guest_count": 300,
    "area": "Gulberg",
    "venue_type": "marquee",
    "event_date": "2026-12-19",
    "total_budget_pkr": 2_500_000,
}
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


@pytest.fixture
def services(tmp_path):
    return Services(
        StaticCatalog.from_fixture(FIXTURE_VENDORS),
        price_estimator=FakeEstimator(),
        allocator=FakeAllocator(),
        feedback_path=tmp_path / "feedback.jsonl",
    )


@pytest.fixture
def client(services):
    with TestClient(create_app(services)) as client:
        yield client
