import random

import mlflow
import numpy as np

from shevent_ml.tracking import set_seed, training_run


def test_set_seed_is_repeatable():
    set_seed(7)
    first = (random.random(), np.random.rand())
    set_seed(7)
    assert (random.random(), np.random.rand()) == first


def test_training_run_logs_seed_and_dataset_version(tmp_path, monkeypatch):
    # A local file store, so the test doesn't need the MLflow server running.
    monkeypatch.setenv("MLFLOW_TRACKING_URI", tmp_path.as_uri())
    with training_run("scaffold_test", "v1", {"alpha": 0.1}, seed=7) as run:
        mlflow.log_metric("mape", 0.2)

    logged = mlflow.get_run(run.info.run_id).data
    assert logged.tags["dataset_version"] == "v1"
    assert logged.params == {"seed": "7", "alpha": "0.1"}
    assert logged.metrics == {"mape": 0.2}
