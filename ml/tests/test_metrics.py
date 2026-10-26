import math

import pandas as pd
import pytest

from shevent_ml.eval.metrics import (
    interval_coverage,
    kl_divergence,
    mape,
    ndcg_at_k,
    pinball_loss,
    precision_at_k,
    share_mae,
)


def test_mape_skips_zero_actuals():
    assert mape([100, 200, 0], [110, 150, 5]) == pytest.approx((0.1 + 0.25) / 2)


def test_pinball_loss_penalises_the_side_the_quantile_should_avoid():
    # The 0.9 quantile should rarely be below the actual: under-predicting costs 9x more than over-predicting.
    assert pinball_loss([100], [90], 0.9) == pytest.approx(9)
    assert pinball_loss([100], [110], 0.9) == pytest.approx(1)
    assert pinball_loss([100, 100], [90, 110], 0.5) == pytest.approx(5)


def test_interval_coverage_includes_the_edges():
    assert interval_coverage([10, 20, 30, 40], [10, 0, 0, 0], [15, 20, 25, 50]) == 0.75


def test_share_metrics():
    true = pd.DataFrame({"venue": [0.5, 0.2], "catering": [0.5, 0.8]})
    assert kl_divergence(true, true) == pytest.approx(0)
    predicted = pd.DataFrame({"venue": [0.4, 0.2], "catering": [0.6, 0.8]})
    assert share_mae(true, predicted).to_dict() == pytest.approx({"venue": 0.05, "catering": 0.05})
    expected = (0.5 * math.log(0.5 / 0.4) + 0.5 * math.log(0.5 / 0.6)) / 2
    assert kl_divergence(true, predicted) == pytest.approx(expected)
    # A zero predicted share is clipped, not infinite.
    assert math.isfinite(kl_divergence(true, pd.DataFrame({"venue": [0.0, 0.0], "catering": [1.0, 1.0]})))


def test_ndcg_and_precision():
    assert ndcg_at_k([3, 2, 0], k=3) == pytest.approx(1)
    assert ndcg_at_k([0, 2, 3], k=3) < ndcg_at_k([3, 0, 2], k=3) < 1
    assert ndcg_at_k([0, 0], k=2) == 0
    # The ideal ranking can include a relevant vendor the ranker never returned.
    assert ndcg_at_k([2], k=2, all_relevance=[3, 2]) < 1
    assert precision_at_k([3, 1, 2, 0, 2], k=5) == pytest.approx(0.6)
