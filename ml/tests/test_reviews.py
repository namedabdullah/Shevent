import json
import xml.etree.ElementTree as ET

import pandas as pd
import pytest
from pydantic import ValidationError

from shevent_ml.reviews.draft import choose_test_reviews, run
from shevent_ml.reviews.labels import (
    EXAMPLES,
    full_labels,
    label_model,
    label_studio_config,
    prompt_messages,
    prompt_version,
    read_label_studio_export,
    settings,
)
from shevent_ml.reviews.ollama import OllamaError

CONFIG = settings()
ASPECTS = list(CONFIG["aspects"])


def make_reviews(n=40):
    languages = ["en"] * 6 + ["roman_ur", "mixed", "ur", "en"]
    return pd.DataFrame(
        {
            "review_id": [f"R-{i:04}" for i in range(1, n + 1)],
            "vendor_id": [f"CAT-{i % 5:03}" for i in range(n)],
            "rating": 4.0,
            "text": [f"Review number {i}, khana acha tha" for i in range(n)],
            "language": [languages[i % len(languages)] for i in range(n)],
            "source": "google_maps",
            "review_date": pd.Timestamp("2026-09-01"),
        }
    )


def test_examples_use_only_known_aspects_and_labels():
    model = label_model(CONFIG)
    for _, labels in EXAMPLES:
        model.model_validate(full_labels(labels, CONFIG))


def test_label_model_rejects_unknown_labels_and_extra_fields():
    model = label_model(CONFIG)
    good = full_labels({"food_quality": "positive"}, CONFIG)
    assert model.model_validate(good).model_dump() == good
    with pytest.raises(ValidationError):
        model.model_validate({**good, "food_quality": "great"})
    with pytest.raises(ValidationError):
        model.model_validate({**good, "decor": "positive"})
    with pytest.raises(ValidationError):
        model.model_validate({k: v for k, v in good.items() if k != "punctuality"})


def test_prompt_ends_with_the_review_and_changes_version_with_the_aspects():
    messages = prompt_messages("Sound system kharab tha", CONFIG)
    assert messages[0]["role"] == "system" and all(a in messages[0]["content"] for a in ASPECTS)
    assert messages[-1] == {"role": "user", "content": "Sound system kharab tha"}
    assert len(messages) == 2 + 2 * len(EXAMPLES)
    fewer = {**CONFIG, "aspects": dict(list(CONFIG["aspects"].items())[:3])}
    assert prompt_version(fewer) != prompt_version(CONFIG)


def test_label_studio_config_is_valid_xml_with_a_question_per_aspect():
    root = ET.fromstring(label_studio_config(CONFIG))
    choices = root.findall("Choices")
    assert [c.get("name") for c in choices] == ASPECTS
    # not_mentioned is the blank answer, not a button.
    assert [c.get("value") for c in choices[0]] == ["positive", "negative", "mixed"]


def test_test_set_meets_the_mixed_language_quota():
    reviews = make_reviews(40)  # 12 of 40 are Roman Urdu / Urdu / mixed
    chosen = choose_test_reviews(reviews, size=20, min_non_english=0.3, seed=1)
    assert len(chosen) == 20 and len(set(chosen)) == 20
    languages = reviews.set_index("review_id").loc[chosen, "language"]
    assert languages.isin(["roman_ur", "ur", "mixed"]).sum() >= 6
    assert chosen == choose_test_reviews(reviews, size=20, min_non_english=0.3, seed=1)


class FakeChat:
    """Stands in for Ollama: food is positive in every review, except reviews whose text says 'broken'."""

    def __init__(self):
        self.calls = 0

    def __call__(self, messages, schema, ollama_settings):
        self.calls += 1
        assert schema["additionalProperties"] is False and set(schema["required"]) == set(ASPECTS)
        if "broken" in messages[-1]["content"]:
            return {"food_quality": "delicious"}  # fails validation
        return full_labels({"food_quality": "positive"}, CONFIG)


@pytest.fixture
def processed(tmp_path):
    out = tmp_path / "processed"
    out.mkdir()
    reviews = make_reviews(40)
    reviews.loc[reviews["review_id"] == "R-0002", "text"] = "broken reply"
    reviews.to_parquet(out / "reviews.parquet")
    return out


def test_drafts_only_training_reviews_caches_them_and_writes_label_studio_files(processed, tmp_path):
    config = {**CONFIG, "test_set": {"size": 10, "min_non_english": 0.3}}
    test_file = tmp_path / "splits" / "review_test_ids.csv"
    chat = FakeChat()
    summary = run(processed, test_file, chat=chat, config=config, log=lambda *_: None)
    test_ids = set(pd.read_csv(test_file)["review_id"])
    assert summary["test"] == 10 and summary["test_non_english"] >= 3
    failed = summary["failed"]
    assert failed == ([] if "R-0002" in test_ids else ["R-0002"])
    assert summary["drafted"] == 30 - len(failed) and chat.calls == 30

    tasks = json.loads((processed / "label_studio_tasks.json").read_text(encoding="utf-8"))
    assert len(tasks) == 40
    for task in tasks:
        if task["data"]["set"] == "test":
            assert "predictions" not in task  # the hand-labelled test set is never pre-filled
    drafted = next(t for t in tasks if "predictions" in t)
    assert drafted["predictions"][0]["result"] == [
        {"from_name": "food_quality", "to_name": "text", "type": "choices", "value": {"choices": ["positive"]}}
    ]
    assert (processed / "label_studio_config.xml").exists()

    # A rerun keeps the same test set and only retries what failed.
    again = FakeChat()
    run(processed, test_file, chat=again, config=config, log=lambda *_: None)
    assert again.calls == len(failed)
    assert set(pd.read_csv(test_file)["review_id"]) == test_ids


def test_no_llm_still_writes_the_files(processed, tmp_path):
    def unreachable(*_):
        raise OllamaError("no server")

    summary = run(processed, tmp_path / "t.csv", use_llm=False, chat=unreachable, log=lambda *_: None)
    assert summary["drafted"] == 0 and (processed / "label_studio_tasks.json").exists()


def test_reading_a_label_studio_export():
    export = [
        {
            "data": {"review_id": "R-0001", "set": "test"},
            "annotations": [
                {
                    "was_cancelled": False,
                    "updated_at": "2026-10-28T10:00:00",
                    "result": [{"from_name": "food_quality", "type": "choices", "value": {"choices": ["negative"]}}],
                },
                {
                    "was_cancelled": False,
                    "updated_at": "2026-10-29T10:00:00",
                    "result": [{"from_name": "punctuality", "type": "choices", "value": {"choices": ["positive"]}}],
                },
            ],
        },
        {"data": {"review_id": "R-0002", "set": "train"}, "annotations": [{"was_cancelled": True, "result": []}]},
        {"data": {"review_id": "R-0003", "set": "train"}, "annotations": []},
    ]
    rows = read_label_studio_export(export, CONFIG)
    assert len(rows) == 1  # cancelled and unlabelled tasks are skipped
    assert rows[0] == {"review_id": "R-0001", "set": "test", **full_labels({"punctuality": "positive"}, CONFIG)}
