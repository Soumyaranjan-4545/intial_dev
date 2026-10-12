"""App settings, read from environment variables or the backend/.env file.

Keeping settings here (instead of hard-coding them in the code) means:
- passwords never appear in the source code or on GitHub,
- each team member and the deployed server can use different values
  without changing any code.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

# backend/  (this file is backend/app/core/config.py, so go up three levels)
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Absolute path, so it works no matter which folder you run commands from.
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database connection details
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "lostfound"
    db_user: str = "lostfound"
    db_password: str  # no default: the app refuses to start without it

    # App rules
    allowed_email_domain: str = "iitk.ac.in"
    frontend_origin: str = "http://localhost:3000"

    @property
    def database_url(self) -> URL:
        """Build the connection URL from the parts above.

        URL.create escapes special characters in the password
        (like @ or #), which would break a hand-written URL string.
        "postgresql+psycopg" means: PostgreSQL, using the psycopg 3 driver.
        """
        return URL.create(
            drivername="postgresql+psycopg",
            username=self.db_user,
            password=self.db_password,
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )


@lru_cache
def get_settings() -> Settings:
    """Read the settings once and reuse them (lru_cache remembers the result)."""
    return Settings()
