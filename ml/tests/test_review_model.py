import numpy as np
import pandas as pd
import pytest

from shevent_ml.config import load_config
from shevent_ml.reviews.labels import NOT_MENTIONED, settings
from shevent_ml.reviews.model import (
    EnglishBaseline,
    ReviewModel,
    clause_examples,
    clauses,
    read_labels,
    score,
    write_sheet,
)

CONFIG = settings()
ASPECTS = list(CONFIG["aspects"])


@pytest.fixture(scope="module")
def model():
    return ReviewModel(CONFIG).fit(clause_examples(load_config("review_phrases"), np.random.default_rng(0)))


def labels_of(prediction):
    return {a: v for a, v in prediction.items() if v != NOT_MENTIONED}


@pytest.mark.parametrize(
    "text, parts",
    [
        ("The food was great but the staff was rude.", ["The food was great", "the staff was rude"]),
        ("Khana acha tha lekin waiter late aaye", ["Khana acha tha", "waiter late aaye"]),
        ("کھانا اچھا تھا مگر عملہ بدتمیز تھا۔", ["کھانا اچھا تھا", "عملہ بدتمیز تھا"]),
        ("Excellent", ["Excellent"]),
    ],
)
def test_reviews_are_split_into_clauses(text, parts):
    assert clauses(text) == parts


def test_praise_and_complaint_in_one_review_are_told_apart(model):
    predicted = model.predict(["Khana bohat mazedar tha lekin staff ka rawaiya bohat bura tha"]).iloc[0]
    assert labels_of(predicted) == {"food_quality": "positive", "staff_behaviour": "negative"}


def test_an_aspect_praised_and_criticised_is_mixed(model):
    predicted = model.predict(["The food was delicious. But the biryani was undercooked."]).iloc[0]
    assert labels_of(predicted) == {"food_quality": "mixed"}


def test_urdu_script_is_read(model):
    predicted = model.predict(["تصویریں دھندلی اور اندھیری تھیں"]).iloc[0]
    assert labels_of(predicted) == {"photo_video_quality": "negative"}


def test_the_saved_model_predicts_the_same(model, tmp_path):
    texts = ["they arrived two hours late", "rate bohat munasib the", "ڈی جے نے سب کو محظوظ رکھا"]
    model.version = "reviews-test"
    model.save(tmp_path, {"note": "test"})
    loaded = ReviewModel.load(tmp_path, CONFIG)
    assert loaded.version == "reviews-test" and loaded.predict(texts).equals(model.predict(texts))


def test_the_baseline_reads_english_only():
    baseline = EnglishBaseline(CONFIG)
    english, roman_urdu = baseline.predict(["The food was cold and the staff was rude", "Khana thanda tha"]).to_dict(
        "records"
    )
    assert english["food_quality"] == "negative" and english["staff_behaviour"] == "negative"
    assert labels_of(roman_urdu) == {}


def test_a_perfect_prediction_scores_one():
    actual = pd.DataFrame([dict.fromkeys(ASPECTS, NOT_MENTIONED) | {"food_quality": "negative"}] * 3)
    result = score(actual.copy(), actual, ASPECTS)
    assert result["label_accuracy_where_mentioned"] == 1.0 and result["rows"] == 3


def test_hand_labels_are_read_and_checked(tmp_path):
    path = tmp_path / "review_labels.csv"
    row = {"review_id": "R-1", **dict.fromkeys(ASPECTS, ""), "food_quality": " Negative "}
    pd.DataFrame([row]).to_csv(path, index=False)
    labels = read_labels(path, ASPECTS)
    assert labels.loc[0, "food_quality"] == "negative" and labels.loc[0, "punctuality"] == NOT_MENTIONED
    pd.DataFrame([row | {"punctuality": "late"}]).to_csv(path, index=False)
    with pytest.raises(ValueError, match="punctuality"):
        read_labels(path, ASPECTS)


def test_the_sheet_lists_the_test_set_first(tmp_path):
    reviews = pd.DataFrame(
        {"review_id": ["R-1", "R-2", "R-3"], "language": "en", "rating": [5.0, 1.0, 4.0], "text": ["a", "b", "c"]}
    )
    sheet = write_sheet(reviews, {"R-3"}, ASPECTS, tmp_path / "sheet.csv")
    assert sheet["review_id"].tolist() == ["R-3", "R-1", "R-2"] and (sheet[ASPECTS] == "").all().all()
