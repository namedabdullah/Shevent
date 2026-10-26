import pandas as pd
import pytest

from shevent_ml.features.events import event_features
from shevent_ml.features.vendors import shrunk_rating, vendor_features


def test_event_features():
    events = pd.DataFrame(
        {
            "event_type": ["wedding_mehndi", "birthday"],
            "guest_count": [300, 60],
            "area": ["Gulberg", "Johar Town"],
            "venue_type": ["farmhouse", "banquet"],
            "event_date": ["2026-12-19", "2026-07-15"],
            "total_budget_pkr": [2_500_000, 400_000],
            "preferences": ["decor_heavy|live_dhol|unknown", None],
        }
    )
    out = event_features(events)
    assert out.loc[0, "budget_per_guest"] == pytest.approx(2_500_000 / 300)
    assert out.loc[0, "pref_decor_heavy"] and out.loc[0, "pref_live_dhol"] and not out.loc[0, "pref_premium_food"]
    assert not out.loc[1, ["pref_decor_heavy", "pref_premium_food", "pref_live_dhol"]].any()
    # An outdoor venue in December carries smog risk; an indoor hall in July doesn't.
    assert out.loc[0, "outdoor_smog_risk"] and not out.loc[1, "outdoor_smog_risk"]
    assert out.loc[0, "season"] == "peak_wedding_season"
    assert "unknown" not in "".join(out.columns)


def test_event_features_without_optional_columns():
    events = pd.DataFrame(
        {"event_type": ["birthday"], "guest_count": ["80"], "area": ["DHA"], "event_date": ["2026-11-07"]}
    )
    out = event_features(events)
    assert out.loc[0, "guest_count"] == 80
    assert not out.loc[0, "is_outdoor"]
    assert "budget_per_guest" not in out


def test_shrunk_rating_pulls_few_reviews_toward_the_category_mean():
    rating = pd.Series([5.0, 4.6, None, 3.8, 4.0])
    reviews = pd.Series([5, 200, None, 300, 50])
    category = pd.Series(["catering", "catering", "catering", "catering", "decor"])
    out = shrunk_rating(rating, reviews, category, prior_reviews=20)
    catering_mean = (5 * 5 + 4.6 * 200 + 3.8 * 300) / 505
    assert out[0] == pytest.approx((catering_mean * 20 + 25) / 25)
    # Where caterers average about 4.1, five 5-star reviews don't beat two hundred 4.6-star ones.
    assert out[0] < out[1]
    assert out[2] == pytest.approx(catering_mean)  # unrated: the category mean
    assert out[4] == pytest.approx(4.0)  # alone in its category


def test_vendor_features():
    vendors = pd.DataFrame(
        {
            "vendor_id": ["CAT-001", "CAT-002"],
            "category": ["catering", "catering"],
            "sub_type": ["traditional", ""],
            "base_area": ["DHA", "Gulberg"],
            "areas_served": ["DHA|Gulberg", ""],
            "capacity_min": [50, None],
            "capacity_max": [800, None],
            "price_tier": ["premium", ""],
            "event_types": ["birthday|wedding_walima", ""],
            "rating": [4.5, None],
            "review_count": [100, None],
            "years_active": [8, None],
        }
    )
    out = vendor_features(vendors)
    assert list(out.index) == ["CAT-001", "CAT-002"]
    assert out.loc["CAT-001", "tier_rank"] == 2 and pd.isna(out.loc["CAT-002", "tier_rank"])
    assert out.loc["CAT-001", "n_areas_served"] == 2 and out.loc["CAT-002", "n_areas_served"] == 0
    assert out.loc["CAT-001", "n_event_types"] == 2
    assert out.loc["CAT-002", "rating_shrunk"] == pytest.approx(4.5)
