import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Step 1 of login. With login codes on, otp_required is true and the
    client must call /verify-otp; otherwise the token is returned directly."""
    otp_required: bool
    challenge_id: uuid.UUID | None = None
    email_hint: str | None = None
    expires_in_seconds: int | None = None
    access_token: str | None = None
    token_type: str = "bearer"
    user: "UserOut | None" = None


class OtpVerifyRequest(BaseModel):
    challenge_id: uuid.UUID
    code: str = Field(min_length=6, max_length=12)


class OtpResendRequest(BaseModel):
    challenge_id: uuid.UUID


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class ResetPasswordResponse(BaseModel):
    message: str
    role: UserRole


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    phone: str | None = None
    last_login_at: datetime | None = None
    created_at: datetime | None = None
    must_change_password: bool = False
    locked_until: datetime | None = None

    model_config = {"from_attributes": True}


class AgentSignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=7, max_length=30)


class AgentSignupResponse(BaseModel):
    message: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: str = Field(min_length=2, max_length=255)
    role: UserRole = UserRole.STAFF


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    role: UserRole | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=200)


TokenResponse.model_rebuild()
LoginResponse.model_rebuild()
