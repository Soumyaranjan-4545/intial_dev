"""Shapes of item data going into and out of the API."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import CustodyEventType, ItemKind, ItemStatus
from app.schemas.reference import CategoryOut, OfficeOut
from app.schemas.user import OfficeBrief


def _tidy(value):
    """Trim spaces; treat an empty optional field as "not given"."""
    if isinstance(value, str):
        value = " ".join(value.split())
        return value or None
    return value


# ---------------- Incoming ----------------


class _ItemIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=1000)
    category_id: int
    colour: str | None = Field(default=None, max_length=40)
    brand: str | None = Field(default=None, max_length=60)
    location_text: str = Field(min_length=3, max_length=200)
    happened_on: date

    @field_validator("title", "colour", "brand", "location_text", mode="before")
    @classmethod
    def tidy_short_text(cls, value):
        return _tidy(value)

    @field_validator("description", mode="before")
    @classmethod
    def tidy_description(cls, value):
        # Keep line breaks in descriptions; only trim the ends.
        return value.strip() if isinstance(value, str) else value


class LostItemIn(_ItemIn):
    pass


class FoundItemIn(_ItemIn):
    dropoff_office_id: int
    # Optional for the finder; the guard must fill it in at drop-off if empty.
    secret_detail: str | None = Field(default=None, max_length=300)

    @field_validator("secret_detail", mode="before")
    @classmethod
    def tidy_secret(cls, value):
        return _tidy(value)


class SecretDetailIn(BaseModel):
    secret_detail: str | None = Field(default=None, max_length=300)

    @field_validator("secret_detail", mode="before")
    @classmethod
    def tidy_secret(cls, value):
        return _tidy(value)


class CloseLostIn(BaseModel):
    # RECOVERED: "I got it back".  CLOSED: "I've stopped looking".
    outcome: Literal["RECOVERED", "CLOSED"]


# ---------------- Outgoing ----------------


class ItemCardOut(BaseModel):
    """What the Found and Lost pages show for each item. Deliberately
    contains no secret detail and nothing about who reported it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    ref: str
    kind: ItemKind
    status: ItemStatus
    title: str
    description: str
    category: CategoryOut
    colour: str | None
    brand: str | None
    location_text: str
    happened_on: date
    created_at: datetime
    current_office: OfficeBrief | None
    cover_photo_id: int | None


class ItemPage(BaseModel):
    """One page of results, plus what the frontend needs to draw page links."""

    items: list[ItemCardOut]
    total: int  # matching items across all pages
    page: int
    page_size: int
    total_pages: int


class PersonBrief(BaseModel):
    """Who reported an item. Only ever sent to staff."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str | None
    email: str
    roll_number: str | None


class CustodyEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: CustodyEventType
    from_office: OfficeBrief | None
    to_office: OfficeBrief | None
    actor_name: str | None
    note: str | None
    created_at: datetime


class ItemDetailOut(ItemCardOut):
    photo_ids: list[int]
    dropoff_office: OfficeOut | None
    current_office_full: OfficeOut | None
    received_at: datetime | None
    # Only filled in for people allowed to see it (see services/items.py).
    secret_detail: str | None
    secret_detail_by: str | None
    # What the person viewing may do, so the page knows which buttons to show.
    is_mine: bool
    can_add_photos: bool
    can_edit_secret: bool
    can_close: bool
    # ---- Staff only (empty for everyone else) ----
    reporter: PersonBrief | None
    received_by_name: str | None
    custody_events: list[CustodyEventOut]
    can_receive: bool
    can_transfer: bool
    can_dispose: bool
