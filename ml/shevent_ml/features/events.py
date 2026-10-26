"""Features of an event plan (the #1 and #2 inputs): size, place, venue, preferences and its calendar."""

import numpy as np
import pandas as pd

from shevent_ml.features.calendar import calendar_features

# Same lists as packages/core/enums (categories.ts and preferences.ts). Change them together.
VENUE_TYPES = ["marquee", "banquet", "farmhouse", "rooftop", "lawn", "hotel", "other"]
OUTDOOR_VENUES = {"farmhouse", "rooftop", "lawn"}
PREFERENCES = ["decor_heavy", "premium_food", "live_dhol"]


def preference_flags(preferences):
    """'decor_heavy|live_dhol' (or a list) -> one pref_<name> column per known preference. Unknown ones are ignored."""
    chosen = preferences.map(
        lambda p: set(p.split("|")) if isinstance(p, str) else set(p) if isinstance(p, list | tuple | set) else set()
    )
    return pd.DataFrame(
        {f"pref_{name}": chosen.map(lambda s, n=name: n in s) for name in PREFERENCES}, index=preferences.index
    )


def event_features(events, calendar_settings=None):
    """Model features for each event, on the same index.

    Expects event_type, guest_count, area and event_date; venue_type, total_budget_pkr and preferences are
    optional. Text columns are kept as text: each model decides how to encode them.
    """
    out = pd.DataFrame(index=events.index)
    out["event_type"] = events["event_type"]
    out["area"] = events["area"]
    out["venue_type"] = events["venue_type"] if "venue_type" in events else pd.Series(pd.NA, index=events.index)
    guests = pd.to_numeric(events["guest_count"], errors="coerce")
    out["guest_count"] = guests
    # Prices grow more slowly than the guest list (fixed costs), so models see guests on a log scale too.
    out["log_guests"] = np.log1p(guests)
    out["is_outdoor"] = out["venue_type"].isin(OUTDOOR_VENUES)

    if "total_budget_pkr" in events:
        budget = pd.to_numeric(events["total_budget_pkr"], errors="coerce")
        out["total_budget_pkr"] = budget
        out["budget_per_guest"] = budget / guests.where(guests > 0)

    preferences = events["preferences"] if "preferences" in events else pd.Series(None, index=events.index)
    out = out.join(preference_flags(preferences))

    calendar = calendar_features(events["event_date"], calendar_settings)
    out = out.join(calendar)
    out["outdoor_smog_risk"] = out["is_outdoor"] & calendar["is_smog_season"].fillna(False)
    return out
