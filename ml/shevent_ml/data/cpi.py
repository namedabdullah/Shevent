"""Inflation adjustment, so a price quoted a year ago can be compared with one quoted this month."""

import pandas as pd


def cpi_factors(dates, reference_month, monthly_index=None, fallback_annual_rate=0.0):
    """Multiplier that turns a price from its own month into reference_month rupees.

    Uses the PBS CPI index when it has both months; otherwise compounds fallback_annual_rate month by month.
    """
    reference = pd.Period(reference_month, freq="M")
    months_back = (reference.year - dates.dt.year) * 12 + (reference.month - dates.dt.month)
    factor = (1 + fallback_annual_rate) ** (months_back / 12)

    index = {str(month): float(value) for month, value in (monthly_index or {}).items()}
    if str(reference_month) in index:
        start = dates.dt.strftime("%Y-%m").map(index)
        factor = (index[str(reference_month)] / start).where(start.notna(), factor)
    return factor.astype(float)
