from datetime import date

import pandas as pd
import pytest

from shevent_ml.config import load_config
from shevent_ml.features.calendar import calendar_features, date_features, islamic_month_start

SETTINGS = load_config("calendar")


def features(day):
    return date_features(date.fromisoformat(day), SETTINGS)


def test_peak_season_saturday_in_december():
    f = features("2026-12-19")
    assert (f["month"], f["day_of_week"], f["is_weekend"]) == (12, 5, True)
    assert (f["hijri_year"], f["hijri_month"]) == (1448, 7)  # Rajab
    assert f["is_peak_season"] and f["is_smog_season"]
    assert f["season"] == "peak_wedding_season"


def test_ramadan_comes_from_the_hijri_calendar_and_moves_each_year():
    assert islamic_month_start(1447, 9) == date(2026, 2, 18)
    assert islamic_month_start(1448, 9) == date(2027, 2, 8)
    assert features("2026-03-01")["is_ramadan"]
    # Ramadan wins over the wedding season it falls in.
    assert features("2027-02-10")["season"] == "ramadan"
    assert not features("2027-02-07")["is_ramadan"]


def test_post_eid_rush_starts_on_eid_ul_fitr():
    eid = islamic_month_start(1447, 10)
    assert eid == date(2026, 3, 20)
    assert features("2026-03-20")["season"] == "post_eid"
    assert features("2026-04-18")["is_post_eid"]  # day 30
    assert not features("2026-04-19")["is_post_eid"]
    assert features("2026-03-20")["is_holiday"]  # Eid ul-Fitr


def test_muharram_and_holidays():
    assert features("2026-06-20")["season"] == "muharram"
    assert features("2026-06-25")["is_holiday"]  # Ashura, 10 Muharram 1448
    assert features("2026-08-14")["is_holiday"]
    assert not features("2026-08-13")["is_holiday"]


def test_off_peak_weekday():
    f = features("2026-07-15")
    assert f["season"] == "off_peak"
    assert not f["is_weekend"] and not f["is_smog_season"]


def test_calendar_features_keeps_the_index_and_missing_dates():
    dates = pd.Series(["2026-12-19", None, "2026-12-19"], index=[10, 11, 12])
    out = calendar_features(dates, SETTINGS)
    assert list(out.index) == [10, 11, 12]
    assert out.loc[10, "is_peak_season"] and out.loc[12, "hijri_month"] == 7
    assert out.loc[11].isna().all()
    assert list(out["season"].cat.categories)[-1] == "off_peak"


def test_dates_outside_umm_al_qura_raise():
    with pytest.raises(OverflowError):
        features("2090-01-01")
