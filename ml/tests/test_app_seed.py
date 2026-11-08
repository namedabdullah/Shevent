import re

import pandas as pd

from shevent_ml.data.app_seed import app_vendor_id, seed_sql, slug, vendor_rows

SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")  # the check on public.vendors.slug


def vendor(vid="CAT-001", name="Al-Tuaam Catering", **extra):
    row = {
        "vendor_id": vid,
        "name": name,
        "category": "catering",
        "sub_type": "",
        "base_area": "Gulberg",
        "areas_served": "Gulberg|DHA",
        "capacity_min": None,
        "capacity_max": None,
        "price_tier": "",
        "event_types": "",
        "years_active": None,
    }
    return {**row, **extra}


def test_ids_are_stable_uuids_so_reloading_updates_in_place():
    assert app_vendor_id("CAT-001") == app_vendor_id("CAT-001") != app_vendor_id("CAT-002")
    assert re.fullmatch(r"[0-9a-f-]{36}", app_vendor_id("CAT-001"))


def test_slugs_pass_the_database_check_whatever_the_name():
    for name in ["G.N CATERERS & EVENT PLANNERS", "  Décor -- Studio  ", "شادی ہال", "x" * 200]:
        value = slug(name, "VEN-012")
        assert SLUG.fullmatch(value) and len(value) <= 80 and value.endswith("ven-012")


def test_values_the_database_would_reject_are_dropped_or_cleared():
    vendors = pd.DataFrame(
        [
            vendor(areas_served="Gulberg|Atlantis", event_types="wedding_mehndi|any", price_tier="mid"),
            vendor("CAT-002", capacity_min=500, capacity_max=100, years_active=300),
            vendor("CAT-003", base_area="Atlantis"),
            vendor("CAT-004", category="florist"),
            vendor("CAT-005", name="X"),
        ]
    )
    rows = vendor_rows(vendors)
    assert [r["slug"].rsplit("-", 2)[-2:] for r in rows] == [["cat", "001"], ["cat", "002"]]
    first, second = rows
    assert first["areas_served"] == ["Gulberg"] and first["event_types"] == ["wedding_mehndi"]
    assert first["price_tier"] == "mid" and first["sub_type"] is None
    assert pd.isna(second["capacity_min"]) and pd.isna(second["capacity_max"]) and pd.isna(second["years_active"])


def test_sql_escapes_quotes_and_never_overwrites_a_claimed_listing():
    sql = seed_sql(vendor_rows(pd.DataFrame([vendor(name="Lahore's Kitchen")])))
    assert "'Lahore''s Kitchen'" in sql and "array['Gulberg', 'DHA']::public.lahore_area[]" in sql
    assert "on conflict (id) do update" in sql and sql.rstrip().endswith("where public.vendors.owner_id is null;")
    for kept in ["owner_id =", "verified =", "public_consent ="]:
        assert kept not in sql
