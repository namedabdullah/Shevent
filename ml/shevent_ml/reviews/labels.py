"""Aspect labels for reviews: the schema, the prompt the LLM drafts with, and Label Studio's import and export formats.

Every review gets one label per aspect (configs/reviews.yaml). In Label Studio an aspect left blank means
not_mentioned, so the labeller only clicks the aspects a review talks about.
"""

import hashlib
import json
from typing import Literal

from pydantic import ConfigDict, create_model

from shevent_ml.config import load_config

NOT_MENTIONED = "not_mentioned"

# Worked examples for the prompt: English, Roman Urdu, Urdu script and mixed, as hosts actually write.
EXAMPLES = [
    (
        "Khana bohat acha tha but staff thora late aya",
        {"food_quality": "positive", "punctuality": "negative"},
    ),
    (
        "Great sound system and the DJ kept everyone dancing. A bit pricey though, and they added generator charges "
        "at the end.",
        {"sound_quality": "positive", "value_for_money": "negative", "hidden_charges": "negative"},
    ),
    ("کھانا ٹھنڈا تھا اور عملہ بدتمیزی سے پیش آیا", {"food_quality": "negative", "staff_behaviour": "negative"}),
    (
        "Sab kuch time pe tha, rate bhi munasib tha aur koi extra charge nahi liya. Biryani was good but the "
        "karahi was too salty.",
        {
            "punctuality": "positive",
            "value_for_money": "positive",
            "hidden_charges": "positive",
            "food_quality": "mixed",
        },
    ),
    (
        "Photographer ne pictures bohat achi lein, lekin album teen mahine baad mila aur extra copies ke paise alag "
        "liye.",
        {"photo_video_quality": "mixed", "hidden_charges": "negative"},
    ),
]


def settings():
    return load_config("reviews")


def label_model(config=None):
    """A pydantic model with one field per aspect, each limited to the configured labels."""
    config = config or settings()
    choice = Literal[tuple(config["labels"])]
    fields = {aspect: (choice, ...) for aspect in config["aspects"]}
    return create_model("ReviewLabels", __config__=ConfigDict(extra="forbid"), **fields)


def full_labels(partial, config=None):
    """Fills every aspect the partial dict leaves out with not_mentioned."""
    config = config or settings()
    return {aspect: partial.get(aspect, NOT_MENTIONED) for aspect in config["aspects"]}


def prompt_messages(text, config=None):
    """System instructions, the worked examples as earlier turns, then the review to label."""
    config = config or settings()
    aspects = "\n".join(f"- {name}: {meaning}" for name, meaning in config["aspects"].items())
    system = (
        "You label customer reviews of event vendors in Lahore, Pakistan (caterers, venues, decorators, DJs, "
        "lighting). Reviews may be in English, Urdu script, Roman Urdu or a mix.\n"
        f"For each aspect below answer one of: {', '.join(config['labels'])}.\n"
        "positive or negative only when the review clearly says so; mixed when it says both; not_mentioned when "
        "the review doesn't talk about that aspect. Don't guess from the star rating or the overall tone.\n\n"
        f"Aspects:\n{aspects}"
    )
    messages = [{"role": "system", "content": system}]
    for example, labels in EXAMPLES:
        messages.append({"role": "user", "content": example})
        messages.append({"role": "assistant", "content": json.dumps(full_labels(labels, config))})
    messages.append({"role": "user", "content": text})
    return messages


def prompt_version(config=None):
    """Changes when the prompt, the examples or the aspects change, so old drafts aren't reused by mistake."""
    return hashlib.sha256(json.dumps(prompt_messages("", config), ensure_ascii=False).encode()).hexdigest()[:10]


def label_studio_config(config=None):
    """The labelling interface: the review text and one optional single-choice question per aspect."""
    config = config or settings()
    choices = "".join(f'<Choice value="{label}"/>' for label in config["labels"] if label != NOT_MENTIONED)
    questions = "\n".join(
        f'  <Header value="{name}: {meaning}" size="6"/>\n'
        f'  <Choices name="{name}" toName="text" choice="single-radio" showInline="true">{choices}</Choices>'
        for name, meaning in config["aspects"].items()
    )
    return (
        "<View>\n"
        '  <Header value="Leave an aspect blank if the review doesn\'t mention it."/>\n'
        '  <Text name="text" value="$text"/>\n'
        f"{questions}\n"
        "</View>\n"
    )


def label_studio_task(review, labels=None, model_version=None):
    """One Label Studio task. Drafted labels become a prediction the labeller corrects; test reviews get none."""
    task = {"data": {key: review[key] for key in ("review_id", "vendor_id", "text", "language", "set")}}
    if labels is not None:
        result = [
            {"from_name": aspect, "to_name": "text", "type": "choices", "value": {"choices": [label]}}
            for aspect, label in labels.items()
            if label != NOT_MENTIONED
        ]
        task["predictions"] = [{"model_version": model_version, "result": result}]
    return task


def read_label_studio_export(tasks, config=None):
    """Rows of review_id + one column per aspect from a Label Studio JSON export (the latest kept annotation)."""
    config = config or settings()
    rows = []
    for task in tasks:
        annotations = [a for a in task.get("annotations", []) if not a.get("was_cancelled")]
        if not annotations:
            continue
        latest = max(annotations, key=lambda a: a.get("updated_at") or a.get("created_at") or "")
        chosen = {
            r["from_name"]: r["value"]["choices"][0] for r in latest.get("result", []) if r.get("type") == "choices"
        }
        rows.append(
            {"review_id": task["data"]["review_id"], "set": task["data"].get("set"), **full_labels(chosen, config)}
        )
    return rows
