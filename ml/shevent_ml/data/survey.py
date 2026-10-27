"""The host survey (data/outreach/host_survey_questions.md): real budget splits, the ground truth for #1.

Google Forms exports one column per question, headed by the question text, so columns are matched on how their
header starts. Amounts may be typed as "450000", "Rs 4,50,000", "4.5 lakh" or "1.5 crore". The free-text answer
(Q23) is dropped: it may hold personal details.
"""

import hashlib
import re

import numpy as np
import pandas as pd

from shevent_ml.data.clean import map_area

# Header start (lower case) -> column. Order matters: the first match wins.
QUESTIONS = [
    ("timestamp", "submitted_at"),
    ("what type of event", "event_type"),
    ("when was it held", "event_month"),
    ("which area", "area"),
    ("type of venue", "venue_type"),
    ("day of the week", "day"),
    ("how many guests were invited", "guests_invited"),
    ("about how many guests actually came", "guests_actual"),
    ("what was your planned total budget", "total_budget_pkr"),
    ("what did you actually spend", "total_spend_pkr"),
    ("venue / hall", "spend_venue"),
    ("catering / food", "spend_catering"),
    ("if you know it, what was the per-head", "per_head_food_pkr"),
    ("decor", "spend_decor"),
    ("dj / sound", "spend_dj_sound"),
    ("lighting", "spend_lighting"),
    ("everything else", "spend_other"),
    ("did you go over budget", "over_budget"),
]
EVENT_TYPES = {
    "mehndi / mayun": "wedding_mehndi",
    "baraat": "wedding_baraat",
    "walima": "wedding_walima",
    "engagement / nikah": "engagement",
    "birthday": "birthday",
    "corporate event": "corporate_dinner",
    "university event": "university_gala",
    "other private party": "private_party",
}
VENUE_TYPES = {
    "marquee": "marquee",
    "banquet hall": "banquet",
    "farmhouse": "farmhouse",
    "rooftop": "rooftop",
    "lawn": "lawn",
    "hotel": "hotel",
    "home": "other",
    "other": "other",
}
SPEND = ["spend_venue", "spend_catering", "spend_decor", "spend_dj_sound", "spend_lighting"]
UNITS = {
    "crore": 1e7,
    "cr": 1e7,
    "lakh": 1e5,
    "lac": 1e5,
    "lakhs": 1e5,
    "million": 1e6,
    "m": 1e6,
    "k": 1e3,
    "thousand": 1e3,
}
AMOUNT = re.compile(r"^(\d+(?:\.\d+)?)\s*([a-z]*)$")
MONTH_FORMATS = ["%B %Y", "%b %Y", "%m/%Y", "%Y-%m", "%m/%d/%Y", "%Y-%m-%d"]


def parse_pkr(value):
    """'Rs 4,50,000' -> 450000; '4.5 lakh' -> 450000; '' or anything unreadable -> NaN. 0 stays 0 ('didn't spend')."""
    text = str(value).strip().lower().replace(",", "").replace("pkr", "").replace("rs.", "").replace("rs", "").strip()
    match = AMOUNT.match(text)
    if not match:
        return np.nan
    number, unit = float(match.group(1)), match.group(2)
    if unit and unit not in UNITS:
        return np.nan
    return number * UNITS.get(unit, 1)


def parse_month(value):
    """'December 2025', '12/2025' or a Google date ('12/1/2025') -> the 15th of that month. Month-first dates."""
    text = str(value).strip()
    for fmt in MONTH_FORMATS:
        parsed = pd.to_datetime(text, format=fmt, errors="coerce")
        if pd.notna(parsed):
            return parsed.replace(day=15)
    return pd.NaT


def rename_columns(df):
    names = {}
    for column in df.columns:
        header = column.strip().lower()
        for start, name in QUESTIONS:
            if header.startswith(start) and name not in names.values():
                names[column] = name
                break
    return df[list(names)].rename(columns=names)


def response_id(submitted_at, index):
    """A stable id per response, from its timestamp (Google's first column), so the test half never changes."""
    return "SV-" + hashlib.sha256(f"{submitted_at}|{index if not submitted_at else ''}".encode()).hexdigest()[:10]


def build_survey(raw, area_aliases):
    """Cleaned survey responses, with spend and share per category where all five amounts were given."""
    df = rename_columns(raw)
    out = pd.DataFrame(index=df.index)
    submitted = df["submitted_at"] if "submitted_at" in df else pd.Series("", index=df.index)
    out["response_id"] = [response_id(s, i) for i, s in zip(df.index, submitted, strict=True)]
    out["event_type"] = df.get("event_type", pd.Series("", index=df.index)).str.strip().str.lower().map(EVENT_TYPES)
    out["event_date"] = df.get("event_month", pd.Series("", index=df.index)).map(parse_month)
    out["area"] = df.get("area", pd.Series("", index=df.index)).map(lambda a: map_area(a, area_aliases) or np.nan)
    out["venue_type"] = df.get("venue_type", pd.Series("", index=df.index)).str.strip().str.lower().map(VENUE_TYPES)
    out["day"] = df.get("day", pd.Series("", index=df.index))
    for column in [
        "guests_invited",
        "guests_actual",
        "total_budget_pkr",
        "total_spend_pkr",
        "per_head_food_pkr",
        *SPEND,
        "spend_other",
    ]:
        out[column] = df[column].map(parse_pkr) if column in df else np.nan
    out["over_budget"] = df.get("over_budget", pd.Series("", index=df.index))

    spend = out[SPEND]
    total = spend.sum(axis=1, min_count=len(SPEND))
    complete = spend.notna().all(axis=1) & (total > 0)
    for column in SPEND:
        out["share_" + column.removeprefix("spend_")] = (out[column] / total).where(complete)
    out["has_split"] = complete
    # A planned budget left blank: the five categories' spend is the closest stand-in.
    out["total_budget_pkr"] = out["total_budget_pkr"].fillna(total.where(complete))
    return out.reset_index(drop=True)


def is_survey_test(response_ids, test_share=0.5):
    """Half the responses (by a hash of their id) are held out for testing #1; the split never changes."""
    buckets = response_ids.map(lambda r: int(hashlib.sha256(r.encode()).hexdigest()[:8], 16) % 100)
    return buckets < round(test_share * 100)
