from pydantic import BaseModel, EmailStr


class GuardAssignIn(BaseModel):
    email: EmailStr
    office_id: int | None = None  # where they usually work (optional)


class GuardOfficeIn(BaseModel):
    office_id: int | None
