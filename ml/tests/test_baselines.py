import json

import pandas as pd
import pytest

from shevent_ml.data.split import choose_test_vendors, is_test, make_split
from shevent_ml.eval.baselines import FixedPlannerSplit, MedianPriceLookup, rank_by_rating, run


def prices_frame(rows):
    return pd.DataFrame(rows, columns=["vendor_id", "category", "price_basis", "area", "mid_pkr_adj"])


def test_median_lookup_backs_off_to_the_category_for_thin_cells():
    train = prices_frame(
        [
            ("C1", "catering", "per_head", "DHA", 2000),
            ("C2", "catering", "per_head", "DHA", 2400),
            ("C3", "catering", "per_head", "DHA", 2200),
            ("C4", "catering", "per_head", "Gulberg", 1000),
        ]
    )
    lookup = MedianPriceLookup(min_prices=3, interval=(0.1, 0.9)).fit(train)
    rows = prices_frame(
        [
            ("X", "catering", "per_head", "DHA", 0),
            ("X", "catering", "per_head", "Gulberg", 0),
            ("X", "decor", "flat", "DHA", 0),
        ]
    )
    out = lookup.predict(rows)
    assert out.loc[0, "mid"] == 2200
    assert out.loc[1, "mid"] == 2100  # only one Gulberg price: median of all four
    assert out.loc[0, "low"] < out.loc[0, "mid"] < out.loc[0, "high"]
    assert out.loc[2].isna().all()  # a category never seen in training


def test_fixed_planner_split_sums_to_one_per_event():
    planner = FixedPlannerSplit(
        default={
            "venue": 0.27,
            "catering": 0.38,
            "decor": 0.14,
            "dj_sound": 0.07,
            "lighting": 0.06,
            "photography": 0.08,
        },
        by_event_type={"birthday": {"venue": 2, "catering": 2}},  # unnormalised, missing categories
    )
    out = planner.predict(pd.DataFrame({"event_type": ["wedding_walima", "birthday"]}))
    assert out.sum(axis=1).tolist() == pytest.approx([1, 1])
    assert out.loc[1].to_dict() == {
        "venue": 0.5,
        "catering": 0.5,
        "decor": 0,
        "dj_sound": 0,
        "lighting": 0,
        "photography": 0,
    }


def test_rank_by_rating_puts_unrated_last():
    candidates = pd.DataFrame(
        {"vendor_id": ["a", "b", "c", "d"], "rating": [4.5, None, 4.8, 4.5], "review_count": [10, 99, 3, 40]}
    )
    assert rank_by_rating(candidates)["vendor_id"].tolist() == ["c", "d", "a", "b"]


def test_test_vendors_are_drawn_per_category():
    prices = pd.DataFrame(
        {
            "vendor_id": [f"CAT-{i:03}" for i in range(10)] + ["DEC-001", "DEC-002", "LGT-001"],
            "category": ["catering"] * 10 + ["decor", "decor", "lighting"],
        }
    )
    chosen = choose_test_vendors(prices, test_fraction=0.2, seed=1)
    assert sum(v.startswith("CAT") for v in chosen) == 2
    assert sum(v.startswith("DEC") for v in chosen) == 1  # at least one per category with two vendors
    assert "LGT-001" not in chosen  # a lone vendor stays in training
    assert chosen == choose_test_vendors(prices, test_fraction=0.2, seed=1)


@pytest.fixture
def processed(tmp_path):
    rows = []
    for i in range(10):
        rows.append((f"CAT-{i:03}", "catering", "per_head", "DHA", 2000 + 100 * i))
        rows.append((f"CAT-{i:03}", "catering", "per_head", "DHA", 2050 + 100 * i))
    prices_frame(rows).to_parquet(tmp_path / "prices.parquet")
    pd.DataFrame(
        {
            "vendor_id": ["CAT-000"],
            "category": ["catering"],
            "price_basis": ["per_head"],
            "area": ["DHA"],
            "price_pkr_adj": [2300],
        }
    ).to_parquet(tmp_path / "quotes.parquet")
    (tmp_path / "manifest.json").write_text(json.dumps({"dataset_hash": "abc123"}))
    return tmp_path


def test_split_is_frozen_and_baselines_score_on_test_vendors_only(processed):
    path = processed / "splits" / "test_split.json"
    split = make_split(processed, path)
    assert split["dataset_hash"] == "abc123"
    assert split["prices"] == {"train": 16, "test": 4}
    with pytest.raises(FileExistsError):
        make_split(processed, path)

    prices = pd.read_parquet(processed / "prices.parquet")
    assert set(prices[is_test(prices, split)]["vendor_id"]) == set(split["test_vendors"])

    report = run(
        processed,
        split,
        {"median_lookup": {"min_prices": 3, "interval": [0.1, 0.9]}, "planner_split": {"default": {"venue": 1.0}}},
    )
    scores = report["price_estimator"]["test_prices"]
    assert scores["scored"] == 4
    assert 0 <= scores["coverage"] <= 1 and scores["mape"] >= 0
    assert report["price_estimator"]["scenario_quotes"]["scored"] == 1
    assert report["budget_allocator"]["source"] == "placeholder"
