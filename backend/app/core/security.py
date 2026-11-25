import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

# bcrypt's algorithm only uses the first 72 bytes of the input; truncate
# explicitly rather than relying on a library to do it (bcrypt>=5 raises
# instead of silently truncating).
_BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    pw_bytes = password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    pw_bytes = plain_password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    try:
        return bcrypt.checkpw(pw_bytes, password_hash.encode("utf-8"))
    except ValueError:
        return False


def password_problem(password: str, *, email: str | None = None) -> str | None:
    """Returns why a new password is too weak, or None if it's acceptable."""
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "Password must contain both letters and numbers."
    if email and password.lower() == email.lower():
        return "Password must not be the same as your email."
    if password.lower() in {"password1", "12345678a", "changeme123!", "imoth123", "qwerty123"}:
        return "That password is too common. Please choose another."
    return None


def generate_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp_code(challenge_id: str, code: str) -> str:
    """Keyed hash so a leaked database row can't be brute-forced offline
    without the server secret."""
    return hmac.new(settings.SECRET_KEY.encode(), f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()


def otp_code_matches(challenge_id: str, code: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_otp_code(challenge_id, code), code_hash)


def create_access_token(
    subject: str, role: str, expires_minutes: int | None = None, token_version: int | None = None
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": subject, "role": role, "exp": expire, "type": "access"}
    if token_version is not None:
        payload["tv"] = token_version
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


# Short-lived, anonymous tokens proving possession of a specific
# QuoteSelection (pre-personal-info) or Quotation (post-personal-info) from
# the client quotation flow. Reuses the exact same JWT machinery/secret as
# the admin access token above, distinguished only by `role` -- never
# equal to a real UserRole value, so it can never satisfy require_admin/
# require_roles(...) checks.
QUOTE_ACCESS_ROLE = "quote_access"


def create_quote_access_token(subject: str, expires_minutes: int) -> str:
    return create_access_token(subject=subject, role=QUOTE_ACCESS_ROLE, expires_minutes=expires_minutes)


def decode_quote_access_token(token: str) -> str | None:
    payload = decode_access_token(token)
    if not payload or payload.get("role") != QUOTE_ACCESS_ROLE:
        return None
    return payload.get("sub")
