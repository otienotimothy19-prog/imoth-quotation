import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class RequiredDocumentType(str, enum.Enum):
    LOGBOOK = "LOGBOOK"
    NATIONAL_ID = "NATIONAL_ID"
    KRA_PIN = "KRA_PIN"


class ClientUploadStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    REPLACED = "REPLACED"
    REMOVED = "REMOVED"


class VerificationStatus(str, enum.Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


REQUIRED_DOCUMENT_TYPES = (
    RequiredDocumentType.LOGBOOK,
    RequiredDocumentType.NATIONAL_ID,
    RequiredDocumentType.KRA_PIN,
)


class ClientDocumentUpload(UUIDPKMixin, TimestampMixin, Base):
    """A client-supplied KYC document (logbook / ID / KRA PIN) attached to a
    quotation ahead of acceptance. Never served through a public/static URL --
    only via authenticated admin endpoints (see client_document_service)."""

    __tablename__ = "client_document_uploads"

    quotation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False, index=True
    )
    document_type: Mapped[RequiredDocumentType] = mapped_column(
        Enum(RequiredDocumentType, name="required_document_type"), nullable=False, index=True
    )

    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    checksum: Mapped[str] = mapped_column(String(128), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)

    status: Mapped[ClientUploadStatus] = mapped_column(
        Enum(ClientUploadStatus, name="client_upload_status"),
        default=ClientUploadStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status"),
        default=VerificationStatus.PENDING,
        nullable=False,
    )
    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
