"""The #3 matching test set: test events x candidate vendors rated 0-3 by hand, and a ranker's score on it.

    python -m shevent_ml.eval.matching_set            # needs data/processed/vendors.parquet
    python -m shevent_ml.eval.matching_set --force    # pick new candidates (only before labelling starts)

Writes data/splits/matching_candidates.csv (which vendors each query is rated against; commit it) and
data/processed/matching_to_label.csv, a sheet with the event and each vendor's details. The data lead fills in the
relevance column and saves the query_id, vendor_id and relevance columns as data/splits/matching_labels.csv (commit
it too). Every ranker then re-ranks the same labelled candidates, scored with NDCG@10 and Precision@5.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from shevent_ml.config import PROCESSED_DIR, SEED, SPLITS_DIR, load_config
from shevent_ml.eval.metrics import ndcg_at_k, precision_at_k

CANDIDATES_FILE = SPLITS_DIR / "matching_candidates.csv"
LABELS_FILE = SPLITS_DIR / "matching_labels.csv"
VENDOR_COLUMNS = [
    "name",
    "sub_type",
    "base_area",
    "areas_served",
    "capacity_min",
    "capacity_max",
    "price_tier",
    "event_types",
    "rating",
    "review_count",
]


def serves(vendors, area):
    return vendors["areas_served"].fillna("").str.split("|").map(lambda areas: area in areas)


def choose_candidates(vendors, queries, n, serving_share, seed=SEED):
    """n vendors of the query's category per query: up to serving_share of them serve the area, the rest don't.

    If either group is short the other fills in. Candidates are shuffled, so the sheet's order hints at nothing.
    """
    rng = np.random.default_rng(seed)
    rows = []
    for query in queries:
        pool = vendors[vendors["category"] == query["category"]]
        in_area = serves(pool, query["area"])
        serving, others = pool.loc[in_area, "vendor_id"].tolist(), pool.loc[~in_area, "vendor_id"].tolist()
        k = min(len(serving), round(n * serving_share))
        k = max(k, n - len(others))  # too few others: take more serving vendors
        chosen = list(rng.permutation(sorted(serving))[: min(k, len(serving))])
        chosen += list(rng.permutation(sorted(others))[: n - len(chosen)])
        rows += [(query["query_id"], vendor_id) for vendor_id in rng.permutation(chosen)]
    return pd.DataFrame(rows, columns=["query_id", "vendor_id"])


def describe(query):
    budget = f"Rs {query['total_budget_pkr'] / 100_000:g} lakh"
    return (
        f"{query['event_type']}, {query['guests']} guests, {query['area']}, {query['venue_type']}, "
        f"{query['event_date']}, total budget {budget}: rate {query['category']} vendors"
    )


def labelling_sheet(candidates, vendors, queries, scale):
    by_id = {q["query_id"]: q for q in queries}
    sheet = candidates.assign(event=candidates["query_id"].map(lambda q: describe(by_id[q])))
    sheet = sheet.merge(vendors[["vendor_id", *VENDOR_COLUMNS]], on="vendor_id", how="left")
    sheet["relevance"] = ""
    legend = pd.DataFrame({"query_id": "SCALE", "event": [f"{score} = {text}" for score, text in scale.items()]})
    return pd.concat([legend, sheet], ignore_index=True)


def make_matching_set(processed_dir=PROCESSED_DIR, candidates_file=CANDIDATES_FILE, force=False, settings=None):
    settings = settings or load_config("matching_set")
    if candidates_file.exists() and not force:
        raise FileExistsError(f"{candidates_file} already exists; pass --force only before labelling starts.")
    vendors = pd.read_parquet(processed_dir / "vendors.parquet")
    candidates = choose_candidates(
        vendors, settings["queries"], settings["candidates_per_query"], settings["serving_share"]
    )
    candidates_file.parent.mkdir(parents=True, exist_ok=True)
    candidates.to_csv(candidates_file, index=False)
    sheet = labelling_sheet(candidates, vendors, settings["queries"], settings["relevance_scale"])
    sheet.to_csv(processed_dir / "matching_to_label.csv", index=False, encoding="utf-8-sig")  # opens cleanly in Excel
    return candidates


def load_labels(path=LABELS_FILE, candidates_file=CANDIDATES_FILE):
    """The hand ratings, checked: whole numbers 0-3, and exactly one for every candidate."""
    labels = pd.read_csv(path, dtype={"query_id": str, "vendor_id": str})
    labels = labels[labels["query_id"] != "SCALE"]
    relevance = pd.to_numeric(labels["relevance"], errors="coerce")
    bad = labels[~relevance.isin([0, 1, 2, 3])]
    if len(bad):
        raise ValueError(f"relevance must be 0, 1, 2 or 3; check {bad[['query_id', 'vendor_id']].values.tolist()}")
    labels = labels.assign(relevance=relevance.astype(int))[["query_id", "vendor_id", "relevance"]]
    candidates = pd.read_csv(candidates_file, dtype=str)
    missing = candidates.merge(labels, how="left", on=["query_id", "vendor_id"])["relevance"].isna()
    if missing.any() or labels.duplicated(["query_id", "vendor_id"]).any():
        raise ValueError(f"{path} must rate every candidate in {candidates_file} exactly once")
    return labels


def score_ranker(rank, labels, vendors, queries, k=10, top=5):
    """Mean NDCG@k and Precision@top over the queries.

    rank(query, candidates) gets the query dict and the labelled candidates' vendor rows, and returns them in its
    order (a DataFrame with vendor_id). Vendors it leaves out count as ranked last.
    """
    ndcg, precision = [], []
    for query in queries:
        rated = labels[labels["query_id"] == query["query_id"]].set_index("vendor_id")["relevance"]
        if rated.empty:
            continue
        ranked = rank(query, vendors[vendors["vendor_id"].isin(rated.index)])["vendor_id"].tolist()
        ranked += [v for v in rated.index if v not in ranked]
        relevance = rated.loc[ranked].tolist()
        ndcg.append(ndcg_at_k(relevance, k, all_relevance=rated.tolist()))
        precision.append(precision_at_k(relevance, top))
    return {"queries": len(ndcg), f"ndcg@{k}": float(np.mean(ndcg)), f"precision@{top}": float(np.mean(precision))}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset")
    parser.add_argument("--force", action="store_true", help="pick new candidates (only before labelling)")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    try:
        candidates = make_matching_set(args.processed, force=args.force)
    except FileExistsError as error:
        print(error)
        return 1
    counts = candidates.groupby("query_id").size()
    print(f"{len(candidates)} candidates for {len(counts)} queries written to {CANDIDATES_FILE}")
    for query_id, n in counts.items():
        print(f"  {query_id}: {n} vendors")
    print(f"Sheet to rate: {args.processed / 'matching_to_label.csv'}; save the ratings as {LABELS_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
