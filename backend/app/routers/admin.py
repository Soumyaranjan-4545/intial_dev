"""Admin-only endpoints: managing guards. Every endpoint here requires
AdminUser, so guards and students get 403."""

from fastapi import APIRouter, status

from app.core.deps import AdminUser, DbSession
from app.schemas.admin import GuardAssignIn, GuardOfficeIn
from app.schemas.user import UserOut
from app.services import admin as admin_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/guards", response_model=list[UserOut])
def list_guards(admin: AdminUser, db: DbSession):
    return admin_service.list_guards(db)


@router.post("/guards", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def assign_guard(data: GuardAssignIn, admin: AdminUser, db: DbSession):
    """Make a user a guard (creates the account if they've never signed in)."""
    return admin_service.assign_guard(db, data.email, data.office_id)


@router.patch("/guards/{user_id}", response_model=UserOut)
def change_guard_office(user_id: int, data: GuardOfficeIn, admin: AdminUser, db: DbSession):
    return admin_service.change_guard_office(db, user_id, data.office_id)


@router.delete("/guards/{user_id}", response_model=UserOut)
def remove_guard(user_id: int, admin: AdminUser, db: DbSession):
    """Turn a guard back into a student. Takes effect immediately."""
    return admin_service.remove_guard(db, user_id)
