"""Guard management: the admin's one extra power.

A guard is simply a user whose role is GUARD. Guards can work at every
office; their office_id only records where they usually sit.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import bad_request, not_found
from app.models import Office, User, UserRole
from app.services.auth import check_allowed_domain, normalize_email


def list_guards(db: Session) -> list[User]:
    return list(
        db.scalars(
            select(User).where(User.role == UserRole.GUARD).order_by(User.full_name, User.email)
        )
    )


def _check_office(db: Session, office_id: int | None) -> None:
    if office_id is not None:
        office = db.get(Office, office_id)
        if office is None or not office.is_active:
            raise bad_request("That office doesn't exist or is closed.")


def assign_guard(db: Session, raw_email: str, office_id: int | None) -> User:
    """Make someone a guard. If they've never signed in, their account is
    created now; they'll be a guard from their first sign-in."""
    email = normalize_email(raw_email)
    check_allowed_domain(email)
    _check_office(db, office_id)

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email)
        db.add(user)
    elif user.role == UserRole.ADMIN:
        raise bad_request("This person is the admin, who already has every guard power.")

    user.role = UserRole.GUARD
    user.office_id = office_id
    db.commit()
    return user


def _get_guard(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None or user.role != UserRole.GUARD:
        raise not_found("No guard with that id.")
    return user


def change_guard_office(db: Session, user_id: int, office_id: int | None) -> User:
    guard = _get_guard(db, user_id)
    _check_office(db, office_id)
    guard.office_id = office_id
    db.commit()
    return guard


def remove_guard(db: Session, user_id: int) -> User:
    """Turn a guard back into a student. Their role is read from the
    database on every request, so this takes effect immediately, even
    while they're signed in."""
    guard = _get_guard(db, user_id)
    guard.role = UserRole.STUDENT
    guard.office_id = None
    db.commit()
    return guard
