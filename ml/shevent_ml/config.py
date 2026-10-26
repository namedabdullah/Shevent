"""Shared paths and settings. Paths resolve from the repo root, so code works from any working directory."""

import os
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
SPLITS_DIR = DATA_DIR / "splits"
REFERENCE_DIR = DATA_DIR / "reference"
TEMPLATE_DIR = DATA_DIR / "templates"
CONFIG_DIR = REPO_ROOT / "ml" / "configs"

# One seed for every split, sample and model, so any run can be reproduced.
SEED = 42

DEFAULT_MLFLOW_URI = "http://127.0.0.1:5000"


def mlflow_tracking_uri():
    return os.environ.get("MLFLOW_TRACKING_URI", DEFAULT_MLFLOW_URI)


def load_config(name):
    """Load ml/configs/<name>.yaml. Thresholds and weights live there so they can be tuned without code changes."""
    path = CONFIG_DIR / f"{name}.yaml"
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}
