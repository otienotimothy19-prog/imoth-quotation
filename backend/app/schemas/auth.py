import uuid

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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

    model_config = {"from_attributes": True}


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
