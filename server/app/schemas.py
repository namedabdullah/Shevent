"""Request and response models: the API contract in packages/core/schemas, in pydantic.

The enums come from the same reference CSVs as the TypeScript ones, and packages/core checks the server's sample
responses against its zod schemas (tests/contract/), so the two can't drift apart unnoticed.
"""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_serializer

from shevent_ml.config import CATEGORIES
from shevent_ml.models.price_features import AREAS, CATEGORICAL, EVENT_TYPES, TIER_RANK

Category = Literal[tuple(CATEGORIES)]
Area = Literal[tuple(AREAS)]
EventType = Literal[tuple(EVENT_TYPES)]
VenueType = Literal[tuple(CATEGORICAL["venue_type"])]
PriceTier = Literal[tuple(TIER_RANK)]
PriceUnit = Literal["per_head", "per_event", "per_hour", "per_package", "per_slot", "per_setup"]
FairnessLevel = Literal["green", "yellow", "red"]
PackageKind = Literal["cheapest", "balanced", "highest_quality"]
ChatLanguage = Literal["en", "ur", "roman_ur", "mixed"]

PriceRange = Annotated[list[float], Field(min_length=2, max_length=2, description="[low, high] in PKR")]
ItemText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class EventSpec(BaseModel):
    """The event without the host's budget (what a vendor may see; what #5 prices)."""

    event_type: EventType
    guest_count: int = Field(ge=10, le=5000)
    area: Area
    venue_type: VenueType | None = None
    event_date: date
    preferences: list[Annotated[str, StringConstraints(max_length=40)]] | None = Field(default=None, max_length=10)


class EstimateRequest(EventSpec):
    total_budget_pkr: int = Field(ge=10_000, le=500_000_000)


class AllocationItem(BaseModel):
    share: float = Field(ge=0, le=1)
    pkr: float = Field(ge=0)
    range: PriceRange


class EstimateResponse(BaseModel):
    allocation: dict[Category, AllocationItem]
    season_factor: str | None
    warnings: list[str]
    explanations: list[str]
    model_version: str


class VendorSummary(BaseModel):
    vendor_id: str
    slug: str
    name: str
    category: Category
    base_area: Area
    price_tier: PriceTier | None
    verified: bool
    rating: float | None
    review_count: int = Field(ge=0)


class RecommendRequest(BaseModel):
    plan: EstimateRequest
    category: Category
    budget_pkr: int = Field(ge=0, description="This category's budget from #1")
    limit: int | None = Field(default=None, ge=1, le=50)


class Match(VendorSummary):
    score: float = Field(ge=0, le=1)
    price_range: PriceRange
    reasons: list[str] = Field(min_length=1)
    is_new: bool


class RecommendResponse(BaseModel):
    category: Category
    matches: list[Match]
    sponsored: list[Match]
    model_version: str


class PackagesRequest(BaseModel):
    plan: EstimateRequest
    categories: list[Category] = Field(min_length=1)
    unavailable_vendor_ids: list[str] | None = Field(default=None, max_length=1000)

    @field_validator("categories")
    @classmethod
    def unique(cls, categories):
        if len(set(categories)) != len(categories):
            raise ValueError("categories must be unique")
        return categories


class PackageItem(BaseModel):
    vendor: VendorSummary
    price_pkr: float = Field(ge=0)
    price_is_estimate: bool
    price_range: PriceRange
    score: float = Field(ge=0, le=1)


class Package(BaseModel):
    kind: PackageKind
    total_pkr: float = Field(ge=0)
    items: list[PackageItem] = Field(min_length=1)


class PackagesResponse(BaseModel):
    budget_pkr: float = Field(ge=0)
    packages: list[Package] = Field(max_length=3)
    unfilled_categories: list[Category]
    cheapest_total_pkr: float | None
    model_version: str


class QuoteCheckRequest(BaseModel):
    plan: EventSpec
    category: Category
    quoted_pkr: float = Field(gt=0)
    unit: PriceUnit
    hours: float | None = Field(default=None, gt=0, le=24)
    inclusions: list[ItemText] = Field(max_length=50)
    exclusions: list[ItemText] | None = Field(default=None, max_length=50)
    notes: str | None = Field(default=None, max_length=2000)
    vendor_tier: PriceTier | None = None


class QuoteCheckResponse(BaseModel):
    level: FairnessLevel
    typical_range: PriceRange
    unit: PriceUnit
    percent_above_high: float | None
    percent_below_low: float | None
    ask_about: list[str]
    charged_extra: list[str]
    compared_with: Literal["same_tier", "all_vendors"]
    model_version: str


class FeedbackRequest(BaseModel):
    plan_id: str
    plan: EstimateRequest
    actual_spend_pkr: dict[Category, Annotated[float, Field(ge=0)]]
    guest_count_actual: int | None = Field(default=None, ge=1, le=10_000)
    rating: int = Field(ge=1, le=5)


class FeedbackResponse(BaseModel):
    accepted: bool


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class AssistantChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)


class ExtractedPlan(BaseModel):
    """The plan understood so far: any EstimateRequest field, and only those the host gave (unset ones are left
    out, not null, as the zod schema's .partial() expects)."""

    event_type: EventType | None = None
    guest_count: int | None = Field(default=None, ge=10, le=5000)
    area: Area | None = None
    venue_type: VenueType | None = None
    event_date: date | None = None
    total_budget_pkr: int | None = Field(default=None, ge=10_000, le=500_000_000)

    @model_serializer(mode="wrap")
    def without_unset(self, handler):
        return {k: v for k, v in handler(self).items() if v is not None}


class AssistantChatResponse(BaseModel):
    reply: str
    language: ChatLanguage
    extracted: ExtractedPlan
    missing: list[str]
    estimate: EstimateResponse | None
    fallback_to_form: bool
    model_version: str


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    models: dict[str, str | None]
    vendors: int | None
    assistant: str | None = None
