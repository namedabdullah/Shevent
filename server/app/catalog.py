"""The vendors the models rank: the app's public listings, read from Supabase and kept for a few minutes.

Reading the app database (not data/processed/vendors.parquet) means every vendor_id the server returns is a real
listing the web and mobile apps can open and message. Vendors, their review stats and sponsored placements are all
public under RLS, so the publishable key is enough; no service key is stored here.
"""

import json
import logging
import threading
import time
from datetime import UTC, datetime

import httpx
import numpy as np
import pandas as pd

VENDOR_COLUMNS = (
    "id,slug,name,category,sub_type,base_area,areas_served,capacity_min,capacity_max,price_tier,event_types,"
    "years_active,verified"
)
ALL_AREAS = "*"

log = logging.getLogger(__name__)


def to_frame(vendors, stats=(), placements=()):
    """Listings (rows of public.vendors), review stats (public.vendor_stats) and active sponsored placements, as the
    frame #3 and #4 read: one row per vendor, area and event-type lists joined with "|"."""
    columns = ["vendor_id", "slug", "name", "category", "sub_type", "base_area", "areas_served", "capacity_min",
               "capacity_max", "price_tier", "event_types", "years_active", "verified", "rating", "review_count",
               "sponsored_areas"]  # fmt: skip
    if not vendors:
        return pd.DataFrame(columns=columns)
    by_vendor = {s["vendor_id"]: s for s in stats}
    sponsored = {}
    for p in placements:
        sponsored.setdefault(p["vendor_id"], set()).add(p["area"])
    rows = []
    for v in vendors:
        stat = by_vendor.get(v["id"], {})
        rows.append(
            {
                "vendor_id": v["id"],
                "slug": v["slug"],
                "name": v["name"],
                "category": v["category"],
                "sub_type": v.get("sub_type") or "",
                "base_area": v["base_area"],
                "areas_served": "|".join(v.get("areas_served") or []),
                "capacity_min": v.get("capacity_min"),
                "capacity_max": v.get("capacity_max"),
                "price_tier": v.get("price_tier") or "",
                "event_types": "|".join(v.get("event_types") or []),
                "years_active": v.get("years_active"),
                "verified": bool(v.get("verified")),
                "rating": stat.get("rating"),
                "review_count": int(stat.get("review_count") or 0),
                "sponsored_areas": frozenset(sponsored.get(v["id"], ())),
            }
        )
    frame = pd.DataFrame(rows, columns=columns)
    for col in ["capacity_min", "capacity_max", "years_active", "rating"]:
        frame[col] = pd.to_numeric(frame[col], errors="coerce").astype(float)
    return frame


def for_event(vendors, area):
    """The catalogue with `sponsored` set for this event: an active placement in its area."""
    sponsored = vendors["sponsored_areas"].map(lambda areas: area in areas or ALL_AREAS in areas)
    return vendors.assign(sponsored=sponsored.astype(bool))


def summary(row):
    """The contract's vendor summary (no contact details) for one catalogue row."""
    rating = row["rating"]
    return {
        "vendor_id": row["vendor_id"],
        "slug": row["slug"],
        "name": row["name"],
        "category": row["category"],
        "base_area": row["base_area"],
        "price_tier": row["price_tier"] or None,
        "verified": bool(row["verified"]),
        "rating": None if rating is None or np.isnan(rating) else float(rating),
        "review_count": int(row["review_count"]),
    }


class StaticCatalog:
    """A fixed vendor list: tests, and running the server without a database."""

    def __init__(self, frame):
        self.frame = frame

    def vendors(self):
        return self.frame

    @classmethod
    def from_fixture(cls, path):
        """packages/core/fixtures/vendors.json (the same demo vendors supabase/seed.sql inserts)."""
        fixture = json.loads(path.read_text(encoding="utf-8"))
        vendors = [{**v, "id": v["vendor_id"]} for v in fixture]
        stats = [
            {"vendor_id": v["vendor_id"], "rating": v["rating"], "review_count": v["review_count"]} for v in fixture
        ]
        placements = [{"vendor_id": v["vendor_id"], "area": ALL_AREAS} for v in fixture if v.get("sponsored")]
        return cls(to_frame(vendors, stats, placements))


class SupabaseCatalog:
    """The listings from Supabase's REST API, fetched again once they are older than ttl_seconds."""

    def __init__(self, url, key, ttl_seconds=300, client=None):
        self.base = url.rstrip("/") + "/rest/v1"
        self.client = client or httpx.Client(timeout=10, headers={"apikey": key})
        self.ttl = ttl_seconds
        self.lock = threading.Lock()
        self.cached = (0.0, None)

    def _get(self, table, **params):
        response = self.client.get(f"{self.base}/{table}", params=params)
        response.raise_for_status()
        return response.json()

    def fetch(self):
        now = datetime.now(UTC).isoformat()
        vendors = self._get("vendors", select=VENDOR_COLUMNS, order="id")
        stats = self._get("vendor_stats", select="vendor_id,rating,review_count")
        placements = self._get(
            "sponsored_placements", select="vendor_id,area", starts_at=f"lte.{now}", ends_at=f"gt.{now}"
        )
        return to_frame(vendors, stats, placements)

    def vendors(self):
        fetched_at, frame = self.cached
        if frame is None or time.monotonic() - fetched_at > self.ttl:
            with self.lock:
                fetched_at, frame = self.cached
                if frame is None or time.monotonic() - fetched_at > self.ttl:
                    try:
                        frame = self.fetch()
                    except httpx.HTTPError:
                        # The database is down: keep serving the last list (if any) and try again after ttl.
                        if frame is None:
                            raise
                        log.warning("Vendor refresh failed; serving the list from earlier", exc_info=True)
                    self.cached = (time.monotonic(), frame)
        return frame
