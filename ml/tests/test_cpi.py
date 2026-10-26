import pandas as pd
import pytest

from shevent_ml.data.cpi import cpi_factors


def dates(*values):
    return pd.Series(pd.to_datetime(list(values)))


def test_same_month_is_unchanged():
    assert list(cpi_factors(dates("2026-10-15"), "2026-10", None, 0.1)) == [1.0]


def test_fallback_rate_compounds_by_month():
    factors = cpi_factors(dates("2025-10-01", "2026-04-20"), "2026-10", None, 0.1)
    assert list(factors) == pytest.approx([1.1, 1.1**0.5])


def test_index_is_used_when_it_has_both_months():
    index = {"2025-10": 100.0, "2026-10": 105.0}
    factors = cpi_factors(dates("2025-10-05", "2026-04-01"), "2026-10", index, 0.1)
    assert list(factors) == pytest.approx([1.05, 1.1**0.5])  # 2026-04 isn't in the index: fallback


def test_index_without_reference_month_falls_back():
    factors = cpi_factors(dates("2025-10-05"), "2026-10", {"2025-10": 100.0}, 0.0)
    assert list(factors) == [1.0]
