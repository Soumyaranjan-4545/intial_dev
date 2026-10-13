"""Tests for reporting items, who can see them, the secret detail,
filters, pagination and photos."""

import io
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.clock import today
from app.core.config import get_settings
from app.models import Category, Item, ItemStatus, Office, User, UserRole
from app.schemas.staff import ReceiveIn
from app.services import custody
from app.services import items as items_service

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200


# ---------------- Fixtures ----------------


@pytest.fixture
def place(db):
    """A category and an office of our own, so tests don't depend on seed data."""
    bags = Category(name="Test Bags", slug="test-bags", sort_order=1)
    keys = Category(name="Test Keys", slug="test-keys", sort_order=2)
    office = Office(name="Test Office", location_description="Near the gate", opening_hours="24 hours")
    db.add_all([bags, keys, office])
    db.commit()
    return {"bags": bags.id, "keys": keys.id, "office": office.id}


@pytest.fixture
def person(make_user, sign_in):
    """A signed-in user who has completed their profile."""
    count = {"n": 0}

    def _person(role=UserRole.STUDENT):
        count["n"] += 1
        email = f"person{count['n']}@iitk.ac.in"
        extra = {} if role != UserRole.STUDENT else {"roll_number": f"ROLL{count['n']:04d}"}
        make_user(email, role=role, full_name=f"Person {count['n']}", **extra)
        return sign_in(email)

    return _person


@pytest.fixture(autouse=True)
def photo_folder(tmp_path, monkeypatch):
    """Save test photos in a temporary folder, not backend/uploads."""
    monkeypatch.setattr(get_settings(), "upload_dir", tmp_path)


def lost_body(place, **changes):
    return {
        "title": "Black backpack",
        "description": "Wildcraft backpack with a laptop sleeve.",
        "category_id": place["bags"],
        "colour": "Black",
        "location_text": "Lecture Hall Complex",
        "happened_on": str(today()),
        **changes,
    }


def found_body(place, **changes):
    return {**lost_body(place), "dropoff_office_id": place["office"], **changes}


def receive(db, item_id, secret=None):
    """A guard receives the item at the office the finder chose."""
    guard = db.scalar(select(User).where(User.email == "desk.guard@iitk.ac.in"))
    if guard is None:
        guard = User(email="desk.guard@iitk.ac.in", role=UserRole.GUARD, full_name="Desk Guard")
        db.add(guard)
        db.flush()
    item = db.get(Item, item_id)
    custody.receive_item(db, item, guard, ReceiveIn(office_id=item.dropoff_office_id, secret_detail=secret))


# ---------------- Reporting ----------------


def test_report_lost_item(person, place):
    response = person().post("/items/lost", json=lost_body(place, title="  Black   backpack "))
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "OPEN"
    assert body["title"] == "Black backpack"  # extra spaces tidied
    assert body["ref"].startswith("LST-")
    assert body["is_mine"] and body["can_close"]


def test_report_found_item_waits_for_dropoff(person, place):
    body = person().post("/items/found", json=found_body(place, secret_detail="Red keychain")).json()
    assert body["status"] == "AWAITING_DROPOFF"
    assert body["ref"].startswith("FND-")
    assert body["dropoff_office"]["name"] == "Test Office"
    assert body["current_office"] is None


def test_report_needs_completed_profile(sign_in, place):
    client = sign_in("new@iitk.ac.in")  # signed in, but not onboarded
    assert client.post("/items/lost", json=lost_body(place)).status_code == 403


@pytest.mark.parametrize(
    "changes, message",
    [
        ({"happened_on": str(today() + timedelta(days=1))}, "future"),
        ({"happened_on": str(today() - timedelta(days=400))}, "a year"),
        ({"category_id": 999999}, "category"),
    ],
)
def test_report_rejects_bad_values(person, place, changes, message):
    response = person().post("/items/lost", json=lost_body(place, **changes))
    assert response.status_code == 400
    assert message in response.json()["detail"]


def test_report_rejects_short_description(person, place):
    assert person().post("/items/lost", json=lost_body(place, description="bag")).status_code == 422


def test_found_needs_a_real_office(person, place):
    response = person().post("/items/found", json=found_body(place, dropoff_office_id=999999))
    assert response.status_code == 400


# ---------------- Who can see what ----------------


def test_found_item_hidden_until_received(person, place, db):
    finder, other = person(), person()
    item_id = finder.post("/items/found", json=found_body(place, secret_detail="Red keychain")).json()["id"]

    # Before drop-off: not on the Found page, and other students get 404.
    assert other.get("/items", params={"kind": "FOUND"}).json()["total"] == 0
    assert other.get(f"/items/{item_id}").status_code == 404
    # The finder can still see their own report.
    assert finder.get(f"/items/{item_id}").status_code == 200

    receive(db, item_id)
    page = other.get("/items", params={"kind": "FOUND"}).json()
    assert [i["id"] for i in page["items"]] == [item_id]
    assert page["items"][0]["current_office"]["name"] == "Test Office"


def test_secret_detail_visibility(person, place, db):
    finder, other, guard = person(), person(), person(UserRole.GUARD)
    item_id = finder.post("/items/found", json=found_body(place, secret_detail="Red keychain")).json()["id"]

    # Before drop-off: the finder sees and can edit it.
    mine = finder.get(f"/items/{item_id}").json()
    assert mine["secret_detail"] == "Red keychain" and mine["can_edit_secret"]

    receive(db, item_id)
    # After drop-off: hidden from the finder and other students, shown to guards.
    assert finder.get(f"/items/{item_id}").json()["secret_detail"] is None
    assert other.get(f"/items/{item_id}").json()["secret_detail"] is None
    assert guard.get(f"/items/{item_id}").json()["secret_detail"] == "Red keychain"
    # Lists never include it, for anyone.
    card = guard.get("/items", params={"kind": "FOUND"}).json()["items"][0]
    assert "secret_detail" not in card


def test_finder_edits_secret_only_before_dropoff(person, place, db):
    finder = person()
    item_id = finder.post("/items/found", json=found_body(place)).json()["id"]
    updated = finder.put(f"/items/{item_id}/secret-detail", json={"secret_detail": "Scratch on the lid"})
    assert updated.json()["secret_detail"] == "Scratch on the lid"

    receive(db, item_id)
    assert finder.put(f"/items/{item_id}/secret-detail", json={"secret_detail": "x"}).status_code == 403


def test_receiving_requires_a_secret_detail(person, place, db):
    item_id = person().post("/items/found", json=found_body(place)).json()["id"]
    with pytest.raises(Exception, match="secret"):
        receive(db, item_id)
    receive(db, item_id, secret="Guard noted: sticker under the base")
    assert db.get(Item, item_id).secret_detail_by == "GUARD"


def test_close_lost_report(person, place):
    owner, other = person(), person()
    item_id = owner.post("/items/lost", json=lost_body(place)).json()["id"]

    assert other.post(f"/items/{item_id}/close", json={"outcome": "RECOVERED"}).status_code == 403
    closed = owner.post(f"/items/{item_id}/close", json={"outcome": "RECOVERED"})
    assert closed.json()["status"] == "RECOVERED"
    # Closed reports leave the Lost page and are hidden from others.
    assert other.get("/items", params={"kind": "LOST"}).json()["total"] == 0
    assert other.get(f"/items/{item_id}").status_code == 404
    assert owner.get("/items/mine").json()["total"] == 1


def test_database_rejects_status_from_the_other_kind(person, place, db):
    item_id = person().post("/items/lost", json=lost_body(place)).json()["id"]
    item = db.get(Item, item_id)
    item.status = ItemStatus.RETURNED  # a found-item status on a lost item
    with pytest.raises(Exception, match="status_matches_kind"):
        db.flush()


# ---------------- Filters and pages ----------------


def test_pagination(person, place):
    reporter = person()
    for n in range(7):
        reporter.post("/items/lost", json=lost_body(place, title=f"Item number {n}"))

    first = reporter.get("/items", params={"kind": "LOST", "page_size": 3}).json()
    assert first["total"] == 7 and first["total_pages"] == 3 and first["page"] == 1
    # Newest first: the last one reported comes first.
    assert [i["title"] for i in first["items"]] == ["Item number 6", "Item number 5", "Item number 4"]

    last = reporter.get("/items", params={"kind": "LOST", "page_size": 3, "page": 3}).json()
    assert [i["title"] for i in last["items"]] == ["Item number 0"]

    past_end = reporter.get("/items", params={"kind": "LOST", "page_size": 3, "page": 9}).json()
    assert past_end["items"] == [] and past_end["total"] == 7


def test_pagination_limits(person):
    client = person()
    assert client.get("/items", params={"kind": "LOST", "page": 0}).status_code == 422
    assert client.get("/items", params={"kind": "LOST", "page_size": 500}).status_code == 422
    assert client.get("/items", params={"kind": "SOMETHING"}).status_code == 422


def test_category_filter_and_counts(person, place):
    reporter = person()
    reporter.post("/items/lost", json=lost_body(place))
    reporter.post("/items/lost", json=lost_body(place, title="House keys", category_id=place["keys"]))

    keys = reporter.get("/items", params={"kind": "LOST", "category": "test-keys"}).json()
    assert keys["total"] == 1 and keys["items"][0]["title"] == "House keys"
    unknown = reporter.get("/items", params={"kind": "LOST", "category": "no-such-thing"}).json()
    assert unknown["total"] == 0


def test_search_matches_word_forms(person, place):
    reporter = person()
    reporter.post("/items/lost", json=lost_body(place, title="Brown leather wallet",
                                                 description="Has two bank cards inside."))
    reporter.post("/items/lost", json=lost_body(place))

    def titles(q):
        return [i["title"] for i in reporter.get("/items", params={"kind": "LOST", "q": q}).json()["items"]]

    assert titles("wallets") == ["Brown leather wallet"]  # plural finds singular
    assert titles("wal") == ["Brown leather wallet"]  # start of a word
    assert titles("BROWN Wall") == ["Brown leather wallet"]  # any case, several words
    assert titles("brown backpack") == []  # every word must match
    assert titles("card") == ["Brown leather wallet"]  # matches the description
    assert titles("wallet -leather") == []  # excluded word
    assert titles("backpack") == ["Black backpack"]


def test_search_query_building():
    build = items_service.build_search_query
    assert build("sci calc") == "sci:* & calc:*"
    assert build("wallet -leather") == "wallet:* & !leather"
    assert build("a b") is None  # single letters only: no search
    # Symbols that mean something to PostgreSQL are dropped, so they can't break the query.
    assert build("bag's & (red) | :*") == "bag:* & red:*"
    assert build("  ") is None


def test_search_with_only_symbols_shows_everything(person, place):
    reporter = person()
    reporter.post("/items/lost", json=lost_body(place))
    assert reporter.get("/items", params={"kind": "LOST", "q": "&|!"}).json()["total"] == 1


# ---------------- Photos ----------------


def upload(client, item_id, data, name="photo.jpg"):
    return client.post(f"/items/{item_id}/photos", files={"file": (name, io.BytesIO(data), "image/jpeg")})


def test_photo_upload_and_download(person, place):
    owner = person()
    item_id = owner.post("/items/lost", json=lost_body(place)).json()["id"]
    response = upload(owner, item_id, JPEG)
    assert response.status_code == 201
    photo_id = response.json()["photo_ids"][0]

    photo = owner.get(f"/items/{item_id}/photos/{photo_id}")
    assert photo.status_code == 200
    assert photo.headers["content-type"] == "image/jpeg"
    assert photo.content == JPEG
    # The list shows it as the cover photo.
    assert owner.get("/items", params={"kind": "LOST"}).json()["items"][0]["cover_photo_id"] == photo_id


def test_fake_image_is_rejected(person, place):
    owner = person()
    item_id = owner.post("/items/lost", json=lost_body(place)).json()["id"]
    # A text file renamed to .jpg is refused: we check the bytes, not the name.
    response = upload(owner, item_id, b"MZ this is not an image", name="virus.jpg")
    assert response.status_code == 400
    assert "JPEG, PNG or WebP" in response.json()["detail"]


def test_photo_size_and_count_limits(person, place, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_photo_mb", 1)
    owner = person()
    item_id = owner.post("/items/lost", json=lost_body(place)).json()["id"]

    too_big = JPEG + b"\x00" * (1024 * 1024)
    assert upload(owner, item_id, too_big).status_code == 400

    for _ in range(3):
        assert upload(owner, item_id, PNG).status_code == 201
    fourth = upload(owner, item_id, PNG)
    assert fourth.status_code == 400
    assert "at most 3" in fourth.json()["detail"]


def test_only_the_reporter_adds_photos(person, place):
    owner, other = person(), person()
    item_id = owner.post("/items/lost", json=lost_body(place)).json()["id"]
    assert upload(other, item_id, JPEG).status_code == 403


def test_photos_of_hidden_items_are_hidden(person, place):
    finder, other = person(), person()
    item_id = finder.post("/items/found", json=found_body(place, secret_detail="x")).json()["id"]
    photo_id = upload(finder, item_id, JPEG).json()["photo_ids"][0]
    assert other.get(f"/items/{item_id}/photos/{photo_id}").status_code == 404


def test_receiving_moves_item_to_dropoff_office(person, place, db):
    item_id = person().post("/items/found", json=found_body(place, secret_detail="x")).json()["id"]
    receive(db, item_id)
    item = db.scalar(select(Item).where(Item.id == item_id))
    assert item.status == ItemStatus.IN_CUSTODY
    assert item.current_office_id == place["office"]
    assert item.received_at is not None
