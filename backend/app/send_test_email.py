"""Send one test email with the configured SMTP settings.

    python -m app.send_test_email you@example.com

Use it after setting the Zoho password to confirm login codes will arrive."""
import sys

from app.core.config import settings
from app.services.email_service import _send_smtp


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python -m app.send_test_email you@example.com")
        return 2
    to_email = sys.argv[1]
    print(f"Sending via {settings.SMTP_HOST}:{settings.SMTP_PORT} as {settings.SMTP_USERNAME} -> {to_email}")
    try:
        _send_smtp(
            to_email=to_email,
            subject="Imoth system test email",
            body="This is a test from the Imoth quotation system. Email sending works.",
            attachments=[],
        )
    except Exception as exc:  # show the SMTP server's own reason
        print(f"FAILED: {type(exc).__name__}: {exc}")
        return 1
    print("Sent. Check the inbox (and spam folder).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
