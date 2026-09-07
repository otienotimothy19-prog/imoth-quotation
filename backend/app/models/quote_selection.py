import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import QuoteSelectionStatus
from app.models.mixins import TimestampMixin, UUIDPKMixin


class QuoteSelection(UUIDPKMixin, TimestampMixin, Base):
    """A customer's locked-in choice of insurer/class/premium from the
    Compare Quotes step, before any personal information exists. Deliberately
    carries no client_id / personal-info columns of any kind -- the
    anonymous-comparison requirement means this table must never be able to
    hold a name, phone, email, ID or KRA PIN. It converts into a real
    Quotation (see quotation.py) only once "About You" is submitted, at
    which point `status` becomes CONVERTED and `converted_quotation_id` is
    set; the QuoteSelection row itself is then never read again for pricing
    (the Quotation's own snapshot is authoritative from that point on)."""

    __tablename__ = "quote_selections"

    # Raw vehicle/cover fields as entered on Vehicle & Cover -- copied onto
    # the real Vehicle row (via the existing get_or_create_vehicle) once
    # personal details are known.
    registration_no: Mapped[str] = mapped_column(String(30), nullable=False)
    year_of_manufacture: Mapped[int] = mapped_column(Integer, nullable=False)
    make: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    cover_type: Mapped[str] = mapped_column(String(50), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    commercial_use: Mapped[str | None] = mapped_column(String(30), nullable=True)
    institution_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    institutional_vehicle_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    passenger_category: Mapped[str | None] = mapped_column(String(30), nullable=True)
    sum_insured: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    options: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # The locked selection.
    insurer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insurers.id"), nullable=False, index=True
    )
    # Nullable + SET NULL, mirroring Quotation.motor_class_id: a class
    # permanently deleted after selection must not block or corrupt an
    # in-flight selection -- the locked premium/snapshot already computed
    # below is authoritative regardless.
    motor_class_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("motor_classes.id", ondelete="SET NULL"), nullable=True
    )
    vehicle_class_label: Mapped[str] = mapped_column(String(255), nullable=False)
    rate_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rate_versions.id", ondelete="SET NULL"), nullable=True
    )

    # The locked premium breakdown -- never recalculated after this point.
    basic_premium: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    levies: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    stamp_duty: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    total_premium: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    items: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    # Everything generate_quotation() would normally put into
    # QuotationSnapshot.data -- computed once here, carried forward
    # verbatim at conversion time so nothing is recalculated later.
    snapshot_data: Mapped[dict] = mapped_column(JSONB, nullable=False)

    status: Mapped[QuoteSelectionStatus] = mapped_column(
        Enum(QuoteSelectionStatus, name="quote_selection_status"),
        default=QuoteSelectionStatus.SELECTED_PENDING_DETAILS,
        nullable=False,
        index=True,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    converted_quotation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotations.id"), nullable=True
    )

    insurer: Mapped["Insurer"] = relationship()  # noqa: F821
    motor_class: Mapped["MotorClass | None"] = relationship()  # noqa: F821
