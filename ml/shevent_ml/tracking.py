"""MLflow helpers, so every training run is logged the same way: seed, dataset version, params and metrics."""

import random
from contextlib import contextmanager

import mlflow
import numpy as np

from shevent_ml.config import SEED, mlflow_tracking_uri


def set_seed(seed=SEED):
    random.seed(seed)
    np.random.seed(seed)
    try:
        import torch
    except ImportError:
        return
    torch.manual_seed(seed)


@contextmanager
def training_run(experiment, dataset_version, params=None, seed=SEED):
    """Seed everything and open an MLflow run tagged with the dataset version.

    with training_run("price_estimator", "v1", {"alpha": 0.1}):
        ...
        mlflow.log_metric("mape", mape)
    """
    set_seed(seed)
    mlflow.set_tracking_uri(mlflow_tracking_uri())
    mlflow.set_experiment(experiment)
    with mlflow.start_run() as run:
        mlflow.set_tag("dataset_version", dataset_version)
        mlflow.log_params({"seed": seed, **(params or {})})
        yield run
