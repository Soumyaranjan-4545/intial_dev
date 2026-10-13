"""Sending emails.

EMAIL_BACKEND=console (default): the email is printed in the terminal
running the API, so you can develop without any mail account.
EMAIL_BACKEND=smtp: the email is really sent through an SMTP server
(for example a Gmail account with an app password, or the college server).
"""

import smtplib
from email.message import EmailMessage

from app.core.config import get_settings


def send_email(to: str, subject: str, body: str) -> None:
    settings = get_settings()

    if settings.email_backend == "console":
        print(
            "\n" + "=" * 60
            + f"\nEMAIL to: {to}\nSubject: {subject}\n\n{body}\n"
            + "=" * 60 + "\n",
            flush=True,
        )
        return

    message = EmailMessage()
    message["From"] = settings.email_from or settings.smtp_user
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    # timeout: don't let a slow mail server freeze the request forever.
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        server.starttls()  # encrypt the connection before logging in
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)


def send_login_code(to: str, code: str, minutes_valid: int) -> None:
    send_email(
        to=to,
        subject=f"{code} is your IITK Lost & Found sign-in code",
        body=(
            f"Your sign-in code is: {code}\n\n"
            f"It expires in {minutes_valid} minutes and can be used once.\n"
            "If you didn't try to sign in, you can ignore this email."
        ),
    )
