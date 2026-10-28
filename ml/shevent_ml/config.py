"""Shared paths and settings. Paths resolve from the repo root, so code works from any working directory."""

import csv
import os
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
# Portfolio images, one folder per vendor: data/images/<vendor_id>/<vendor_id>_NN.jpg (git-ignored).
IMAGES_DIR = DATA_DIR / "images"
SPLITS_DIR = DATA_DIR / "splits"
REFERENCE_DIR = DATA_DIR / "reference"
TEMPLATE_DIR = DATA_DIR / "templates"
CONFIG_DIR = REPO_ROOT / "ml" / "configs"

# One seed for every split, sample and model, so any run can be reproduced.
SEED = 42


def _reference_categories():
    with (REFERENCE_DIR / "categories.csv").open(encoding="utf-8", newline="") as f:
        return [row["category"] for row in csv.DictReader(f)]


# The service categories, in data/reference/categories.csv order (the order of CATEGORIES in packages/core). Every
# model reads them from here, so adding a category means adding a row to that file, not editing lists in code.
CATEGORIES = _reference_categories()

DEFAULT_MLFLOW_URI = "http://127.0.0.1:5000"


def mlflow_tracking_uri():
    return os.environ.get("MLFLOW_TRACKING_URI", DEFAULT_MLFLOW_URI)


def load_config(name):
    """Load ml/configs/<name>.yaml. Thresholds and weights live there so they can be tuned without code changes."""
    path = CONFIG_DIR / f"{name}.yaml"
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}
