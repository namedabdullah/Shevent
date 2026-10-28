import json

import numpy as np
import pandas as pd
import pytest

from shevent_ml.config import load_config
from shevent_ml.eval.baselines import CATEGORIES
from shevent_ml.models.budget_allocator import BudgetAllocator, apply_guardrails, train
from shevent_ml.synthetic.generate import write

SETTINGS = {**load_config("budget_allocator"), "epochs": 8}
PLAN = {
    "event_type": "wedding_mehndi",
    "guest_count": 300,
    "area": "DHA",
    "venue_type": "marquee",
    "event_date": "2026-12-19",
    "total_budget_pkr": 2_500_000,
    "preferences": ["decor_heavy"],
}


@pytest.fixture(scope="module")
def synthetic_dir(tmp_path_factory):
    out = tmp_path_factory.mktemp("processed")
    write(2500, out, seed=9)
    return out


@pytest.fixture(scope="module")
def trained(synthetic_dir):
    return train(synthetic_dir, SETTINGS, log=lambda *_: None)


def test_guardrails_raise_underfunded_categories_and_keep_the_total():
    shares = {"venue": 0.3, "catering": 0.5, "decor": 0.1, "dj_sound": 0.05, "lighting": 0.05}
    out = apply_guardrails(shares, 1_000_000, {"catering": 600_000, "dj_sound": 20_000})
    assert out["amounts"]["catering"] == 600_000 and out["raised"] == ["catering"]
    assert sum(out["amounts"].values()) == pytest.approx(1_000_000)
    # The other categories share the rest in the model's proportions.
    assert out["amounts"]["venue"] / out["amounts"]["decor"] == pytest.approx(3)
    assert not out["budget_too_low"]


def test_guardrails_repeat_until_nothing_is_under():
    shares = {"venue": 0.6, "catering": 0.3, "decor": 0.1}
    # Raising catering leaves too little for decor, which must then be raised too.
    out = apply_guardrails(shares, 1000, {"catering": 500, "decor": 120})
    assert out["raised"] == ["catering", "decor"] and out["amounts"]["venue"] == pytest.approx(380)


def test_guardrails_report_a_budget_that_is_too_low():
    out = apply_guardrails({"venue": 0.5, "catering": 0.5}, 900, {"venue": 400, "catering": 700})
    assert out["budget_too_low"] and out["minimum_budget_pkr"] == 1100
    assert out["amounts"] == {"venue": 400, "catering": 700}


def test_shares_sum_to_one_and_the_model_beats_the_planner_split(trained, synthetic_dir):
    model, report = trained
    check = report["synthetic_check"]
    assert check["model"]["share_mae"] < check["planner_split"]["share_mae"]
    assert check["model"]["kl"] < check["planner_split"]["kl"]
    assert "survey_test" not in report and report["dataset_hash"] == "none"
    predicted = model.predict(pd.DataFrame([PLAN, {**PLAN, "area": "Unknown place"}]))
    assert np.allclose(predicted.sum(axis=1), 1) and list(predicted.columns) == CATEGORIES


def test_decor_heavy_moves_share_to_decor(trained):
    model, _ = trained
    shares = model.predict(pd.DataFrame([PLAN, {**PLAN, "preferences": []}]))
    assert shares.loc[0, "decor"] > shares.loc[1, "decor"]


def test_shapley_values_add_up_to_the_difference_from_the_typical_event(trained):
    model, _ = trained
    phi = model.shapley(PLAN)
    assert list(phi.index) == list(model.encoder.GROUPS)
    shares = model.predict(pd.DataFrame([PLAN])).iloc[0].to_numpy()
    typical = model._shares(model.reference[None, :])[0]
    np.testing.assert_allclose(phi.sum(axis=0).to_numpy(), 100 * (shares - typical), atol=1e-4)


def test_allocate_applies_guardrails_and_explains(trained):
    model, _ = trained
    out = model.allocate(PLAN, {"catering": 1_500_000})
    amounts = {c: v["pkr"] for c, v in out["allocation"].items()}
    assert amounts["catering"] == 1_500_000
    assert sum(amounts.values()) == pytest.approx(2_500_000, abs=5000)  # each amount is rounded to Rs 1,000
    assert sum(v["share"] for v in out["allocation"].values()) == pytest.approx(1)
    assert any("Catering was raised" in w for w in out["warnings"])
    assert not any(
        e.startswith("Catering") for e in out["explanations"]
    )  # its share is the guardrail's, not the model's
    assert out["model_version"].startswith("alloc-v1-")


def test_allocate_says_when_the_budget_is_too_low(trained):
    model, _ = trained
    out = model.allocate({**PLAN, "total_budget_pkr": 300_000}, {c: 100_000 for c in CATEGORIES})
    # Rs 1 lakh for each of the six categories: Rs 6 lakh, Rs 3 lakh more than the budget.
    assert out["budget_too_low"] and out["minimum_budget_pkr"] == 600_000
    assert "Rs 300,000 more" in out["warnings"][0]
    assert out["explanations"] == []


def test_save_and_load_give_the_same_split(trained, tmp_path):
    model, report = trained
    model.save(tmp_path, report)
    loaded = BudgetAllocator.load(tmp_path)
    plans = pd.DataFrame([PLAN])
    pd.testing.assert_frame_equal(model.predict(plans), loaded.predict(plans))
    assert loaded.version == model.version


def test_with_survey_splits_it_scores_on_the_test_half(synthetic_dir, tmp_path):
    for name in ["synthetic_events.parquet", "synthetic_manifest.json"]:
        (tmp_path / name).write_bytes((synthetic_dir / name).read_bytes())
    events = pd.read_parquet(synthetic_dir / "synthetic_events.parquet").head(80)
    survey = events.rename(columns={"guest_count_invited": "guests_invited"}).assign(
        response_id=[f"SV-{i:04}" for i in range(80)], has_split=True, day="Saturday"
    )
    survey.to_parquet(tmp_path / "survey.parquet")
    (tmp_path / "manifest.json").write_text(json.dumps({"dataset_hash": "real456"}))
    _, report = train(tmp_path, SETTINGS, log=lambda *_: None)
    assert report["dataset_hash"] == "real456"
    test = report["survey_test"]
    assert set(test) == {"model", "planner_split", "per_category_regressors"}
    assert 20 < test["model"]["rows"] < 60
