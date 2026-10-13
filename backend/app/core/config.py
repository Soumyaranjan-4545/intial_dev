"""App settings, read from environment variables or the backend/.env file.

Keeping settings here (instead of hard-coding them in the code) means:
- passwords never appear in the source code or on GitHub,
- each team member and the deployed server can use different values
  without changing any code.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
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

    # ---- Database ----
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "lostfound"
    db_user: str = "lostfound"
    db_password: str  # no default: the app refuses to start without it

    # ---- Security ----
    # min_length: refuse to start with a short, guessable secret.
    secret_key: str = Field(min_length=32)
    session_days: int = 30
    cookie_secure: bool = False
    session_cookie_name: str = "lf_session"

    # Login codes
    login_code_minutes: int = 10  # a code expires after this long
    login_code_max_attempts: int = 5  # wrong guesses allowed per code
    login_code_resend_seconds: int = 60  # wait between code requests
    login_code_max_per_hour: int = 5  # codes one email can request per hour

    # ---- App rules ----
    allowed_email_domain: str = "iitk.ac.in"
    frontend_origin: str = "http://localhost:3000"
    # Dates like "found on" are in campus time, not the server's own zone.
    timezone: str = "Asia/Kolkata"

    # ---- Item photos ----
    upload_dir: Path = BACKEND_DIR / "uploads"
    max_photos_per_item: int = 3
    max_photo_mb: int = 5

    # ---- Email ----
    email_backend: Literal["console", "smtp"] = "console"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = ""

    # ---- Similar items (AI matching, see docs/MATCHING.md) ----
    # "placeholder" = matching switched off. A teammate's matcher registers
    # its own name in app/services/matching.py.
    matching_backend: str = "placeholder"

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
