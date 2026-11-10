import copy
import re

import pytest

from shevent_ml.config import load_config
from shevent_ml.reviews.labels import NOT_MENTIONED, settings
from shevent_ml.reviews.synthetic import generate

PHRASES = load_config("review_phrases")
ASPECTS = list(settings()["aspects"])
URDU = re.compile(r"[؀-ۿ]")
LATIN_WORD = re.compile(r"[A-Za-z]{2,}")


@pytest.fixture(scope="module")
def reviews():
    return generate(600, seed=5, phrases=PHRASES)


@pytest.fixture(scope="module")
def clean():
    """Without the typos, lower case and missing full stops, so fragments can be found in the text."""
    phrases = copy.deepcopy(PHRASES)
    phrases["noise"] = dict.fromkeys(phrases["noise"], 0.0)
    return generate(400, seed=9, phrases=phrases)


def fragments(aspect, label):
    return [f.lower() for options in PHRASES["aspects"][aspect][label].values() for f in options]


def test_every_label_is_the_fragment_in_the_text(clean):
    for _, row in clean.iterrows():
        text = row["text"].lower()
        for aspect in ASPECTS:
            if row[aspect] == NOT_MENTIONED:
                assert not any(f in text for f in fragments(aspect, "positive") + fragments(aspect, "negative")), row
            else:
                assert any(f in text for f in fragments(aspect, row[aspect])), (aspect, row["text"])


def test_same_seed_same_reviews():
    a, b = generate(50, seed=3, phrases=PHRASES), generate(50, seed=3, phrases=PHRASES)
    assert a.equals(b) and not a.equals(generate(50, seed=4, phrases=PHRASES))


def test_reviews_are_distinct_and_never_linked_to_a_vendor(reviews):
    assert len(reviews) == 600 and not reviews["text"].str.lower().duplicated().any()
    assert "vendor_id" not in reviews and reviews["synthetic"].all()
    assert reviews["review_id"].str.startswith("SYN-R-").all()


def test_aspects_fit_the_category(reviews):
    assert (reviews.loc[reviews["category"] != "photography", "photo_video_quality"] == NOT_MENTIONED).all()
    assert (reviews.loc[~reviews["category"].isin(["catering", "venue"]), "food_quality"] == NOT_MENTIONED).all()
    mentioned = (reviews[ASPECTS] != NOT_MENTIONED).sum(axis=1)
    assert mentioned.between(0, 3).all() and 0.15 < (mentioned == 0).mean() < 0.35  # some talk about no aspect


def test_stars_fit_the_labels(reviews):
    """Praise only gets 3 stars or more, complaints only 3 or fewer (a general remark can soften either by one)."""
    labels = reviews[ASPECTS]
    praise = labels.isin(["positive", NOT_MENTIONED]).all(axis=1) & (labels == "positive").any(axis=1)
    complaints = labels.isin(["negative", NOT_MENTIONED]).all(axis=1) & (labels == "negative").any(axis=1)
    assert reviews.loc[praise, "rating"].ge(3).all() and reviews.loc[praise, "rating"].eq(5).mean() > 0.5
    assert reviews.loc[complaints, "rating"].le(3).all() and reviews.loc[complaints, "rating"].eq(1).mean() > 0.5


def test_languages_are_what_they_say(reviews):
    urdu = reviews[reviews["language"] == "ur"]["text"]
    assert urdu.map(lambda t: bool(URDU.search(t)) and not LATIN_WORD.search(t)).all()
    latin = reviews[reviews["language"].isin(["en", "roman_ur", "mixed"])]["text"]
    assert not latin.map(lambda t: bool(URDU.search(t))).any()
    shares = reviews["language"].value_counts(normalize=True)
    assert shares[["roman_ur", "ur", "mixed"]].sum() > 0.4  # far more non-English than the real 3%
