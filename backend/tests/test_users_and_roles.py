"""Tests for onboarding, profile editing, and role permissions."""

from app.models import UserRole

STUDENT = "riya@iitk.ac.in"
PROFILE = {
    "full_name": "  Riya   Sharma ",
    "roll_number": "220981",
    "phone": "98765 43210",
    "hall": "Hall 5",
    "room": "B-204",
}


def test_onboarding_saves_and_tidies_the_profile(sign_in):
    client = sign_in(STUDENT)
    response = client.post("/users/me/onboarding", json=PROFILE)
    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Riya Sharma"
    assert body["phone"] == "+919876543210"
    assert body["is_onboarded"] is True


def test_students_must_give_a_roll_number(sign_in):
    client = sign_in(STUDENT)
    response = client.post("/users/me/onboarding", json={**PROFILE, "roll_number": ""})
    assert response.status_code == 400


def test_invalid_phone_is_rejected(sign_in):
    client = sign_in(STUDENT)
    response = client.post("/users/me/onboarding", json={**PROFILE, "phone": "12345"})
    assert response.status_code == 422


def test_roll_number_must_be_unique(sign_in):
    sign_in(STUDENT).post("/users/me/onboarding", json=PROFILE)
    other = sign_in("aman@iitk.ac.in")
    response = other.post("/users/me/onboarding", json={**PROFILE, "full_name": "Aman"})
    assert response.status_code == 409


def test_onboarding_only_once(sign_in):
    client = sign_in(STUDENT)
    client.post("/users/me/onboarding", json=PROFILE)
    again = client.post("/users/me/onboarding", json={**PROFILE, "full_name": "Someone Else"})
    assert again.status_code == 400


def test_phone_hall_room_editable_but_name_and_roll_locked(sign_in):
    client = sign_in(STUDENT)
    client.post("/users/me/onboarding", json=PROFILE)

    updated = client.patch("/users/me", json={"room": "C-101"})
    assert updated.status_code == 200
    assert updated.json()["room"] == "C-101"
    assert updated.json()["hall"] == "Hall 5"  # untouched fields stay

    assert client.patch("/users/me", json={"full_name": "Fake"}).status_code == 422
    assert client.patch("/users/me", json={"roll_number": "999999"}).status_code == 422


def test_staff_onboard_without_roll_number(sign_in, make_user):
    make_user("guard1@iitk.ac.in", role=UserRole.GUARD)
    client = sign_in("guard1@iitk.ac.in")
    response = client.post("/users/me/onboarding", json={"full_name": "Ramesh Kumar"})
    assert response.status_code == 200
    assert response.json()["is_onboarded"] is True


def test_reference_lists_need_sign_in(make_client, sign_in):
    assert make_client().get("/offices").status_code == 401
    assert sign_in(STUDENT).get("/categories").status_code == 200


# ---------------- Admin and guard management ----------------

def signed_in_admin(sign_in, make_user):
    make_user("admin@iitk.ac.in", role=UserRole.ADMIN, full_name="Admin")
    return sign_in("admin@iitk.ac.in")


def test_students_cannot_use_admin_endpoints(sign_in):
    client = sign_in(STUDENT)
    client.post("/users/me/onboarding", json=PROFILE)
    assert client.get("/admin/guards").status_code == 403


def test_not_onboarded_admin_must_finish_profile_first(sign_in, make_user):
    make_user("admin@iitk.ac.in", role=UserRole.ADMIN)  # no name yet
    client = sign_in("admin@iitk.ac.in")
    response = client.get("/admin/guards")
    assert response.status_code == 403
    assert "profile" in response.json()["detail"]


def test_admin_assigns_and_removes_a_guard(sign_in, make_user):
    admin = signed_in_admin(sign_in, make_user)

    # The guard has never signed in: their account is created now.
    created = admin.post("/admin/guards", json={"email": "guard1@iitk.ac.in"})
    assert created.status_code == 201
    guard_id = created.json()["id"]
    assert created.json()["role"] == "GUARD"
    assert [g["id"] for g in admin.get("/admin/guards").json()] == [guard_id]

    # The guard signs in and is a guard from the start.
    guard = sign_in("guard1@iitk.ac.in")
    guard.post("/users/me/onboarding", json={"full_name": "Ramesh Kumar"})
    assert guard.get("/auth/me").json()["role"] == "GUARD"
    # Guards don't have the admin's extra power.
    assert guard.get("/admin/guards").status_code == 403

    # Removing takes effect immediately, even while they're signed in.
    removed = admin.delete(f"/admin/guards/{guard_id}")
    assert removed.json()["role"] == "STUDENT"
    assert guard.get("/auth/me").json()["role"] == "STUDENT"


def test_admin_sets_a_guards_usual_office(sign_in, make_user, db):
    from sqlalchemy import select

    from app.models import Office

    office = Office(name="Test Office", location_description="x", opening_hours="x")
    db.add(office)
    db.commit()

    admin = signed_in_admin(sign_in, make_user)
    guard_id = admin.post("/admin/guards", json={"email": "guard1@iitk.ac.in"}).json()["id"]
    response = admin.patch(f"/admin/guards/{guard_id}", json={"office_id": office.id})
    assert response.json()["office"] == {"id": office.id, "name": "Test Office"}

    bad = admin.patch(f"/admin/guards/{guard_id}", json={"office_id": 999999})
    assert bad.status_code == 400
    assert db.scalar(select(Office).where(Office.id == office.id)) is not None


def test_admin_cannot_be_turned_into_a_guard(sign_in, make_user):
    admin = signed_in_admin(sign_in, make_user)
    response = admin.post("/admin/guards", json={"email": "admin@iitk.ac.in"})
    assert response.status_code == 400
