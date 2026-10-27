import json

import pandas as pd
import pytest

from shevent_ml.config import load_config
from shevent_ml.eval.baselines import rank_by_rating, run
from shevent_ml.eval.matching_set import (
    choose_candidates,
    labelling_sheet,
    load_labels,
    make_matching_set,
    score_ranker,
)

SETTINGS = load_config("matching_set")


def make_vendors():
    rows = []
    for i in range(30):
        rows.append(
            {
                "vendor_id": f"DEC-{i:03}",
                "name": f"Decor {i}",
                "category": "decor",
                "sub_type": "stage",
                "base_area": "Gulberg" if i < 8 else "DHA",
                "areas_served": "Gulberg|Model Town" if i < 8 else "DHA",
                "capacity_min": 50,
                "capacity_max": 800,
                "price_tier": "mid",
                "event_types": "wedding_mehndi",
                "rating": 3.5 + (i % 10) / 10,
                "review_count": i,
            }
        )
    rows.append({**rows[0], "vendor_id": "CAT-001", "category": "catering"})
    return pd.DataFrame(rows)


QUERY = {
    "query_id": "Q01",
    "category": "decor",
    "event_type": "wedding_mehndi",
    "guests": 300,
    "area": "Gulberg",
    "venue_type": "marquee",
    "event_date": "2026-12-19",
    "total_budget_pkr": 2500000,
}


def test_candidates_mix_vendors_in_and_out_of_the_area():
    vendors = make_vendors()
    candidates = choose_candidates(vendors, [QUERY], n=20, serving_share=0.6, seed=1)
    assert len(candidates) == 20 and candidates["vendor_id"].is_unique
    chosen = vendors.set_index("vendor_id").loc[candidates["vendor_id"]]
    assert (chosen["category"] == "decor").all()
    # Only 8 decor vendors serve Gulberg, fewer than 60% of 20: all 8 are in, and the rest come from elsewhere.
    assert (chosen["base_area"] == "Gulberg").sum() == 8
    assert candidates.equals(choose_candidates(vendors, [QUERY], n=20, serving_share=0.6, seed=1))


def test_small_categories_give_every_vendor():
    vendors = make_vendors()
    query = {**QUERY, "query_id": "Q02", "category": "catering"}
    assert choose_candidates(vendors, [query], n=20, serving_share=0.6)["vendor_id"].tolist() == ["CAT-001"]


def test_sheet_has_the_scale_the_event_and_an_empty_relevance_column():
    vendors = make_vendors()
    candidates = choose_candidates(vendors, [QUERY], 5, 0.6)
    sheet = labelling_sheet(candidates, vendors, [QUERY], SETTINGS["relevance_scale"])
    assert sheet["query_id"].head(4).eq("SCALE").all()
    rows = sheet[sheet["query_id"] == "Q01"]
    assert len(rows) == 5 and rows["relevance"].eq("").all()
    assert rows["event"].iloc[0].startswith("wedding_mehndi, 300 guests, Gulberg")
    assert "Rs 25 lakh" in rows["event"].iloc[0]


@pytest.fixture
def labelled(tmp_path):
    processed, splits = tmp_path / "processed", tmp_path / "splits"
    processed.mkdir()
    make_vendors().to_parquet(processed / "vendors.parquet")
    settings = {**SETTINGS, "queries": [QUERY], "candidates_per_query": 10}
    candidates = make_matching_set(processed, splits / "matching_candidates.csv", settings=settings)
    # A rater who only cares about the area: vendors serving Gulberg are a 3, the rest a 0.
    serving = set(make_vendors().query("base_area == 'Gulberg'")["vendor_id"])
    labels = candidates.assign(relevance=[3 if v in serving else 0 for v in candidates["vendor_id"]])
    labels.to_csv(splits / "matching_labels.csv", index=False)
    return processed, splits, settings


def test_matching_set_is_frozen(labelled):
    processed, splits, settings = labelled
    with pytest.raises(FileExistsError):
        make_matching_set(processed, splits / "matching_candidates.csv", settings=settings)
    assert (processed / "matching_to_label.csv").exists()


def test_labels_are_checked(labelled):
    _, splits, _ = labelled
    labels = pd.read_csv(splits / "matching_labels.csv")
    labels.loc[0, "relevance"] = 5
    labels.to_csv(splits / "bad.csv", index=False)
    with pytest.raises(ValueError, match="0, 1, 2 or 3"):
        load_labels(splits / "bad.csv", splits / "matching_candidates.csv")
    labels.iloc[1:].assign(relevance=1).to_csv(splits / "short.csv", index=False)
    with pytest.raises(ValueError, match="every candidate"):
        load_labels(splits / "short.csv", splits / "matching_candidates.csv")


def test_a_ranker_that_knows_the_area_beats_sort_by_rating(labelled):
    processed, splits, settings = labelled
    labels = load_labels(splits / "matching_labels.csv", splits / "matching_candidates.csv")
    vendors = pd.read_parquet(processed / "vendors.parquet")

    def by_area(query, candidates):
        serving = candidates["areas_served"].str.contains(query["area"])
        return candidates.assign(_s=serving).sort_values("_s", ascending=False)

    perfect = score_ranker(by_area, labels, vendors, settings["queries"])
    baseline = score_ranker(lambda q, c: rank_by_rating(c), labels, vendors, settings["queries"])
    assert perfect["ndcg@10"] == pytest.approx(1) and perfect["precision@5"] == 1
    assert baseline["ndcg@10"] < perfect["ndcg@10"]
    # A ranker that returns nobody still gets scored, with everyone ranked last in their labelled order.
    assert score_ranker(lambda q, c: c.iloc[:0], labels, vendors, settings["queries"])["queries"] == 1


def test_baseline_report_scores_matching_once_labelled(labelled, tmp_path):
    processed, splits, _ = labelled
    pd.DataFrame(
        {
            "vendor_id": ["DEC-000"],
            "category": ["decor"],
            "price_basis": ["flat"],
            "area": ["Gulberg"],
            "mid_pkr_adj": [100000.0],
        }
    ).to_parquet(processed / "prices.parquet")
    (processed / "manifest.json").write_text(json.dumps({"dataset_hash": "abc"}))
    split = {"dataset_hash": "abc", "test_vendors": ["DEC-000"]}
    settings = {"median_lookup": {"min_prices": 1, "interval": [0.1, 0.9]}, "planner_split": {"default": {"venue": 1}}}
    report = run(processed, split, settings, labels_file=splits / "matching_labels.csv")
    assert 0 <= report["vendor_matching"]["ndcg@10"] <= 1
