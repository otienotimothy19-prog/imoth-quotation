import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import RiskNoteStatus
from app.models.mixins import TimestampMixin, UUIDPKMixin


class RiskNote(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "risk_notes"

    risk_note_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)

    quotation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotations.id"), nullable=False, unique=True, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False)
    insurer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("insurers.id"), nullable=False)

    cover_type: Mapped[str] = mapped_column(String(50), nullable=False)
    sum_insured: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    premium: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    cover_start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cover_end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    quotation_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    generated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    status: Mapped[RiskNoteStatus] = mapped_column(
        Enum(RiskNoteStatus, name="risk_note_status"), default=RiskNoteStatus.ACTIVE, nullable=False, index=True
    )
    pdf_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True
    )

    quotation: Mapped["Quotation"] = relationship(back_populates="risk_note")  # noqa: F821
    status_history: Mapped[list["RiskNoteStatusHistory"]] = relationship(
        back_populates="risk_note", cascade="all, delete-orphan"
    )


class RiskNoteStatusHistory(UUIDPKMixin, Base):
    __tablename__ = "risk_note_status_history"

    risk_note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risk_notes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    previous_status: Mapped[str] = mapped_column(String(30), nullable=False)
    new_status: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    risk_note: Mapped["RiskNote"] = relationship(back_populates="status_history")
