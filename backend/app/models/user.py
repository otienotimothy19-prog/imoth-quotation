from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import UserRole
from app.models.mixins import TimestampMixin, UUIDPKMixin


class User(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), nullable=False, default=UserRole.STAFF
    )
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Security
    # Set for temporary passwords (new users, admin resets, the bootstrap
    # admin): the user must choose their own password before doing anything else.
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Wrong passwords/codes in a row; reaching the limit locks the account until locked_until.
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Embedded in every login token. Bumping it signs the user out on every
    # device at once (password change, "sign out everywhere").
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
