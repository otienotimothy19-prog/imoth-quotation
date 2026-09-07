import uuid

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token, decode_quote_access_token
from app.database import get_db
from app.models.enums import UserRole
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_access_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return user


def require_roles(*roles: UserRole):
    def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _checker


require_admin = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
require_super_admin = require_roles(UserRole.SUPER_ADMIN)
require_any_staff = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)


def get_quote_access_subject(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """Returns the QuoteSelection/Quotation id a short-lived anonymous
    quote-access token was issued for. Route handlers must compare this
    against the id in the request path themselves (raising 403 on
    mismatch, via `require_quote_subject_match` below) -- this dependency
    only proves the token is valid, not which resource it's for."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid access token")
    subject = decode_quote_access_token(credentials.credentials)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid access token")
    return subject


def require_quote_subject_match(granted_subject: str, resource_id) -> None:
    """Raises 403 unless the token's subject matches the resource being
    accessed (usually the {quotation_id}/{selection_id} path parameter) --
    this is what prevents one customer from reaching another customer's
    selection/quotation with a validly-signed but wrong token."""
    if granted_subject != str(resource_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This access token does not match this quotation")
