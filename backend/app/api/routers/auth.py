from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.limiter import limiter
from app.core.config import settings
from app.core.security import create_access_token, verify_password
from app.database import get_db
from app.api.deps import get_client_ip, get_current_user
from app.models.enums import ActorType
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut
from app.services import audit_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        audit_service.record(
            db,
            actor_type=ActorType.ADMIN,
            actor_label=payload.email,
            action="admin_login_failed",
            entity_type="user",
            entity_id=str(user.id) if user else None,
            ip_address=get_client_ip(request),
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    user.last_login_at = datetime.now(timezone.utc)
    token = create_access_token(subject=str(user.id), role=user.role.value)

    audit_service.record(
        db,
        actor_type=ActorType.ADMIN,
        actor_label=user.email,
        actor_id=user.id,
        action="admin_login",
        entity_type="user",
        entity_id=str(user.id),
        ip_address=get_client_ip(request),
    )
    db.commit()

    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # JWTs are stateless/short-lived; logout is recorded for audit purposes and
    # the frontend discards the token. (A denylist can be added here later if
    # immediate server-side revocation becomes a requirement.)
    audit_service.record(
        db,
        actor_type=ActorType.ADMIN,
        actor_label=user.email,
        actor_id=user.id,
        action="admin_logout",
        entity_type="user",
        entity_id=str(user.id),
        ip_address=get_client_ip(request),
    )
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)
