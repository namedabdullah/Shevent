"""Calendar features for an event date: Islamic months, wedding season, smog season, weekends and holidays.

Islamic dates come from hijridate (the Umm al-Qura calendar), never from hard-coded Gregorian dates, because they
move about 11 days earlier every year. Pakistan sights the moon locally, so a date at the edge of a month can be a
day off from Umm al-Qura. That doesn't matter here: the features describe demand, not the exact day of Eid.
"""

from datetime import timedelta
from functools import cache

import pandas as pd
from hijridate import Gregorian, Hijri

from shevent_ml.config import load_config

RAMADAN, MUHARRAM, SHAWWAL = 9, 1, 10

# One label per date for the API's season_factor, in order of precedence: Ramadan and Muharram (few weddings)
# win over the post-Eid rush, which wins over the ordinary wedding season.
SEASONS = ["ramadan", "muharram", "post_eid", "peak_wedding_season", "off_peak"]

FEATURE_COLUMNS = [
    "month",
    "day_of_week",
    "is_weekend",
    "hijri_year",
    "hijri_month",
    "is_ramadan",
    "is_muharram",
    "is_post_eid",
    "is_peak_season",
    "is_smog_season",
    "is_holiday",
    "season",
]


@cache
def _to_hijri(day):
    hijri = Gregorian.fromdate(day).to_hijri()
    return hijri.year, hijri.month, hijri.day


@cache
def _to_gregorian(year, month, day):
    return Hijri(year, month, day).to_gregorian()


def _is_post_eid(day, hijri_year, days):
    eid = _to_gregorian(hijri_year, SHAWWAL, 1)
    return timedelta(0) <= day - eid < timedelta(days=days)


def date_features(day, settings):
    """Features for one datetime.date. Raises OverflowError outside 1924-2077, which Umm al-Qura covers."""
    hijri_year, hijri_month, hijri_day = _to_hijri(day)
    is_ramadan = hijri_month == RAMADAN
    is_muharram = hijri_month == MUHARRAM
    is_post_eid = _is_post_eid(day, hijri_year, settings["post_eid_days"])
    is_peak = day.month in settings["peak_season_months"]
    holiday = day.strftime("%m-%d") in settings["fixed_holidays"] or any(
        hijri_month == month and first <= hijri_day <= last
        for month, first, last in settings["islamic_holidays"].values()
    )

    if is_ramadan:
        season = "ramadan"
    elif is_muharram:
        season = "muharram"
    elif is_post_eid:
        season = "post_eid"
    elif is_peak:
        season = "peak_wedding_season"
    else:
        season = "off_peak"

    return {
        "month": day.month,
        "day_of_week": day.weekday(),
        "is_weekend": day.weekday() in settings["weekend_days"],
        "hijri_year": hijri_year,
        "hijri_month": hijri_month,
        "is_ramadan": is_ramadan,
        "is_muharram": is_muharram,
        "is_post_eid": is_post_eid,
        "is_peak_season": is_peak,
        "is_smog_season": day.month in settings["smog_season_months"],
        "is_holiday": holiday,
        "season": season,
    }


def calendar_features(dates, settings=None):
    """One row of FEATURE_COLUMNS per date, on the same index. Missing dates give a row of missing values.

    calendar_features(events["event_date"])
    """
    settings = settings or load_config("calendar")
    dates = pd.to_datetime(dates)
    rows = {day: date_features(day, settings) for day in {d.date() for d in dates.dropna()}}
    out = pd.DataFrame(
        [rows.get(d.date()) if pd.notna(d) else {} for d in dates], index=dates.index, columns=FEATURE_COLUMNS
    )
    for col in ["month", "day_of_week", "hijri_year", "hijri_month"]:
        out[col] = out[col].astype("Int64")
    for col in FEATURE_COLUMNS:
        if col.startswith("is_"):
            out[col] = out[col].astype("boolean")
    out["season"] = pd.Categorical(out["season"], categories=SEASONS)
    return out


def islamic_month_start(hijri_year, hijri_month):
    """Gregorian date that an Islamic month starts on, e.g. islamic_month_start(1448, 9) for Ramadan 1448."""
    return _to_gregorian(hijri_year, hijri_month, 1)
