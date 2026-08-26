import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.limiter import limiter
from app.database import get_db
from app.models.documents_email_audit import Document
from app.models.enums import ActorType, DocumentType
from app.schemas.quotation import EmailSendRequest
from app.services import audit_service, email_service, storage_service
from app.services.quote_service import get_quotation_full

router = APIRouter(prefix="/api/documents", tags=["client-documents"])


def _doc_status(doc_type: str, quotation) -> dict | None:
    if doc_type == "quotation":
        return {
            "type": "QUOTATION",
            "reference_number": quotation.quotation_number,
            "status": quotation.status.value,
            "download_url": f"/api/quotes/{quotation.id}/pdf",
        }
    if quotation.risk_note is None:
        return None
    return {
        "type": "RISK_NOTE",
        "reference_number": quotation.risk_note.risk_note_number,
        "status": quotation.risk_note.status.value,
        "download_url": f"/api/documents/{quotation.id}/risk-note/pdf",
    }


@router.get("/{quotation_id}")
def list_documents(quotation_id: uuid.UUID, db: Session = Depends(get_db)):
    quotation = get_quotation_full(db, quotation_id)
    if quotation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    return {
        "quotation": _doc_status("quotation", quotation),
        "risk_note": _doc_status("risk_note", quotation),
        "client_email": quotation.client.email,
    }


@router.get("/{quotation_id}/risk-note/pdf")
def download_risk_note_pdf(quotation_id: uuid.UUID, db: Session = Depends(get_db)):
    quotation = get_quotation_full(db, quotation_id)
    if quotation is None or quotation.risk_note is None or quotation.risk_note.pdf_document_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk note PDF not found")
    document = db.get(Document, quotation.risk_note.pdf_document_id)
    content = storage_service.read_bytes(document.storage_path)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{document.filename}"'},
    )


@router.post("/{quotation_id}/email")
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
def email_documents(request: Request, quotation_id: uuid.UUID, payload: EmailSendRequest, db: Session = Depends(get_db)):
    quotation = get_quotation_full(db, quotation_id)
    if quotation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")

    to_email = payload.to_email or quotation.client.email
    if not to_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No recipient email available; please provide one")

    documents: list[Document] = []
    parts = []
    if payload.include_quotation:
        if quotation.pdf_document_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quotation PDF is not available yet")
        documents.append(db.get(Document, quotation.pdf_document_id))
        parts.append(f"Quotation {quotation.quotation_number}")
    if payload.include_risk_note:
        if quotation.risk_note is None or quotation.risk_note.pdf_document_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Risk Note PDF is not available yet")
        documents.append(db.get(Document, quotation.risk_note.pdf_document_id))
        parts.append(f"Risk Note {quotation.risk_note.risk_note_number}")

    if not documents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select at least one document to email")

    subject = f"Imoth Insurance Brokers – {' & '.join(parts)}"
    body = (
        f"Dear {quotation.client.full_name},\n\n"
        f"Please find attached your {' and '.join(parts)} from Imoth Insurance Brokers Limited "
        f"for vehicle {quotation.vehicle.registration_no}.\n\n"
        "Kind regards,\nImoth Insurance Brokers Limited"
    )

    log = email_service.send_documents_email(
        db,
        to_email=to_email,
        subject=subject,
        body=body,
        documents=documents,
        initiated_by=quotation.client.email or quotation.client.phone,
        quotation_id=quotation.id,
        risk_note_id=quotation.risk_note.id if (payload.include_risk_note and quotation.risk_note) else None,
    )

    if quotation.status.value == "GENERATED" and payload.include_quotation:
        from app.models.enums import QuotationStatus
        from datetime import datetime, timezone

        quotation.status = QuotationStatus.SENT
        quotation.sent_at = datetime.now(timezone.utc)

    audit_service.record(
        db,
        actor_type=ActorType.CLIENT,
        actor_label=to_email,
        action="quotation_emailed" if payload.include_quotation and not payload.include_risk_note else (
            "risk_note_emailed" if payload.include_risk_note and not payload.include_quotation else "documents_emailed"
        ),
        entity_type="quotation",
        entity_id=str(quotation.id),
        new_value={"to": to_email, "status": log.status.value},
    )
    db.commit()

    return {"status": log.status.value, "recipient": to_email, "error": log.error_message}
