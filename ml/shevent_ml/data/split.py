"""Freeze the held-out real test set.

    python -m shevent_ml.data.split            # writes data/splits/test_split.json once
    python -m shevent_ml.data.split --force    # replaces it (only before any model has been evaluated on it)

The test set is a set of vendors, drawn per category so every category is represented. All of a test vendor's
prices are test, including prices added in later exports, so no model learns a test vendor's prices from its
other rows. Scenario quotes are always test (their vendor's rate-card prices may still be in training; report that
next to the quote scores). Commit the file: the test set must never change silently.
"""

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd

from shevent_ml.config import PROCESSED_DIR, SEED, SPLITS_DIR

SPLIT_FILE = SPLITS_DIR / "test_split.json"
TEST_FRACTION = 0.2


def choose_test_vendors(prices, test_fraction=TEST_FRACTION, seed=SEED):
    """About test_fraction of the vendors with prices in each category; at least one when a category has two."""
    rng = np.random.default_rng(seed)
    chosen = []
    vendors = prices[["vendor_id", "category"]].drop_duplicates("vendor_id")
    for _, group in vendors.groupby("category"):
        ids = sorted(group["vendor_id"])
        if len(ids) < 2:
            continue
        n = max(1, round(len(ids) * test_fraction))
        chosen += sorted(rng.choice(ids, size=n, replace=False).tolist())
    return chosen


def load_split(path=SPLIT_FILE):
    if not path.exists():
        raise FileNotFoundError(f"{path} not found; run python -m shevent_ml.data.split after freezing the dataset")
    return json.loads(path.read_text(encoding="utf-8"))


def is_test(df, split):
    """True for rows of test vendors. Works on prices, quotes or vendors (anything with vendor_id)."""
    return df["vendor_id"].isin(split["test_vendors"])


def make_split(processed_dir=PROCESSED_DIR, path=SPLIT_FILE, force=False, test_fraction=TEST_FRACTION, seed=SEED):
    if path.exists() and not force:
        raise FileExistsError(
            f"{path} already exists. The test set is frozen; pass --force only if no model "
            "has been evaluated on it yet."
        )
    prices = pd.read_parquet(processed_dir / "prices.parquet")
    manifest = json.loads((processed_dir / "manifest.json").read_text(encoding="utf-8"))
    test_vendors = choose_test_vendors(prices, test_fraction, seed)
    test = prices["vendor_id"].isin(test_vendors)
    split = {
        "dataset_hash": manifest["dataset_hash"],
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "seed": seed,
        "test_fraction": test_fraction,
        "test_vendors": test_vendors,
        "prices": {"train": int((~test).sum()), "test": int(test.sum())},
        "test_prices_by_category": prices[test].groupby("category").size().to_dict(),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(split, indent=2) + "\n", encoding="utf-8")
    return split


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset to split")
    parser.add_argument("--force", action="store_true", help="replace an existing split")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    try:
        split = make_split(args.processed, force=args.force)
    except FileExistsError as error:
        print(error)
        return 1
    print(f"Test split for dataset {split['dataset_hash']} written to {SPLIT_FILE}")
    print(
        f"  {len(split['test_vendors'])} test vendors; prices: {split['prices']['train']} train, "
        f"{split['prices']['test']} test"
    )
    for category, rows in split["test_prices_by_category"].items():
        print(f"  {category:<10} {rows:>4} test prices")
    return 0


if __name__ == "__main__":
    sys.exit(main())
