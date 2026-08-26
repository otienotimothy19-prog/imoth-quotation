import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ActorType, DocumentType, EmailStatus
from app.models.mixins import TimestampMixin, UUIDPKMixin


class Document(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "documents"

    doc_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType, name="document_type"), nullable=False)
    reference_number: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    quotation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    risk_note_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risk_notes.id", ondelete="SET NULL"), nullable=True, index=True
    )

    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    checksum: Mapped[str] = mapped_column(String(128), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)


class EmailLog(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "email_logs"

    recipient: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    quotation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    risk_note_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risk_notes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    document_ids: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    initiated_by: Mapped[str] = mapped_column(String(255), nullable=False)  # client email/"system"/admin email
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[EmailStatus] = mapped_column(
        Enum(EmailStatus, name="email_status"), default=EmailStatus.PENDING, nullable=False, index=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class AuditLog(UUIDPKMixin, Base):
    __tablename__ = "audit_logs"

    actor_type: Mapped[ActorType] = mapped_column(Enum(ActorType, name="actor_type"), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_label: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    previous_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SystemSetting(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)


class DocumentCounter(Base):
    """Atomic per-year sequence counters backing quotation/risk-note
    numbering (QT-2026-000001 / RN-2026-000001). Row-locked on increment so
    concurrent requests can never hand out the same number."""

    __tablename__ = "document_counters"
    __table_args__ = (UniqueConstraint("doc_type", "year", name="uq_document_counter_type_year"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_type: Mapped[str] = mapped_column(String(10), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    seq: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
