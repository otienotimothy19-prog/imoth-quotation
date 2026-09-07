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


def create_access_token(subject: str, role: str, expires_minutes: int | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": subject, "role": role, "exp": expire, "type": "access"}
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
