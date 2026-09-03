import uuid
from datetime import datetime, timezone

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client_document import (
    REQUIRED_DOCUMENT_TYPES,
    ClientDocumentUpload,
    ClientUploadStatus,
    RequiredDocumentType,
    VerificationStatus,
)
from app.models.enums import ActorType
from app.services import audit_service, storage_service
from app.services.settings_service import get_setting

STORAGE_SUBDIR = "client_uploads"

# Presentation metadata for the three required document types. Kept in one
# place so frontend and backend agree on labels without a round trip.
DOCUMENT_LABELS: dict[RequiredDocumentType, dict] = {
    RequiredDocumentType.LOGBOOK: {
        "label": "Vehicle Logbook",
        "description": "Proof of vehicle ownership (original logbook or a clear copy).",
    },
    RequiredDocumentType.NATIONAL_ID: {
        "label": "National ID Copy",
        "description": "A clear copy of the policy holder's National ID or Passport.",
    },
    RequiredDocumentType.KRA_PIN: {
        "label": "KRA PIN Certificate",
        "description": "The policy holder's KRA PIN certificate.",
    },
}


class ClientDocumentError(Exception):
    """Raised for validation failures (bad file type/size) or invalid state
    transitions (e.g. uploading against a locked quotation)."""


def _validate_file(db: Session, file: UploadFile, content: bytes) -> None:
    allowed_types = get_setting(db, "documents.allowed_mime_types")
    max_mb = get_setting(db, "documents.max_file_size_mb")

    if file.content_type not in allowed_types:
        friendly = ", ".join(t.split("/")[-1].upper() for t in allowed_types)
        raise ClientDocumentError(f"Unsupported file type. Accepted formats: {friendly}.")

    max_bytes = int(max_mb) * 1024 * 1024
    if len(content) > max_bytes:
        raise ClientDocumentError(f"File is too large. Maximum allowed size is {max_mb}MB.")
    if len(content) == 0:
        raise ClientDocumentError("The uploaded file appears to be empty.")


def upload_client_document(
    db: Session,
    *,
    quotation,
    document_type: RequiredDocumentType,
    file: UploadFile,
    actor_label: str,
) -> ClientDocumentUpload:
    if quotation.locked or quotation.status.value not in ("GENERATED", "SENT"):
        raise ClientDocumentError(
            "Documents can only be uploaded before this quotation is accepted."
        )

    content = file.file.read()
    _validate_file(db, file, content)

    safe_filename = storage_service.sanitize_filename(file.filename, fallback=f"{document_type.value}.bin")
    storage_path, checksum = storage_service.save_bytes(content, subdir=STORAGE_SUBDIR, filename=safe_filename)

    # Supersede any existing active upload of the same type -- never let two
    # ACTIVE rows of the same document_type satisfy the requirement, and keep
    # the old row (now REPLACED) for audit purposes rather than deleting it.
    existing = db.execute(
        select(ClientDocumentUpload).where(
            ClientDocumentUpload.quotation_id == quotation.id,
            ClientDocumentUpload.document_type == document_type,
            ClientDocumentUpload.status == ClientUploadStatus.ACTIVE,
        )
    ).scalar_one_or_none()
    was_replacement = existing is not None
    if existing:
        existing.status = ClientUploadStatus.REPLACED

    upload = ClientDocumentUpload(
        quotation_id=quotation.id,
        client_id=quotation.client_id,
        document_type=document_type,
        original_filename=safe_filename,
        storage_path=storage_path,
        checksum=checksum,
        mime_type=file.content_type,
        file_size_bytes=len(content),
        status=ClientUploadStatus.ACTIVE,
        uploaded_at=datetime.now(timezone.utc),
        verification_status=VerificationStatus.PENDING,
    )
    db.add(upload)
    db.flush()

    audit_service.record(
        db,
        actor_type=ActorType.CLIENT,
        actor_label=actor_label,
        action="document_uploaded" if not was_replacement else "document_replaced",
        entity_type="quotation",
        entity_id=str(quotation.id),
        new_value={"document_type": document_type.value, "filename": upload.original_filename},
    )
    db.commit()
    return upload


def remove_client_document(
    db: Session, *, quotation, document_type: RequiredDocumentType, actor_label: str
) -> None:
    if quotation.locked:
        raise ClientDocumentError("Documents cannot be removed from an accepted quotation.")

    existing = db.execute(
        select(ClientDocumentUpload).where(
            ClientDocumentUpload.quotation_id == quotation.id,
            ClientDocumentUpload.document_type == document_type,
            ClientDocumentUpload.status == ClientUploadStatus.ACTIVE,
        )
    ).scalar_one_or_none()
    if existing is None:
        return

    existing.status = ClientUploadStatus.REMOVED
    audit_service.record(
        db,
        actor_type=ActorType.CLIENT,
        actor_label=actor_label,
        action="document_removed",
        entity_type="quotation",
        entity_id=str(quotation.id),
        previous_value={"document_type": document_type.value, "filename": existing.original_filename},
    )
    db.commit()


def list_active_documents(db: Session, quotation_id: uuid.UUID) -> dict[RequiredDocumentType, ClientDocumentUpload]:
    rows = db.execute(
        select(ClientDocumentUpload).where(
            ClientDocumentUpload.quotation_id == quotation_id,
            ClientDocumentUpload.status == ClientUploadStatus.ACTIVE,
        )
    ).scalars().all()
    return {row.document_type: row for row in rows}


def required_documents_complete(db: Session, quotation_id: uuid.UUID) -> bool:
    active = list_active_documents(db, quotation_id)
    return all(doc_type in active for doc_type in REQUIRED_DOCUMENT_TYPES)


def verify_document(
    db: Session, *, upload: ClientDocumentUpload, new_status: VerificationStatus, verifier_id: uuid.UUID, actor_label: str
) -> ClientDocumentUpload:
    previous = upload.verification_status
    upload.verification_status = new_status
    upload.verified_by = verifier_id
    upload.verified_at = datetime.now(timezone.utc)

    audit_service.record(
        db,
        actor_type=ActorType.ADMIN,
        actor_label=actor_label,
        actor_id=verifier_id,
        action="document_verified",
        entity_type="client_document_upload",
        entity_id=str(upload.id),
        previous_value={"verification_status": previous.value},
        new_value={"verification_status": new_status.value},
    )
    db.commit()
    return upload
