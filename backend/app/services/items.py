"""Business rules for lost and found items.

Who can see an item?
  - Items on the public pages (found items at an office, open lost reports):
    every signed-in user.
  - Anything else (a found item not yet handed in, a closed lost report...):
    only the person who reported it, and security staff.
  Everyone else gets "not found" (404), not "forbidden" (403), so the API
  doesn't even reveal that the item exists.

Who can see the secret detail of a found item?
  - Security staff, always (they use it to check claims).
  - The finder, only until a guard receives the item.
  - Nobody else, ever.
"""

import math
import re
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.clock import now, today
from app.core.config import get_settings
from app.core.errors import bad_request, forbidden, not_found
from app.models import (
    Category,
    Item,
    ItemKind,
    ItemPhoto,
    ItemStatus,
    Office,
    SecretSource,
    User,
)
from app.models.item import HELD_STATUSES, PUBLIC_STATUSES
from app.schemas.item import CloseLostIn, FoundItemIn, LostItemIn, SecretDetailIn
from app.services import matching, storage

MAX_DAYS_AGO = 365  # reports about things lost more than a year ago are refused


# ---------------- Checks shared by both report forms ----------------


def _check_common(db: Session, data: LostItemIn | FoundItemIn) -> None:
    category = db.get(Category, data.category_id)
    if category is None or not category.is_active:
        raise bad_request("Choose a category from the list.")
    if data.happened_on > today():
        raise bad_request("The date can't be in the future.")
    if data.happened_on < today() - timedelta(days=MAX_DAYS_AGO):
        raise bad_request("The date can't be more than a year ago.")


# ---------------- Reporting ----------------


def report_lost(db: Session, user: User, data: LostItemIn) -> Item:
    _check_common(db, data)
    item = Item(
        kind=ItemKind.LOST,
        status=ItemStatus.OPEN,
        reporter_id=user.id,
        **data.model_dump(),
    )
    db.add(item)
    db.commit()
    matching.notify_saved(db, item)  # let the matcher (if any) index it
    return item


def report_found(db: Session, user: User, data: FoundItemIn) -> Item:
    _check_common(db, data)
    office = db.get(Office, data.dropoff_office_id)
    if office is None or not office.is_active:
        raise bad_request("Choose an open security office.")

    item = Item(
        kind=ItemKind.FOUND,
        # Not shown publicly until a guard confirms they have it.
        status=ItemStatus.AWAITING_DROPOFF,
        reporter_id=user.id,
        secret_detail_by=SecretSource.FINDER if data.secret_detail else None,
        **data.model_dump(),
    )
    db.add(item)
    db.commit()
    matching.notify_saved(db, item)  # let the matcher (if any) index it
    return item


# ---------------- Who may see and do what ----------------


def is_public(item: Item) -> bool:
    return item.status in PUBLIC_STATUSES[item.kind]


def can_view(item: Item, user: User) -> bool:
    return is_public(item) or user.is_staff or item.reporter_id == user.id


def can_see_secret(item: Item, user: User) -> bool:
    if item.kind != ItemKind.FOUND:
        return False
    if user.is_staff:
        return True
    return item.reporter_id == user.id and item.status == ItemStatus.AWAITING_DROPOFF


def can_edit_secret(item: Item, user: User) -> bool:
    """The finder, only before drop-off. Security staff, while the item is
    waiting for drop-off or held at an office."""
    if item.kind != ItemKind.FOUND:
        return False
    if user.is_staff:
        return item.status in (ItemStatus.AWAITING_DROPOFF, *HELD_STATUSES)
    return item.status == ItemStatus.AWAITING_DROPOFF and item.reporter_id == user.id


def can_add_photos(item: Item, user: User) -> bool:
    if len(item.photos) >= get_settings().max_photos_per_item:
        return False
    if item.reporter_id == user.id:
        # The reporter can add photos while their report is still active
        # and, for found items, before a guard has taken it in.
        return item.status in (ItemStatus.OPEN, ItemStatus.AWAITING_DROPOFF)
    # Guards may photograph a found item at drop-off or while it's at an office.
    return user.is_staff and item.kind == ItemKind.FOUND and item.status in (
        ItemStatus.AWAITING_DROPOFF, *HELD_STATUSES
    )


def can_close(item: Item, user: User) -> bool:
    return item.kind == ItemKind.LOST and item.status == ItemStatus.OPEN and item.reporter_id == user.id


def get_visible_item(db: Session, item_id: int, user: User) -> Item:
    item = db.get(Item, item_id)
    if item is None or not can_view(item, user):
        raise not_found("No item with that number.")
    return item


def detail_for(db: Session, item: Item, user: User) -> dict:
    """Build the detail response. The secret detail, the reporter and the
    custody history are only copied in for people allowed to see them; for
    everyone else those fields stay empty."""
    # Imported here to avoid a circular import (those modules import this one's models).
    from app.services import claims, custody

    my_claim = claims.latest_claim_of(db, item, user)
    show_secret = can_see_secret(item, user)
    staff = user.is_staff
    return {
        **{field: getattr(item, field) for field in (
            "id", "ref", "kind", "status", "title", "description", "category",
            "colour", "brand", "location_text", "happened_on", "created_at",
            "current_office", "cover_photo_id", "dropoff_office", "received_at",
            "returned_at",
        )},
        "current_office_full": item.current_office,
        "photo_ids": [photo.id for photo in item.photos],
        "secret_detail": item.secret_detail if show_secret else None,
        "secret_detail_by": item.secret_detail_by if show_secret else None,
        "is_mine": item.reporter_id == user.id,
        "can_add_photos": can_add_photos(item, user),
        "can_edit_secret": can_edit_secret(item, user),
        "can_close": can_close(item, user),
        "can_see_similar": matching.can_see_similar(item, user),
        # ---- Claims ----
        "can_claim": claims.can_claim(db, item, user),
        "my_claim": my_claim,
        # ---- Staff only ----
        "reporter": item.reporter if staff else None,
        "received_by_name": item.received_by.full_name if staff and item.received_by else None,
        "custody_events": custody.history(item) if staff else [],
        "can_receive": custody.can_receive(item, user),
        "can_transfer": custody.can_transfer(item, user),
        "can_dispose": custody.can_dispose(item, user),
        "claims": claims.claims_on_item(db, item) if staff else [],
    }


# ---------------- Changes after reporting ----------------


def update_secret(db: Session, item: Item, user: User, data: SecretDetailIn) -> Item:
    if not can_edit_secret(item, user):
        raise forbidden("The secret detail can only be changed by the finder before drop-off, or by security staff.")
    if not data.secret_detail and item.status in HELD_STATUSES:
        # Items at an office always need one: it's how claims are checked.
        raise bad_request("An item held at an office must keep a secret identifying detail.")
    item.secret_detail = data.secret_detail
    if not data.secret_detail:
        item.secret_detail_by = None
    else:
        item.secret_detail_by = SecretSource.GUARD if user.is_staff else SecretSource.FINDER
    db.commit()
    return item


def close_lost(db: Session, item: Item, user: User, data: CloseLostIn) -> Item:
    if not can_close(item, user):
        raise forbidden("Only the person who reported it can close an open lost report.")
    item.status = ItemStatus(data.outcome)
    db.commit()
    return item


def add_photo(db: Session, item: Item, user: User, data: bytes, content_type: str, extension: str) -> ItemPhoto:
    if not can_add_photos(item, user):
        if len(item.photos) >= get_settings().max_photos_per_item:
            raise bad_request(f"An item can have at most {get_settings().max_photos_per_item} photos.")
        raise forbidden("You can't add photos to this item now.")

    stored_name = storage.save(data, extension)
    photo = ItemPhoto(
        item_id=item.id,
        stored_name=stored_name,
        content_type=content_type,
        size_bytes=len(data),
        uploaded_by_id=user.id,
    )
    db.add(photo)
    try:
        db.commit()
    except Exception:
        storage.delete(stored_name)  # don't leave an orphan file behind
        raise
    db.refresh(item)
    matching.notify_saved(db, item)  # a new photo can change what it matches
    return photo


# ---------------- Listing with filters and pages ----------------


# A word, optionally starting with "-" to exclude it. Only letters and digits
# are kept, so nothing the user types can break the query syntax.
_SEARCH_WORD = re.compile(r"(-?)([^\W_]+)")
MIN_PREFIX_LENGTH = 2


def build_search_query(text: str) -> str | None:
    """Turn what the user typed into a PostgreSQL search query.

    "sci calc -broken"  ->  "sci:* & calc:* & !broken"

    - Each word matches as a prefix (":*"), so "sci" finds "scientific".
    - All words must match ("&").
    - "-word" excludes items containing that word ("!").
    - Single letters are skipped: "a:*" would match almost everything.
    Returns None if nothing usable was typed.
    """
    parts = []
    for minus, word in _SEARCH_WORD.findall(text.lower()):
        if len(word) < MIN_PREFIX_LENGTH:
            continue
        parts.append(f"!{word}" if minus else f"{word}:*")
    return " & ".join(parts) or None


def list_public(
    db: Session,
    kind: ItemKind,
    category_slug: str | None,
    search: str | None,
    page: int,
    page_size: int,
) -> dict:
    """One page of the Found or Lost page.

    1. Build the filters (kind, public statuses, category, search words).
    2. Count every matching item, so the page knows how many pages exist.
    3. Fetch only this page's rows: ORDER BY newest, then OFFSET/LIMIT.
    Both queries use the same filters, so the count always matches.
    """
    filters = [Item.kind == kind, Item.status.in_(PUBLIC_STATUSES[kind])]

    if category_slug:
        category_id = db.scalar(select(Category.id).where(Category.slug == category_slug))
        if category_id is None:
            return _page([], 0, page, page_size)  # unknown category: nothing matches
        filters.append(Item.category_id == category_id)

    tsquery = build_search_query(search) if search else None
    if tsquery:
        # @@ means "does the item's text match the query". to_tsquery also
        # removes word endings, so "calculators" still finds "calculator".
        filters.append(Item.search_vector.op("@@")(func.to_tsquery("english", tsquery)))

    total = db.scalar(select(func.count()).select_from(Item).where(*filters))

    rows = db.scalars(
        select(Item)
        .where(*filters)
        # id breaks ties, so two items created at the same moment never swap
        # places between pages.
        .order_by(Item.created_at.desc(), Item.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        # Load photos, categories and offices for all rows in a few queries,
        # instead of one extra query per item (the "N+1 problem").
        .options(
            selectinload(Item.photos),
            selectinload(Item.category),
            selectinload(Item.current_office),
        )
    ).all()
    return _page(list(rows), total, page, page_size)


def list_mine(db: Session, user: User, page: int, page_size: int) -> dict:
    filters = [Item.reporter_id == user.id]
    total = db.scalar(select(func.count()).select_from(Item).where(*filters))
    rows = db.scalars(
        select(Item)
        .where(*filters)
        .order_by(Item.created_at.desc(), Item.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .options(selectinload(Item.photos), selectinload(Item.category), selectinload(Item.current_office))
    ).all()
    return _page(list(rows), total, page, page_size)


def _page(items: list[Item], total: int, page: int, page_size: int) -> dict:
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total else 0,
    }
