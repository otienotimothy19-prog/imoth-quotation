import uuid

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.client_ip import client_ip
from app.core.security import decode_access_token, decode_quote_access_token
from app.database import get_db
from app.models.enums import UserRole
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_client_ip(request: Request) -> str | None:
    return client_ip(request)


def get_current_user_any_state(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Authenticated user, even one who still has to change a temporary
    password. Only the auth endpoints (me / change-password / logout) use
    this directly; everything else goes through get_current_user."""
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

    # Tokens issued before a password change / "sign out everywhere" no
    # longer match the user's current token_version.
    if payload.get("tv", 0) != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session has ended. Please log in again.")

    return user


PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED"


def get_current_user(user: User = Depends(get_current_user_any_state)) -> User:
    if user.must_change_password:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PASSWORD_CHANGE_REQUIRED)
    return user


def require_roles(*roles: UserRole):
    def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _checker


require_admin = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
require_super_admin = require_roles(UserRole.SUPER_ADMIN)
# Everyone who may generate quotations (and read the insurer/class lists
# needed to do so). Agents are included but only ever see their own
# quotations -- see the ownership checks in admin_quotations/agent routers.
require_any_staff = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF, UserRole.AGENT)
require_agent = require_roles(UserRole.AGENT)


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
