import json

import numpy as np
import pandas as pd
import pytest

from shevent_ml.data.build import build
from shevent_ml.data.load import load_reference
from shevent_ml.data.survey import build_survey, is_survey_test, parse_month, parse_pkr

# Column headers as Google Forms exports them: the question titles from host_survey_questions.md.
HEADERS = [
    "Timestamp",
    "What type of event was it?",
    "When was it held?",
    "Which area of Lahore?",
    "Type of venue",
    "Day of the week",
    "How many guests were invited?",
    "About how many guests actually came?",
    "What was your planned total budget? (PKR)",
    "What did you actually spend in total? (PKR)",
    "Venue / hall / marquee: amount spent (PKR)",
    "Catering / food: amount spent (PKR)",
    "If you know it, what was the per-head food price? (PKR per guest)",
    "Decor (stage, flowers, theme): amount spent (PKR)",
    "DJ / sound / music: amount spent (PKR)",
    "Lighting: amount spent (PKR)",
    "Everything else (photography, clothes, invitations, transport, etc.): amount spent (PKR)",
    "Did you go over budget?",
    "Anything else you'd like to share?",
]


def export(rows):
    return pd.DataFrame(rows, columns=HEADERS).astype(str)


ROWS = [
    [
        "2026/10/20 10:01:02",
        "Mehndi / Mayun",
        "12/2025",
        "DHA Phase 5",
        "Marquee",
        "Saturday",
        "300",
        "260",
        "25 lakh",
        "Rs 27,00,000",
        "600000",
        "1.1 million",
        "3500",
        "500000",
        "150k",
        "100000",
        "300000",
        "Yes, by less than 10%",
        "Call me on 0300 1234567",
    ],
    [
        "2026/10/20 11:00:00",
        "Birthday",
        "January 2026",
        "Johar Town",
        "Home",
        "Weekday (Mon–Thu)",
        "50",
        "45",
        "",
        "",
        "0",
        "120000",
        "",
        "40000",
        "20000",
        "0",
        "",
        "No",
        "",
    ],
    [
        "2026/10/21 09:30:00",
        "Walima",
        "2025-11",
        "Gulberg",
        "Banquet hall",
        "Sunday",
        "500",
        "",
        "40 lakh",
        "",
        "",
        "2000000",
        "",
        "",
        "",
        "",
        "",
        "Not sure",
        "",
    ],
]


def test_parse_pkr():
    assert parse_pkr("Rs 4,50,000") == 450000
    assert parse_pkr("4.5 lakh") == 450000
    assert parse_pkr("1.5 crore") == 15_000_000
    assert parse_pkr("150k") == 150000
    assert parse_pkr("0") == 0
    assert np.isnan(parse_pkr("")) and np.isnan(parse_pkr("around 5 bags")) and np.isnan(parse_pkr("5 goats"))


def test_parse_month():
    assert parse_month("December 2025") == pd.Timestamp("2025-12-15")
    assert parse_month("12/2025") == pd.Timestamp("2025-12-15")
    assert parse_month("12/1/2025") == pd.Timestamp("2025-12-15")
    assert pd.isna(parse_month("last winter"))


def test_build_survey_maps_questions_and_computes_shares():
    survey = build_survey(export(ROWS), load_reference()["area_aliases"])
    first, birthday, walima = survey.iloc[0], survey.iloc[1], survey.iloc[2]
    assert (first["event_type"], first["area"], first["venue_type"]) == ("wedding_mehndi", "DHA", "marquee")
    assert first["event_date"] == pd.Timestamp("2025-12-15") and first["total_budget_pkr"] == 2_500_000
    assert first["has_split"]
    spend = [600000, 1_100_000, 500000, 150000, 100000]
    assert first["share_catering"] == pytest.approx(1_100_000 / sum(spend))
    # A zero is a real answer ("didn't spend"); the planned budget falls back to the five categories' spend.
    assert birthday["has_split"] and birthday["share_venue"] == 0 and birthday["venue_type"] == "other"
    assert birthday["total_budget_pkr"] == 180000
    # Blank amounts mean "don't know": no split.
    assert not walima["has_split"] and np.isnan(walima["share_catering"])
    # The free-text answer (which here holds a phone number) is never kept.
    assert not any("0300" in str(v) for v in survey.to_numpy().ravel())
    assert survey["response_id"].is_unique


def test_survey_test_half_is_stable():
    ids = pd.Series([f"SV-{i:04}" for i in range(400)])
    test = is_survey_test(ids)
    assert 0.4 < test.mean() < 0.6
    assert test.equals(is_survey_test(ids))
    assert is_survey_test(ids.iloc[:10]).equals(test.iloc[:10])  # adding responses doesn't move old ones


def test_build_writes_the_survey_table(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    pd.DataFrame([{"vendor_id": "CAT-001", "name": "Caterers", "category": "catering", "base_area": "DHA"}]).to_csv(
        raw / "vendors.csv", index=False
    )
    export(ROWS).to_csv(raw / "host_survey.csv", index=False)
    manifest = build(raw, tmp_path / "out")
    assert manifest["rows"]["survey"] == 3 and "host_survey.csv" in manifest["raw_files"]
    assert pd.read_parquet(tmp_path / "out" / "survey.parquet")["has_split"].sum() == 2
    assert json.loads((tmp_path / "out" / "manifest.json").read_text())["dataset_hash"] == manifest["dataset_hash"]
