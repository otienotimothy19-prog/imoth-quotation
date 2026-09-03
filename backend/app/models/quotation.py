import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import QuotationSource, QuotationStatus
from app.models.mixins import TimestampMixin, UUIDPKMixin


class Quotation(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "quotations"

    quotation_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False, index=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False, index=True
    )
    insurer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insurers.id"), nullable=False, index=True
    )
    # Nullable, unlike the other FKs above: if the motor class this
    # quotation was generated against is later permanently deleted (as
    # opposed to Disabled), the column is set NULL at the database level
    # rather than blocking the delete or removing the quotation -- the
    # quotation itself, its pricing snapshot, PDF and any risk note must
    # survive regardless of what happens to the class afterward.
    motor_class_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("motor_classes.id", ondelete="SET NULL"), nullable=True, index=True
    )

    cover_type: Mapped[str] = mapped_column(String(50), nullable=False)  # comprehensive | tpo
    vehicle_class_label: Mapped[str] = mapped_column(String(255), nullable=False)
    sum_insured: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)

    options: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    basic_premium: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    levies: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    stamp_duty: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    total_premium: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    amount_paid: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    balance: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)

    status: Mapped[QuotationStatus] = mapped_column(
        Enum(QuotationStatus, name="quotation_status"), default=QuotationStatus.DRAFT, nullable=False, index=True
    )
    source: Mapped[QuotationSource] = mapped_column(
        Enum(QuotationSource, name="quotation_source"), default=QuotationSource.CLIENT_PORTAL, nullable=False
    )
    acceptance_statement_accepted: Mapped[bool] = mapped_column(default=False, nullable=False)

    pdf_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True
    )

    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked: Mapped[bool] = mapped_column(default=False, nullable=False)

    superseded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotations.id"), nullable=True
    )

    client: Mapped["Client"] = relationship()  # noqa: F821
    vehicle: Mapped["Vehicle"] = relationship()  # noqa: F821
    insurer: Mapped["Insurer"] = relationship()  # noqa: F821
    motor_class: Mapped["MotorClass | None"] = relationship()  # noqa: F821

    items: Mapped[list["QuotationItem"]] = relationship(
        back_populates="quotation", cascade="all, delete-orphan", order_by="QuotationItem.sort_order"
    )
    snapshot: Mapped["QuotationSnapshot"] = relationship(
        back_populates="quotation", uselist=False, cascade="all, delete-orphan"
    )
    risk_note: Mapped["RiskNote"] = relationship(  # noqa: F821
        back_populates="quotation", uselist=False
    )


class QuotationItem(UUIDPKMixin, Base):
    __tablename__ = "quotation_items"

    quotation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(500), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    quotation: Mapped["Quotation"] = relationship(back_populates="items")


class QuotationSnapshot(UUIDPKMixin, TimestampMixin, Base):
    """Complete, immutable pricing snapshot captured at generation time:
    insurer/class config, rate bands used, levies, benefits, excesses,
    conditions and the full calculation result. Historical quotations must
    never change even if admin rates change afterwards."""

    __tablename__ = "quotation_snapshots"

    quotation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("quotations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    rate_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rate_versions.id"), nullable=True
    )
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)

    quotation: Mapped["Quotation"] = relationship(back_populates="snapshot")
