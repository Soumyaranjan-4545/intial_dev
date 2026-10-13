"""Command-line tools for the person running the server.

Make someone the admin (from the backend folder):
    python -m app.cli make-admin someone@iitk.ac.in

There's no API endpoint for this on purpose: nobody can become admin
through the website. Only someone with access to the server can do it.
"""

import argparse

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.errors import AppError
from app.models import User, UserRole
from app.services.auth import check_allowed_domain, normalize_email


def make_admin(raw_email: str) -> None:
    email = normalize_email(raw_email)
    check_allowed_domain(email)
    with SessionLocal() as db, db.begin():
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email)
            db.add(user)
        user.role = UserRole.ADMIN
    print(f"{email} is now the admin. They can sign in with that email.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    admin_cmd = commands.add_parser("make-admin", help="give a user the admin role")
    admin_cmd.add_argument("email")
    args = parser.parse_args()

    try:
        if args.command == "make-admin":
            make_admin(args.email)
    except AppError as error:
        raise SystemExit(f"Error: {error.message}")


if __name__ == "__main__":
    main()
