import re

import pandas as pd
import pytest

from shevent_ml.data.import_workbook import dj_type, import_workbook, venue_type

VENDOR_COLUMNS = [
    "Vendor ID",
    "Vendor name",
    "Primary category",
    "Locality",
    "Public address",
    "Public phone",
    "Advertised services",
    "Listed price low PKR",
    "Listed price high PKR",
    "Price unit / scope",
    "Source type",
    "Price date",
    "Verification status",
    "Source URL",
    "Secondary source",
    "Notes / limitations",
    "Research date",
]
LEAD_COLUMNS = [
    "ID",
    "Vendor",
    "Primary category",
    "Area",
    "Address (directory)",
    "Public phone",
    "Advertised services",
    "Listed price minimum PKR",
    "Listed price maximum PKR",
    "Pricing scope",
    "Source type",
    "Price date",
    "Verification status",
    "Source URL",
    "Secondary source",
    "Limitations",
    "Research date",
]
PRICE_COLUMNS = [
    "Vendor",
    "Category",
    "Package / offering",
    "Min price PKR",
    "Max price PKR",
    "Unit",
    "Scope",
    "Listed price date",
    "Source URL",
    "Source type",
    "Current quote verified?",
]
MAPS = "https://www.google.com/maps/search/?api=1&query=x"


def vendor(
    vid,
    name,
    category,
    locality,
    services,
    low=None,
    high=None,
    scope=None,
    source="Vendor directory",
    date="Not stated",
    url=MAPS,
):
    return [
        vid,
        name,
        category,
        locality,
        "12 Main Road",
        "+92 300 1234567",
        services,
        low,
        high,
        scope,
        source,
        date,
        "Unconfirmed - contact vendor",
        url,
        None,
        "",
        "2026-10-26",
    ]


@pytest.fixture
def workbook(tmp_path):
    directory = pd.DataFrame(
        [
            vendor("SHV-001", "Royal Caterers", "Catering", "DHA Phase 5", "Catering; weddings"),
            vendor(
                "SHV-002",
                "Studio Decor",
                "Decoration",
                "Eden Lane Villas",
                "Mehndi decor",
                35000,
                None,
                "PKR / Mehndi decor starting",
                "Official website",
                url="https://studio.example/pricing",
            ),
            vendor(
                "SHV-003",
                "Blessing Marquee",
                "Venues",
                "Bedian Road",
                "Marquee; catering; DJ",
                1950,
                3350,
                "PKR / head menu",
                "Venue directory",
                "2024-08-07",
            ),
            vendor(
                "SHV-004",
                "Everest Studio",
                "Catering",
                "Lahore",
                "Catering; decor",
                2900,
                3600,
                "PKR / head full package",
            ),
            vendor(
                "SHV-005",
                "Crystal Hall",
                "Venues",
                "Cantt",
                "Marriage hall; catering",
                1400,
                3200,
                "PKR / head menu",
                "Venue directory",
                "2024-08-18",
            ),
            vendor("SHV-006", "Al Wahab Sound System", "DJ / Sound", "Wahdat Colony", "Sound rental; DJ"),
        ],
        columns=VENDOR_COLUMNS,
    )
    leads = pd.DataFrame(
        [
            vendor("SHV-007", "Aghas Marriage Lawns", "Venues", "Gaddafi Stadium", "Venues"),
            vendor("SHV-008", "Party Rentals", "Tents", "Gulberg", "Tents"),
        ],
        columns=LEAD_COLUMNS,
    )
    prices = pd.DataFrame(
        [
            [
                "Studio Decor",
                "Decoration",
                "Mehndi decoration",
                35000,
                None,
                "per setup",
                "Starting price",
                "Not stated",
                "",
                "Official website",
                "No",
            ],
            [
                "Blessing Marquee",
                "Catering",
                "Venue menus",
                1950,
                3350,
                "per head",
                "Menu variations",
                "2024-08-07",
                "",
                "Venue directory",
                "No",
            ],
            [
                "Blessing Marquee",
                "Venues",
                "A/C add-on",
                4000,
                None,
                "per hour",
                "Starts from",
                "Not stated",
                "",
                "Official website",
                "No",
            ],
            [
                "Everest Studio",
                "Catering",
                "Chicken full wedding package",
                2900,
                None,
                "per head",
                "Bundled package min 200",
                "Not stated",
                "",
                "Vendor directory",
                "No",
            ],
            [
                "Everest Studio",
                "Catering",
                "Mutton full wedding package",
                3600,
                None,
                "per head",
                "Bundled package min 200",
                "Not stated",
                "",
                "Vendor directory",
                "No",
            ],
            [
                "Crystal Hall",
                "Venues",
                "Hall 100-199 guests",
                30000,
                None,
                "per event",
                "Extra hall charge",
                "2024-08-18",
                "",
                "Venue directory",
                "No",
            ],
            [
                "Unknown Vendor",
                "Catering",
                "Menu",
                2000,
                None,
                "per head",
                "Menu rate",
                "Not stated",
                "",
                "Vendor directory",
                "No",
            ],
        ],
        columns=PRICE_COLUMNS,
    )
    path = tmp_path / "research.xlsx"
    with pd.ExcelWriter(path) as writer:
        pd.DataFrame([["SHEVENT"]]).to_excel(writer, sheet_name="Overview", index=False, header=False)
        directory.to_excel(writer, sheet_name="Vendor Directory", index=False)
        prices.to_excel(writer, sheet_name="Published Prices", index=False)
        leads.to_excel(writer, sheet_name="NEW Leads Oct 26", index=False)
    return path


@pytest.fixture
def converted(workbook, tmp_path):
    out = tmp_path / "raw"
    summary = import_workbook(workbook, out)
    vendors = pd.read_csv(out / "vendors.csv", dtype=str, keep_default_na=False)
    prices = pd.read_csv(out / "price_observations.csv", dtype=str, keep_default_na=False)
    return summary, vendors.set_index("vendor_id"), prices, out


def test_vendors_get_project_ids_areas_and_no_phone_or_address(converted):
    summary, vendors, prices, out = converted
    assert list(vendors.index) == ["CAT-001", "DEC-001", "VEN-001", "CAT-002", "VEN-002", "DJS-001", "VEN-003"]
    assert vendors.at["CAT-001", "base_area"] == "DHA"  # DHA Phase 5 is a reference alias
    assert vendors.at["VEN-003", "base_area"] == "Gulberg"  # Gaddafi Stadium, from the import config
    assert vendors.at["VEN-001", "base_area"] == "Other" and "locality: Bedian Road" in vendors.at["VEN-001", "notes"]
    assert "locality not stated" in vendors.at["CAT-002", "notes"]  # "Lahore"
    assert "workbook id SHV-003" in vendors.at["VEN-001", "notes"]
    assert vendors.at["VEN-001", "sub_type"] == "marquee" and vendors.at["VEN-003", "sub_type"] == "lawn"
    assert vendors.at["DEC-001", "website_url"].startswith("https://studio") and vendors.at["CAT-001", "maps_url"]
    # A category outside the five is skipped and reported.
    assert ("SHV-008", "unknown category 'Tents'") in summary["skipped"]
    for path in out.glob("*.csv"):
        text = path.read_text(encoding="utf-8")
        assert not re.search(r"\+92|300 1234567", text) and "12 Main Road" not in text


def test_prices_follow_the_workbook_and_the_rules(converted):
    summary, vendors, prices, _ = converted
    by_package = prices.set_index("package_name")
    menu = by_package.loc["Venue menus"]
    # A venue's per-head menu is a catering price; the dated price keeps its date.
    assert (menu["category"], menu["unit"], menu["price_date"]) == ("catering", "per_head", "2024-08-07")
    bundle = by_package.loc["Chicken full wedding package"]
    assert "combo" in bundle["notes"] and bundle["guest_min"] == "200" and bundle["confidence"] == "low"
    hall = by_package.loc["Hall 100-199 guests"]
    assert (hall["category"], hall["unit"], hall["guest_min"], hall["guest_max"]) == (
        "venue",
        "per_event",
        "100",
        "199",
    )
    decor = by_package.loc["Mehndi decoration"]
    assert decor["event_type"] == "wedding_mehndi" and decor["confidence"] == "medium"
    assert decor["price_date"] == "2026-10-26" and "research date used" in decor["notes"]
    assert "A/C add-on" not in by_package.index
    assert ("Unknown Vendor", "vendor not in the vendor sheets") in summary["skipped"]


def test_directory_prices_are_added_only_when_new(converted):
    _, _, prices, _ = converted
    # Everest's 2,900-3,600 directory range repeats its two published packages; Blessing's repeats its menu.
    assert not (prices["package_name"] == "Per-head full package").any()
    assert (prices["package_name"] == "Venue menus").sum() == 1
    # Crystal Hall's per-head menu is only in the directory, so it's added.
    crystal = prices[(prices["vendor_id"] == "VEN-002") & (prices["unit"] == "per_head")]
    assert crystal["package_name"].tolist() == ["Per-head menu"] and crystal["category"].tolist() == ["catering"]
    assert prices["obs_id"].tolist() == [f"P-{i:04}" for i in range(1, len(prices) + 1)]


def test_output_passes_the_validator(converted):
    import subprocess
    import sys

    from shevent_ml.config import REPO_ROOT

    _, _, _, out = converted
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "validate_data.py"), str(out)],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert "0 errors" in result.stdout, result.stdout[-2000:]


def test_type_rules_use_only_what_is_stated():
    assert venue_type("Grand Nexus Marquee", "") == "marquee"
    assert venue_type("Zaibis Marriage Garden", "") == "lawn"
    assert venue_type("Lahore Castle", "Venues") == ""
    assert dj_type("Al Wahab Sound System", "Sound rental; DJ") == "sound_system"
    assert dj_type("US Entertainment", "DJ; bands") == "dj"
