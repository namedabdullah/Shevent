import httpx
import pytest

from app.catalog import SupabaseCatalog, for_event

VENDOR = {
    "id": "v1",
    "slug": "demo-marquee",
    "name": "Demo Marquee",
    "category": "venue",
    "sub_type": None,
    "base_area": "Gulberg",
    "areas_served": ["Gulberg", "DHA"],
    "capacity_min": None,
    "capacity_max": 600,
    "price_tier": None,
    "event_types": ["wedding_mehndi"],
    "years_active": 5,
    "verified": True,
}


class FakeSupabase:
    def __init__(self):
        self.calls, self.down = [], False

    def __call__(self, request):
        self.calls.append(request)
        if self.down:
            return httpx.Response(503)
        table = request.url.path.rsplit("/", 1)[-1]
        rows = {
            "vendors": [VENDOR, {**VENDOR, "id": "v2", "slug": "other", "areas_served": []}],
            "vendor_stats": [{"vendor_id": "v1", "rating": 4.5, "review_count": 12}],
            "sponsored_placements": [{"vendor_id": "v2", "area": "DHA"}],
        }[table]
        return httpx.Response(200, json=rows)


@pytest.fixture
def supabase():
    return FakeSupabase()


def catalog(supabase, ttl=300):
    client = httpx.Client(transport=httpx.MockTransport(supabase), headers={"apikey": "publishable"})
    return SupabaseCatalog("https://example.supabase.co", "publishable", ttl, client=client)


def test_listings_stats_and_placements_become_one_row_per_vendor(supabase):
    frame = catalog(supabase).vendors().set_index("vendor_id")
    assert frame.loc["v1", "areas_served"] == "Gulberg|DHA" and frame.loc["v1", "rating"] == 4.5
    assert frame.loc["v2", "review_count"] == 0 and frame.loc["v2", "price_tier"] == ""
    # Only active placements are asked for, with the publishable key.
    placements = next(c for c in supabase.calls if c.url.path.endswith("sponsored_placements"))
    assert placements.url.params["starts_at"].startswith("lte.") and placements.url.params["ends_at"].startswith("gt.")
    assert placements.headers["apikey"] == "publishable"


def test_a_placement_counts_only_in_its_area(supabase):
    frame = catalog(supabase).vendors()
    assert for_event(frame, "DHA").set_index("vendor_id")["sponsored"].to_dict() == {"v1": False, "v2": True}
    assert not for_event(frame, "Gulberg")["sponsored"].any()


def test_the_list_is_cached_and_kept_when_the_database_goes_down(supabase):
    vendors = catalog(supabase, ttl=0)
    first = vendors.vendors()
    supabase.down = True
    assert vendors.vendors() is first
    fresh = catalog(supabase)
    with pytest.raises(httpx.HTTPStatusError):
        fresh.vendors()


def test_within_the_ttl_the_database_is_asked_once(supabase):
    vendors = catalog(supabase)
    vendors.vendors()
    vendors.vendors()
    assert len(supabase.calls) == 3
