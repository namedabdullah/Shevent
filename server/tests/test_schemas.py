import re
import typing

import pytest

from app import schemas
from shevent_ml.config import REPO_ROOT

ENUMS = REPO_ROOT / "packages" / "core" / "enums"


def ts_list(file, name):
    """The string values of `export const NAME = [...]` in a packages/core/enums file."""
    text = (ENUMS / file).read_text(encoding="utf-8")
    body = re.search(rf"export const {name} = \[(.*?)\]", text, re.S).group(1)
    return re.findall(r"'([^']+)'", body)


@pytest.mark.parametrize(
    "literal, file, name",
    [
        (schemas.Area, "areas.ts", "AREAS"),
        (schemas.EventType, "event-types.ts", "EVENT_TYPES"),
        (schemas.Category, "categories.ts", "CATEGORIES"),
        (schemas.VenueType, "categories.ts", "VENUE_TYPES"),
        (schemas.PriceTier, "categories.ts", "PRICE_TIERS"),
        (schemas.PriceUnit, "categories.ts", "PRICE_UNITS"),
    ],
)
def test_server_enums_match_the_app_enums(literal, file, name):
    assert sorted(typing.get_args(literal)) == sorted(ts_list(file, name))
