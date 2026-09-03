import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class Insurer(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "insurers"

    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    logo_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    disclaimer: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    motor_classes: Mapped[list["MotorClass"]] = relationship(
        back_populates="insurer", cascade="all, delete-orphan"
    )


class MotorClass(UUIDPKMixin, TimestampMixin, Base):
    """Mirrors one entry of INSURERS[x].classes[y] from the legacy engine."""

    __tablename__ = "motor_classes"
    __table_args__ = (UniqueConstraint("insurer_id", "code", name="uq_motor_class_insurer_code"),)

    insurer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insurers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    max_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    min_si: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    max_si: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    has_lr_toggle: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pll_per_seat: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    pll_options: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    flat_only: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    excess: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    benefits: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    limits: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    insurer: Mapped["Insurer"] = relationship(back_populates="motor_classes")
    rate_bands: Mapped[list["RateBand"]] = relationship(
        back_populates="motor_class", cascade="all, delete-orphan", order_by="RateBand.sort_order"
    )


class RateBand(UUIDPKMixin, TimestampMixin, Base):
    """One Sum-Insured band of pricing for a motor class (mirrors band() helper)."""

    __tablename__ = "rate_bands"

    motor_class_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("motor_classes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    variant: Mapped[str] = mapped_column(String(20), default="standard", nullable=False)  # standard | alt (LR toggle)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    min_si: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    max_si: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    rate: Mapped[float] = mapped_column(Numeric(8, 5), nullable=False)
    min_premium: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    # Optional passenger-capacity limits (PSV classes only). Null on both
    # sides means the band applies regardless of passenger count -- the
    # historical behaviour for every non-PSV class and any PSV band that
    # doesn't need this dimension. When set, `find_band` requires the
    # quoted passenger count to fall within [min_passengers, max_passengers]
    # in addition to the Sum-Insured range before the band is eligible.
    min_passengers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_passengers: Mapped[int | None] = mapped_column(Integer, nullable=True)

    ep_included: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ep_not_offered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ep_rate: Mapped[float] = mapped_column(Numeric(8, 5), default=0, nullable=False)
    ep_min: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    # Charged automatically as a separate line whenever true, regardless of
    # customer opt-in -- e.g. Britam private car bands where EP is mandatory
    # per the binder terms rather than a customer-selected add-on.
    ep_mandatory: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    pvt_included: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    pvt_not_offered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pvt_rate: Mapped[float] = mapped_column(Numeric(8, 5), default=0, nullable=False)
    pvt_min: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    pvt_mandatory: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    effective_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expiry_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    motor_class: Mapped["MotorClass"] = relationship(back_populates="rate_bands")


class RateVersion(UUIDPKMixin, TimestampMixin, Base):
    """Immutable snapshot of a motor class's full rate configuration, recorded
    every time an admin changes rates. Used for rate-change audit / history.
    Actual quotation pricing snapshots live on QuotationSnapshot so historical
    quotations never change even if this record's underlying rates are edited
    further, or this version row is superseded."""

    __tablename__ = "rate_versions"

    motor_class_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("motor_classes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
