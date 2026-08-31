import uuid

from sqlalchemy.orm import Session

from app.models.documents_email_audit import Document
from app.models.enums import DocumentType
from app.services import storage_service


def store_document(
    db: Session,
    *,
    doc_type: DocumentType,
    reference_number: str,
    content: bytes,
    quotation_id: uuid.UUID | None = None,
    risk_note_id: uuid.UUID | None = None,
    created_by: uuid.UUID | None = None,
) -> Document:
    filename = f"{reference_number}.pdf"
    subdir = "quotations" if doc_type == DocumentType.QUOTATION else "risk_notes"
    storage_path, checksum = storage_service.save_bytes(content, subdir=subdir, filename=filename)

    document = Document(
        doc_type=doc_type,
        reference_number=reference_number,
        quotation_id=quotation_id,
        risk_note_id=risk_note_id,
        filename=filename,
        storage_path=storage_path,
        checksum=checksum,
        created_by=created_by,
    )
    db.add(document)
    db.flush()
    return document
