"""Login and account security.

Login is two steps for everyone (admins, staff and agents):
  1. POST /login with email + password. If correct, a 6-digit code is
     emailed and a challenge id is returned (no session yet).
  2. POST /verify-otp with the challenge id + code. Only then is a session
     token issued.

Wrong passwords and wrong codes both count towards an account lockout
(LOGIN_MAX_FAILED_ATTEMPTS in a row -> locked for LOGIN_LOCKOUT_MINUTES).
Every token carries the user's token_version; bumping it (password change,
"sign out everywhere") ends every existing session at once.
"""
import hashlib
import logging
import math
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_client_ip, get_current_user_any_state
from app.core.config import settings
from app.core.limiter import limiter
from app.core.masking import mask_email
from app.core.security import (
    create_access_token,
    generate_otp_code,
    hash_otp_code,
    hash_password,
    otp_code_matches,
    password_problem,
    verify_password,
)
from app.database import get_db
from app.models.enums import ActorType, UserRole
from app.models.login_challenge import LoginChallenge
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.schemas.auth import (
    AgentSignupRequest,
    AgentSignupResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    OtpResendRequest,
    OtpVerifyRequest,
    ResetPasswordRequest,
    ResetPasswordResponse,
    TokenResponse,
    UserOut,
)
from app.services import audit_service, email_service

logger = logging.getLogger("imoth.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])

AGENT_PENDING_DETAIL = "Your agent account is awaiting approval by Imoth. You'll be able to log in once it's approved."
INVALID_CREDENTIALS = "Invalid email or password"
CODE_EXPIRED = "This login code has expired. Please log in again."


def _now() -> datetime:
    return datetime.now(timezone.utc)


def issue_token(user: User) -> str:
    """Agents get a long-lived token so they log in once per device; admin
    and staff keep the normal short session."""
    minutes = settings.AGENT_TOKEN_EXPIRE_DAYS * 24 * 60 if user.role == UserRole.AGENT else None
    return create_access_token(
        subject=str(user.id), role=user.role.value, expires_minutes=minutes, token_version=user.token_version
    )


def _audit(db: Session, request: Request, user: User | None, action: str, label: str | None = None, **extra) -> None:
    audit_service.record(
        db,
        actor_type=ActorType.ADMIN,
        actor_label=label or (user.email if user else "unknown"),
        actor_id=user.id if user else None,
        action=action,
        entity_type="user",
        entity_id=str(user.id) if user else None,
        ip_address=get_client_ip(request),
        **extra,
    )


def _raise_if_locked(user: User) -> None:
    if user.locked_until and user.locked_until > _now():
        minutes = max(1, math.ceil((user.locked_until - _now()).total_seconds() / 60))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. This account is locked for {minutes} more minute{'s' if minutes != 1 else ''}.",
        )


def _register_failure(db: Session, request: Request, user: User, reason: str) -> None:
    user.failed_login_count = (user.failed_login_count or 0) + 1
    _audit(db, request, user, "login_failed", new_value={"reason": reason, "failed_count": user.failed_login_count})
    if user.failed_login_count >= settings.LOGIN_MAX_FAILED_ATTEMPTS:
        user.locked_until = _now() + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
        user.failed_login_count = 0
        _audit(db, request, user, "account_locked", new_value={"minutes": settings.LOGIN_LOCKOUT_MINUTES})


def _complete_login(db: Session, request: Request, user: User) -> TokenResponse:
    user.last_login_at = _now()
    user.failed_login_count = 0
    user.locked_until = None
    _audit(db, request, user, "admin_login")
    db.commit()
    return TokenResponse(access_token=issue_token(user), user=UserOut.model_validate(user))


def _send_code(db: Session, challenge: LoginChallenge, user: User) -> None:
    code = generate_otp_code()
    challenge.code_hash = hash_otp_code(str(challenge.id), code)
    challenge.expires_at = _now() + timedelta(minutes=settings.LOGIN_OTP_TTL_MINUTES)
    challenge.last_sent_at = _now()
    challenge.attempts = 0
    try:
        email_service.send_login_code(
            to_email=user.email, full_name=user.full_name, code=code, valid_minutes=settings.LOGIN_OTP_TTL_MINUTES
        )
    except Exception:
        logger.exception("Could not email login code to %s", user.email)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We couldn't email your login code. Please try again shortly or contact Imoth.",
        )


def _otp_response(challenge: LoginChallenge, user: User) -> LoginResponse:
    return LoginResponse(
        otp_required=True,
        challenge_id=challenge.id,
        email_hint=mask_email(user.email),
        expires_in_seconds=settings.LOGIN_OTP_TTL_MINUTES * 60,
    )


@router.post("/agent-signup", response_model=AgentSignupResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_SIGNUP)
def agent_signup(request: Request, payload: AgentSignupRequest, db: Session = Depends(get_db)):
    """Self-registration for insurance agents. The account is created
    inactive -- an admin must approve it in Admin > Users before the agent
    can log in."""
    email = payload.email.lower()
    problem = password_problem(payload.password, email=email)
    if problem:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=problem)
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this email already exists")

    agent = User(
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        phone=payload.phone.strip(),
        role=UserRole.AGENT,
        is_active=False,
        password_changed_at=_now(),
    )
    db.add(agent)
    db.flush()
    audit_service.record(
        db,
        actor_type=ActorType.CLIENT,
        actor_label=email,
        actor_id=agent.id,
        action="agent_signup",
        entity_type="user",
        entity_id=str(agent.id),
        new_value={"email": email, "full_name": agent.full_name, "phone": agent.phone},
        ip_address=get_client_ip(request),
    )
    db.commit()
    return AgentSignupResponse(
        message="Account created. Imoth will review and approve it shortly -- you can log in once it's approved."
    )


@router.post("/login", response_model=LoginResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    """Step 1: check the password, then email a one-time code."""
    email = payload.email.lower()
    user = db.query(User).filter(User.email == email).one_or_none()

    if user is None:
        _audit(db, request, None, "login_failed", label=email, new_value={"reason": "unknown_email"})
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS)

    _raise_if_locked(user)

    if not verify_password(payload.password, user.password_hash):
        _register_failure(db, request, user, "wrong_password")
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS)

    if not user.is_active:
        if user.role == UserRole.AGENT and user.last_login_at is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=AGENT_PENDING_DETAIL)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    if not settings.LOGIN_OTP_ENABLED:
        token = _complete_login(db, request, user)
        return LoginResponse(otp_required=False, access_token=token.access_token, user=token.user)

    # Any earlier unfinished code for this user stops working.
    db.query(LoginChallenge).filter(
        LoginChallenge.user_id == user.id, LoginChallenge.consumed_at.is_(None)
    ).update({LoginChallenge.consumed_at: _now()}, synchronize_session=False)

    challenge = LoginChallenge(
        id=uuid.uuid4(), user_id=user.id, code_hash="", expires_at=_now(), last_sent_at=_now(),
        ip_address=get_client_ip(request),
    )
    db.add(challenge)
    _send_code(db, challenge, user)
    _audit(db, request, user, "login_code_sent")
    db.commit()
    return _otp_response(challenge, user)


def _open_challenge(db: Session, challenge_id: uuid.UUID) -> LoginChallenge:
    challenge = db.get(LoginChallenge, challenge_id)
    if (
        challenge is None
        or challenge.consumed_at is not None
        or challenge.expires_at <= _now()
        or challenge.attempts >= settings.LOGIN_OTP_MAX_ATTEMPTS
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=CODE_EXPIRED)
    return challenge


@router.post("/verify-otp", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_OTP)
def verify_otp(request: Request, payload: OtpVerifyRequest, db: Session = Depends(get_db)):
    """Step 2: check the emailed code and start the session."""
    challenge = _open_challenge(db, payload.challenge_id)
    user = challenge.user
    _raise_if_locked(user)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    code = "".join(payload.code.split())
    if not otp_code_matches(str(challenge.id), code, challenge.code_hash):
        challenge.attempts += 1
        _register_failure(db, request, user, "wrong_code")
        left = settings.LOGIN_OTP_MAX_ATTEMPTS - challenge.attempts
        db.commit()
        _raise_if_locked(user)
        if left <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=CODE_EXPIRED)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Incorrect code. {left} attempt{'s' if left != 1 else ''} left.",
        )

    challenge.consumed_at = _now()
    return _complete_login(db, request, user)


@router.post("/resend-otp", response_model=LoginResponse)
@limiter.limit(settings.RATE_LIMIT_OTP)
def resend_otp(request: Request, payload: OtpResendRequest, db: Session = Depends(get_db)):
    challenge = _open_challenge(db, payload.challenge_id)
    user = challenge.user
    _raise_if_locked(user)
    if challenge.resend_count >= settings.LOGIN_OTP_MAX_RESENDS:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many codes sent. Please log in again.")
    wait = settings.LOGIN_OTP_RESEND_COOLDOWN_SECONDS - (_now() - challenge.last_sent_at).total_seconds()
    if wait > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {math.ceil(wait)} seconds before requesting another code.",
        )
    challenge.resend_count += 1
    _send_code(db, challenge, user)
    _audit(db, request, user, "login_code_resent")
    db.commit()
    return _otp_response(challenge, user)


FORGOT_PASSWORD_REPLY = (
    "If an account exists for that email, we've sent a link to reset the password. "
    "Check your inbox (and spam folder)."
)
RESET_LINK_INVALID = "This reset link is invalid or has expired. Please request a new one."


def _reset_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@router.post("/forgot-password")
@limiter.limit(settings.RATE_LIMIT_PASSWORD_RESET)
def forgot_password(request: Request, payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Emails a one-time reset link. Always gives the same reply, whether or
    not the email has an account, so it can't be used to find out who has one."""
    email = payload.email.lower()
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None or not user.is_active:
        _audit(db, request, user, "password_reset_requested_ignored", label=email,
               new_value={"reason": "no_account" if user is None else "inactive"})
        db.commit()
        return {"message": FORGOT_PASSWORD_REPLY}

    # Any earlier unused link stops working once a new one is issued.
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None)
    ).update({PasswordResetToken.used_at: _now()}, synchronize_session=False)

    token = secrets.token_urlsafe(32)
    db.add(PasswordResetToken(
        user_id=user.id,
        token_hash=_reset_token_hash(token),
        expires_at=_now() + timedelta(minutes=settings.PASSWORD_RESET_TTL_MINUTES),
        ip_address=get_client_ip(request),
    ))
    # The token travels in the URL fragment (#token=...), which browsers never
    # send to the server, so it stays out of access logs and referrers.
    link = f"{settings.PUBLIC_APP_URL.rstrip('/')}/reset-password#token={token}"
    try:
        email_service.send_password_reset(
            to_email=user.email, full_name=user.full_name, link=link,
            valid_minutes=settings.PASSWORD_RESET_TTL_MINUTES,
        )
    except Exception:
        # Shown to the user on purpose, so they know to try again or contact
        # Imoth. This reveals that an account exists for this address only when
        # the email itself fails. The unsent link is rolled back, so nothing
        # stays usable.
        logger.exception("Could not email password reset link to %s", user.email)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We couldn't send the reset email right now. Please try again shortly or contact Imoth.",
        )
    _audit(db, request, user, "password_reset_requested")
    db.commit()
    return {"message": FORGOT_PASSWORD_REPLY}


@router.post("/reset-password", response_model=ResetPasswordResponse)
@limiter.limit(settings.RATE_LIMIT_PASSWORD_RESET)
def reset_password(request: Request, payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Sets a new password from a reset link. Ends every existing session and
    clears any lockout; the user then logs in normally (with a login code)."""
    record = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == _reset_token_hash(payload.token)
    ).one_or_none()
    if record is None or record.used_at is not None or record.expires_at <= _now():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=RESET_LINK_INVALID)
    user = record.user
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=RESET_LINK_INVALID)
    problem = password_problem(payload.new_password, email=user.email)
    if problem:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=problem)

    record.used_at = _now()
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.password_changed_at = _now()
    user.failed_login_count = 0
    user.locked_until = None
    user.token_version += 1
    _audit(db, request, user, "password_reset_completed")
    db.commit()
    return ResetPasswordResponse(message="Your password has been changed. You can now log in.", role=user.role)


@router.post("/change-password", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_any_state),
):
    """Changes your own password. Signs you out on every other device and
    returns a fresh token for this one."""
    _raise_if_locked(user)
    if not verify_password(payload.current_password, user.password_hash):
        _register_failure(db, request, user, "wrong_current_password")
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Your current password is incorrect")
    problem = password_problem(payload.new_password, email=user.email)
    if problem:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=problem)
    if verify_password(payload.new_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a password different from your current one")

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.password_changed_at = _now()
    user.failed_login_count = 0
    user.token_version += 1
    _audit(db, request, user, "password_changed")
    db.commit()
    return TokenResponse(access_token=issue_token(user), user=UserOut.model_validate(user))


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user_any_state)):
    # The app discards its token; this records the logout for audit.
    _audit(db, request, user, "admin_logout")
    db.commit()
    return {"ok": True}


@router.post("/logout-all")
def logout_all(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user_any_state)):
    """Ends every session for your account, on every device (e.g. a lost phone)."""
    user.token_version += 1
    _audit(db, request, user, "sessions_revoked")
    db.commit()
    return {"ok": True}


@router.post("/refresh", response_model=TokenResponse)
def refresh(user: User = Depends(get_current_user_any_state)):
    """Swaps a still-valid token for a fresh one. The agent app calls this
    every time it opens, so an agent who keeps using the app never has to
    log in again. Disabled accounts and revoked sessions fail here."""
    return TokenResponse(access_token=issue_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user_any_state)):
    return UserOut.model_validate(user)
