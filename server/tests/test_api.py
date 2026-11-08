import json
import os
from pathlib import Path

import pandas as pd
import pytest
from conftest import PLAN, FakeAllocator, FakeEstimator
from fastapi.testclient import TestClient

from app.catalog import StaticCatalog
from app.main import create_app
from app.services import FIXTURE_VENDORS, Services
from shevent_ml.config import CATEGORIES

CONTRACT_DIR = Path(__file__).parent / "contract"
VENUES = {"101": "00000000-0000-4000-8000-000000000101", "104": "00000000-0000-4000-8000-000000000104"}
PHOTOGRAPHERS = ["00000000-0000-4000-8000-000000000601", "00000000-0000-4000-8000-000000000602"]
QUOTE = {
    "plan": {k: v for k, v in PLAN.items() if k != "total_budget_pkr"},
    "category": "catering",
    "quoted_pkr": 2000,
    "unit": "per_head",
    "inclusions": ["Serving staff", "Crockery and cutlery"],
    "exclusions": ["Service tax extra"],
    "vendor_tier": "mid",
}
# One request per endpoint. Their answers are saved in tests/contract/, and packages/core checks the saved
# requests and answers against its zod schemas (schemas/server-contract.test.ts).
CONTRACT = {
    "estimate": PLAN,
    # 120 guests, so the sponsored rooftop (up to 150) can take the event.
    "recommend": {"plan": {**PLAN, "guest_count": 120}, "category": "venue", "budget_pkr": 675_000, "limit": 5},
    "packages": {"plan": PLAN, "categories": CATEGORIES, "unavailable_vendor_ids": [VENUES["101"]]},
    "quote-check": QUOTE,
    "feedback": {
        "plan_id": "plan-1",
        "plan": PLAN,
        "actual_spend_pkr": {"venue": 700_000, "catering": 950_000},
        "rating": 4,
    },
}


def test_health_names_the_models_and_counts_the_vendors(client):
    body = client.get("/health").json()
    assert body == {"status": "ok", "models": {"budget_allocator": "alloc-test", "price_estimator": "cost-test"},
                    "vendors": 15}  # fmt: skip


def test_estimate_splits_the_budget_and_gives_every_category_a_range(client):
    body = client.post("/v1/estimate", json=PLAN).json()
    assert set(body["allocation"]) == set(CATEGORIES)
    assert abs(sum(item["share"] for item in body["allocation"].values()) - 1) < 0.01
    assert body["allocation"]["catering"]["range"] == [450_000, 750_000]  # Rs 1,500-2,500 a head x 300
    assert body["season_factor"] == "peak_wedding_season"
    assert body["model_version"] == "alloc-test+cost-test"


@pytest.mark.parametrize(
    "change",
    [{"area": "Atlantis"}, {"guest_count": 9}, {"total_budget_pkr": 9_999}, {"event_date": "19/12/2026"},
     {"event_type": "funeral"}, {"preferences": ["x" * 41]}],
)  # fmt: skip
def test_bad_plans_are_rejected_before_any_model_runs(client, change):
    assert client.post("/v1/estimate", json={**PLAN, **change}).status_code == 422


def test_recommend_keeps_sponsored_vendors_in_their_own_list(client):
    body = client.post("/v1/recommend", json=CONTRACT["recommend"]).json()
    matches = [m["vendor_id"] for m in body["matches"]]
    assert VENUES["104"] not in matches and [m["vendor_id"] for m in body["sponsored"]] == [VENUES["104"]]
    assert matches and len(matches) <= 5
    for match in body["matches"]:
        assert match["category"] == "venue" and 0 <= match["score"] <= 1 and match["reasons"]
        assert match["price_range"][0] <= match["price_range"][1]
    assert [m["score"] for m in body["matches"]] == sorted((m["score"] for m in body["matches"]), reverse=True)


def test_packages_stay_within_budget_and_skip_booked_vendors(client):
    body = client.post("/v1/packages", json=CONTRACT["packages"]).json()
    assert [p["kind"] for p in body["packages"]] == ["cheapest", "balanced", "highest_quality"]
    for package in body["packages"]:
        assert package["total_pkr"] <= body["budget_pkr"] == PLAN["total_budget_pkr"]
        assert sorted(item["vendor"]["category"] for item in package["items"]) == sorted(CATEGORIES)
        assert VENUES["101"] not in {item["vendor"]["vendor_id"] for item in package["items"]}
        for item in package["items"]:
            low, high = item["price_range"]
            assert low <= item["price_pkr"] <= high and item["vendor"]["slug"]


def test_a_category_with_every_vendor_booked_is_reported_unfilled(client):
    request = {"plan": PLAN, "categories": ["venue", "photography"], "unavailable_vendor_ids": PHOTOGRAPHERS}
    body = client.post("/v1/packages", json=request).json()
    assert body["unfilled_categories"] == ["photography"]
    assert all(item["vendor"]["category"] == "venue" for p in body["packages"] for item in p["items"])


def test_packages_reject_repeated_categories(client):
    assert client.post("/v1/packages", json={"plan": PLAN, "categories": ["venue", "venue"]}).status_code == 422


def test_quote_check_reads_the_price_and_the_checklist(client):
    body = client.post("/v1/quote-check", json=QUOTE).json()
    assert body["level"] == "green" and body["compared_with"] == "same_tier"
    assert "Service tax" in body["charged_extra"] and "Transport" in body["ask_about"]
    high = client.post("/v1/quote-check", json={**QUOTE, "quoted_pkr": 4000}).json()
    assert high["level"] == "red" and high["percent_above_high"] > 25


def test_feedback_is_appended_for_retraining(client, services):
    assert client.post("/v1/feedback", json=CONTRACT["feedback"]).json() == {"accepted": True}
    client.post("/v1/feedback", json={**CONTRACT["feedback"], "rating": 5})
    lines = [json.loads(line) for line in services.feedback_path.read_text(encoding="utf-8").splitlines()]
    assert [line["rating"] for line in lines] == [4, 5] and lines[0]["actual_spend_pkr"]["venue"] == 700_000


def test_endpoints_whose_model_is_missing_answer_503_and_health_says_so():
    services = Services(StaticCatalog.from_fixture(FIXTURE_VENDORS))
    with TestClient(create_app(services)) as client:
        assert client.post("/v1/estimate", json=PLAN).status_code == 503
        assert client.post("/v1/packages", json=CONTRACT["packages"]).status_code == 503
        assert client.get("/health").json()["status"] == "degraded"


def test_contract_samples_are_current(client):
    """The saved samples are what the server answers now. UPDATE_CONTRACT=1 rewrites them after a deliberate
    change; packages/core then checks them against the zod schemas."""
    for name, request in CONTRACT.items():
        response = client.post(f"/v1/{name}", json=request)
        assert response.status_code == 200, response.text
        sample = {"request": request, "response": response.json()}
        path = CONTRACT_DIR / f"{name}.json"
        text = json.dumps(sample, indent=2, ensure_ascii=False) + "\n"
        if os.environ.get("UPDATE_CONTRACT") == "1":
            path.write_text(text, encoding="utf-8")
        assert path.exists(), f"No {path.name}: run with UPDATE_CONTRACT=1"
        assert json.loads(path.read_text(encoding="utf-8")) == sample, f"{path.name} is stale: UPDATE_CONTRACT=1"


def test_a_listed_price_is_used_and_not_marked_as_an_estimate(tmp_path):
    caterer = "00000000-0000-4000-8000-000000000201"
    prices = pd.DataFrame(
        [{"vendor_id": caterer, "category": "catering", "price_basis": "per_head", "low_pkr_adj": 1600.0,
          "mid_pkr_adj": 1800.0, "high_pkr_adj": 2100.0, "guest_min": None, "guest_max": None, "is_combo": False}]
    )  # fmt: skip
    services = Services(
        StaticCatalog.from_fixture(FIXTURE_VENDORS),
        price_estimator=FakeEstimator(),
        allocator=FakeAllocator(),
        feedback_path=tmp_path / "feedback.jsonl",
        prices=prices,
    )
    with TestClient(create_app(services)) as client:
        request = {"plan": PLAN, "category": "catering", "budget_pkr": 950_000}
        matches = client.post("/v1/recommend", json=request).json()["matches"]
        match = next(m for m in matches if m["vendor_id"] == caterer)
        assert match["price_range"] == [480_000, 630_000]  # Rs 1,600-2,100 a head x 300
        body = client.post("/v1/packages", json={"plan": PLAN, "categories": ["catering"]}).json()
        items = [i for p in body["packages"] for i in p["items"] if i["vendor"]["vendor_id"] == caterer]
        assert items and all(i["price_pkr"] == 540_000 and not i["price_is_estimate"] for i in items)
