import json

import numpy as np
import pandas as pd
import pytest

from shevent_ml.config import CATEGORIES, load_config
from shevent_ml.eval.metrics import quadratic_weighted_kappa, set_precision_recall
from shevent_ml.models.quote_checker import (
    ChecklistReader,
    QuoteChecker,
    clauses,
    evaluate,
    levels,
    load_checklist,
    load_labels,
    nice,
    planted_check,
    write_sheet,
)

SETTINGS = load_config("quote_checker")
PLAN = {
    "event_type": "wedding_mehndi",
    "event_date": "2026-12-19",
    "guest_count": 300,
    "area": "Gulberg",
    "venue_type": "marquee",
}


class FakeEstimator:
    """Catering Rs 1,500-2,500 per head; every other category Rs 1-2 lakh for the booking. Premium vendors x2."""

    version = "cost-test"

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


@pytest.fixture
def checker():
    return QuoteChecker(FakeEstimator(), SETTINGS)


@pytest.fixture
def reader():
    return ChecklistReader(SETTINGS)


def test_checklist_covers_every_category_with_consistent_items():
    checklist = load_checklist()
    assert set(checklist) == set(CATEGORIES)
    labels = {}
    for items in checklist.values():
        ids = [i["item"] for i in items]
        assert len(ids) == len(set(ids))
        for item in items:
            assert labels.setdefault(item["item"], item["label"]) == item["label"]


def test_clauses_keep_numbers_whole():
    assert clauses("Overtime Rs 10,000 per hour, fuel extra. 2.5 lakh total") == [
        "overtime rs 10,000 per hour",
        "fuel extra",
        "2.5 lakh total",
    ]


def test_unmentioned_items_are_asked_about(reader):
    result = reader.read("dj_sound", ["DJ for 4 hours"])
    assert result["ask_about"] == ["Overtime charges", "Sound permit", "Generator fuel"]
    assert result["charged_extra"] == []


def test_mentioned_items_count_as_included(reader):
    result = reader.read("dj_sound", ["Generator included", "NOC arranged by us"], notes="Overtime is free")
    assert result["ask_about"] == [] and result["charged_extra"] == []


def test_cues_mark_items_charged_extra(reader):
    result = reader.read("venue", ["Generator fuel not included"], notes="Plus tax. Overtime included")
    assert result["status"] == {"generator_fuel": "extra", "service_tax": "extra", "overtime": "included"}
    assert result["charged_extra"] == ["Generator fuel", "Service tax"]


def test_a_cue_in_one_clause_does_not_reach_the_next(reader):
    result = reader.read("venue", ["Generator included, tax extra"])
    assert result["status"]["generator_fuel"] == "included" and result["status"]["service_tax"] == "extra"


def test_the_items_own_words_are_not_a_cue(reader):
    # "extra hour" is how overtime is named, not a sign that it costs extra.
    assert reader.read("dj_sound", ["One extra hour included"])["status"]["overtime"] == "included"


def test_exclusions_are_charged_extra_and_other_exclusions_pass_through(reader):
    result = reader.read("catering", ["Waiters"], exclusions=["Transport", "Crockery upgrade", "Live BBQ station"])
    assert result["status"]["transport"] == "extra" and result["status"]["crockery"] == "extra"
    assert result["charged_extra"] == ["Crockery and cutlery", "Transport", "Live BBQ station"]
    assert result["ask_about"] == ["Service tax"]


def test_items_that_need_a_number_need_one(reader):
    vague = reader.read("photography", ["Edited photos", "Fast delivery"])["status"]
    assert vague["edited_photos"] == "not_mentioned" and vague["delivery_time"] == "not_mentioned"
    specific = reader.read("photography", ["300 edited photos", "Delivery in two weeks"])["status"]
    assert specific["edited_photos"] == "included" and specific["delivery_time"] == "included"


def test_roman_urdu_cues(reader):
    assert reader.read("venue", ["Generator ka kharcha shamil nahi"])["status"]["generator_fuel"] == "extra"
    assert reader.read("venue", ["Tax shamil hai"])["status"]["service_tax"] == "included"


def test_levels_at_the_boundaries():
    level, above, below = levels([100, 125, 126, 50, 100], [80, 80, 80, 80, np.nan], [100, 100, 100, 100, np.nan], 0.25)
    assert list(level) == ["green", "yellow", "red", "green", None]
    assert np.isnan(above[0]) and above[1] == pytest.approx(0.25) and above[2] == pytest.approx(0.26)
    assert below[3] == pytest.approx(0.375) and np.isnan(below[0])


def test_nice_keeps_three_significant_figures():
    assert nice(1847) == 1850 and nice(675_432) == 675_000 and nice(95) == 95


def test_per_head_quote_compared_with_per_head_range(checker):
    result = checker.check({"plan": PLAN, "category": "catering", "unit": "per_head", "quoted_pkr": 2600})
    assert result["typical_range"] == [1500, 2500]
    assert result["level"] == "yellow" and result["percent_above_high"] == 4
    assert result["percent_below_low"] is None
    assert result["compared_with"] == "all_vendors"
    assert result["model_version"] == "quote-v1/cost-test"


def test_the_vendors_tier_sets_the_range(checker):
    quote = {"plan": PLAN, "category": "venue", "unit": "per_slot", "quoted_pkr": 350_000}
    premium = checker.check({**quote, "vendor_tier": "premium"})
    assert premium["typical_range"] == [200_000, 400_000] and premium["level"] == "green"
    assert premium["compared_with"] == "same_tier"
    unknown = checker.check({**quote, "vendor_tier": "luxury"})
    assert unknown["compared_with"] == "all_vendors" and unknown["level"] == "red"


def test_flat_catering_quote_uses_per_head_prices_times_guests(checker):
    result = checker.check({"plan": PLAN, "category": "catering", "unit": "per_event", "quoted_pkr": 600_000})
    assert result["typical_range"] == [450_000, 750_000] and result["level"] == "green"


def test_per_head_venue_quote_divides_the_booking_range(checker):
    result = checker.check({"plan": PLAN, "category": "venue", "unit": "per_head", "quoted_pkr": 1000})
    assert result["typical_range"] == [333, 667] and result["level"] == "red" and result["percent_above_high"] == 50


def test_per_hour_quote_uses_its_hours_or_the_default(checker):
    quote = {"plan": PLAN, "category": "dj_sound", "unit": "per_hour", "quoted_pkr": 30_000}
    assert checker.check({**quote, "hours": 5})["typical_range"] == [20_000, 40_000]
    assert checker.check(quote)["typical_range"] == [25_000, 50_000]  # default 4 hours


def test_below_the_range_stays_green_and_says_how_far(checker):
    result = checker.check({"plan": PLAN, "category": "decor", "unit": "per_package", "quoted_pkr": 60_000})
    assert result["level"] == "green" and result["percent_below_low"] == 40


def test_check_reads_the_checklist(checker):
    result = checker.check(
        {
            "plan": PLAN,
            "category": "lighting",
            "unit": "per_event",
            "quoted_pkr": 150_000,
            "inclusions": ["Fairy lights", "Setup and teardown"],
            "exclusions": ["Generator"],
        }
    )
    assert result["ask_about"] == ["Transport"] and result["charged_extra"] == ["Generator fuel"]


def test_quadratic_weighted_kappa():
    assert quadratic_weighted_kappa([0, 1, 2, 2], [0, 1, 2, 2], 3) == pytest.approx(1.0)
    assert quadratic_weighted_kappa([0, 1, 2], [0, 0, 0], 3) == 0.0
    # Off by one level costs less than off by two.
    near = quadratic_weighted_kappa([0, 1, 2, 0], [0, 1, 2, 1], 3)
    far = quadratic_weighted_kappa([0, 1, 2, 0], [0, 1, 2, 2], 3)
    assert 0 < far < near < 1


def test_set_precision_recall():
    scores = set_precision_recall([["a", "b"], []], [["a"], ["c"]])
    assert scores == {"precision": 0.5, "recall": 0.5}


def test_load_labels_checks_levels_and_items(tmp_path):
    path = tmp_path / "quote_labels.csv"
    path.write_text("quote_id,level,not_included\nQ-001, Green ,transport|service_tax\nQ-002,red,\n")
    labels = load_labels(path)
    assert labels["level"].tolist() == ["green", "red"]
    assert labels["not_included"].tolist() == [["transport", "service_tax"], []]
    path.write_text("quote_id,level\nQ-001,orange\n")
    with pytest.raises(ValueError, match="level must be one of"):
        load_labels(path)
    path.write_text("quote_id,level,not_included\nQ-001,red,parking\n")
    with pytest.raises(ValueError, match="unknown checklist items"):
        load_labels(path)


def quotes_table():
    base = {
        "scenario_id": "S1",
        "event_type": "wedding_mehndi",
        "guests": 300,
        "hours": 4,
        "area": "Gulberg",
        "venue_type": "marquee",
        "day": "Saturday",
        "event_month": "2026-12",
        "unit_note": "",
        "exclusions": "",
    }
    return pd.DataFrame(
        [
            {**base, "quote_id": "Q-001", "category": "catering", "unit": "per_head", "price_basis": "per_head",
             "price_pkr": 2000, "price_pkr_adj": 2000, "inclusions": "waiters|crockery|transport|gst included"},
            {**base, "quote_id": "Q-002", "category": "venue", "unit": "per_slot", "price_basis": "flat",
             "price_pkr": 400_000, "price_pkr_adj": 400_000, "inclusions": "stage", "exclusions": "generator"},
            {**base, "quote_id": "Q-003", "category": "decor", "unit": "per_package", "price_basis": "flat",
             "price_pkr": 230_000, "price_pkr_adj": 230_000, "inclusions": "setup|transport"},
        ]
    )  # fmt: skip


def test_evaluate_scores_levels_and_checklist(checker):
    labels = pd.DataFrame(
        {
            "quote_id": ["Q-001", "Q-002", "Q-003"],
            "level": ["green", "red", "yellow"],
            "not_included": [[], ["generator_fuel", "service_tax", "overtime"], []],
        }
    )
    prices = pd.DataFrame(
        {
            "category": ["catering"] * 3 + ["venue"] * 3,
            "price_basis": ["per_head"] * 3 + ["flat"] * 3,
            "area": ["Gulberg"] * 6,
            "mid_pkr_adj": [1800, 2000, 2200, 150_000, 200_000, 250_000],
        }
    )
    quotes = quotes_table()
    quotes["vendor_id"] = ["CAT-001", "VEN-001", "DEC-001"]
    report = evaluate(checker, quotes, labels, prices)
    assert report["levels"]["checker"] == {"quotes": 3, "with_verdict": 3, "accuracy": 1.0, "kappa": 1.0}
    # Compared within the venue's premium tier, its Rs 4 lakh is typical: the label says red, so one miss.
    vendors = pd.DataFrame({"vendor_id": ["CAT-001", "VEN-001", "DEC-001"], "price_tier": ["mid", "premium", None]})
    assert evaluate(checker, quotes, labels, prices, vendors)["levels"]["checker"]["accuracy"] == pytest.approx(2 / 3)
    # The lookup has never seen decor: no verdict for Q-003, which counts against it.
    assert report["levels"]["median_lookup"]["with_verdict"] == 2
    assert report["levels"]["always_green"]["accuracy"] == pytest.approx(1 / 3)
    assert report["checklist"]["checker"] == {"precision": 1.0, "recall": 1.0}
    assert report["checklist"]["ask_about_everything"]["precision"] < 1.0


def test_labelling_sheet_shows_no_model_output(tmp_path):
    sheet = write_sheet(quotes_table(), out=tmp_path / "sheet.csv")
    assert sheet["what_was_asked"].str.len().gt(0).all()
    assert (sheet[["level", "not_included"]] == "").all().all()
    assert "Generator fuel" in sheet.loc[1, "checklist_items"]


def test_planted_check_runs_on_new_synthetic_events(tmp_path):
    synthetic = load_config("synthetic")
    (tmp_path / "synthetic_manifest.json").write_text(
        json.dumps({"settings": synthetic, "base_prices": synthetic["base_prices"]})
    )
    settings = {**SETTINGS, "planted": {"events": 50, "seed": 1, "markups": [1.0, 3.0]}}
    report = planted_check(QuoteChecker(FakeEstimator(), settings), tmp_path)
    assert set(report) == {"same_tier", "all_vendors"}
    for shares in report.values():
        assert set(shares) == {"x1", "x3"}
        for level_shares in shares.values():
            assert sum(level_shares.values()) == pytest.approx(1.0)
        assert shares["x3"]["red"] > shares["x1"]["red"]
