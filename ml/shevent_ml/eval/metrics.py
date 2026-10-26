"""The offline metrics in README section 10, written out so every model and baseline is scored the same way."""

import numpy as np
import pandas as pd


def _arrays(*values):
    return [np.asarray(v, dtype=float) for v in values]


def mape(actual, predicted):
    """Mean absolute percentage error, as a fraction (0.25 = 25%). Rows with a zero or missing actual are skipped."""
    actual, predicted = _arrays(actual, predicted)
    keep = np.isfinite(actual) & np.isfinite(predicted) & (actual != 0)
    return float(np.mean(np.abs(actual[keep] - predicted[keep]) / np.abs(actual[keep])))


def pinball_loss(actual, predicted, alpha):
    """Quantile loss at alpha: how well `predicted` works as the alpha quantile (lower is better)."""
    actual, predicted = _arrays(actual, predicted)
    diff = actual - predicted
    return float(np.mean(np.maximum(alpha * diff, (alpha - 1) * diff)))


def interval_coverage(actual, low, high):
    """Share of actual values inside [low, high]. An 80% range should cover about 0.8."""
    actual, low, high = _arrays(actual, low, high)
    return float(np.mean((actual >= low) & (actual <= high)))


def _shares(df, columns):
    values = df[columns].to_numpy(dtype=float)
    return values / values.sum(axis=1, keepdims=True)


def share_mae(true, predicted):
    """Mean absolute error per category share (columns), averaged over events. Both frames sum to 1 per row."""
    columns = list(true.columns)
    return pd.Series(np.abs(_shares(true, columns) - _shares(predicted, columns)).mean(axis=0), index=columns)


def kl_divergence(true, predicted, eps=1e-6):
    """Mean KL(true || predicted) over events. eps keeps a zero predicted share from making it infinite."""
    columns = list(true.columns)
    t = _shares(true, columns)
    p = np.clip(_shares(predicted, columns), eps, None)
    p = p / p.sum(axis=1, keepdims=True)
    with np.errstate(divide="ignore", invalid="ignore"):
        terms = np.where(t > 0, t * np.log(t / p), 0.0)
    return float(terms.sum(axis=1).mean())


def ndcg_at_k(ranked_relevance, k, all_relevance=None):
    """NDCG@k for one ranked list of graded relevance labels (0-3).

    all_relevance holds the labels of every candidate for the query, for the ideal ranking; by default it is the
    ranked list itself. A query with no relevant candidate scores 0.
    """
    ranked = np.asarray(ranked_relevance, dtype=float)[:k]
    ideal = np.sort(np.asarray(ranked_relevance if all_relevance is None else all_relevance, dtype=float))[::-1][:k]
    discounts = 1 / np.log2(np.arange(2, k + 2))
    ideal_dcg = float(((2**ideal - 1) * discounts[: len(ideal)]).sum())
    if ideal_dcg == 0:
        return 0.0
    return float(((2**ranked - 1) * discounts[: len(ranked)]).sum()) / ideal_dcg


def precision_at_k(ranked_relevance, k, threshold=2):
    """Share of the top k with relevance >= threshold (2 = 'good match' on the 0-3 scale)."""
    top = np.asarray(ranked_relevance, dtype=float)[:k]
    return float((top >= threshold).sum() / k)
