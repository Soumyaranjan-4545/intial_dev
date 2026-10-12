"""Importing every model here registers its table on Base.metadata.
Alembic imports this package to discover all tables, so every new
model file must be added to this list."""

from app.models.base import Base
from app.models.category import Category
from app.models.office import Office
from app.models.user import User, UserRole

__all__ = ["Base", "Category", "Office", "User", "UserRole"]
