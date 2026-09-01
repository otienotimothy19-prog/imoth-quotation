import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from pydantic import BaseModel

from app.api.deps import get_client_ip, require_admin
from app.database import get_db
from app.models.client_document import ClientDocumentUpload, ClientUploadStatus, VerificationStatus
from app.models.client_vehicle import Client, Vehicle
from app.models.documents_email_audit import AuditLog, Document, EmailLog
from app.models.enums import ActorType, QuotationStatus
from app.models.insurer_rate import Insurer
from app.models.quotation import Quotation
from app.models.user import User
from app.schemas.quotation import EmailSendRequest
from app.services import audit_service, client_document_service, email_service, storage_service
from app.services.client_document_service import DOCUMENT_LABELS

router = APIRouter(prefix="/api/admin/quotations", tags=["admin-quotations"])


def _summary(q: Quotation) -> dict:
    return {
        "id": str(q.id),
        "quotation_number": q.quotation_number,
        "client_name": q.client.full_name,
        "phone": q.client.phone,
        "registration_no": q.vehicle.registration_no,
        "insurer_name": q.insurer.name,
        "vehicle_class_label": q.vehicle_class_label,
        "cover_type": q.cover_type,
        "status": q.status.value,
        "total_premium": float(q.total_premium),
        "has_risk_note": q.risk_note is not None,
        "created_at": q.created_at,
        "generated_at": q.generated_at,
    }


@router.get("")
def list_quotations(
    q: str | None = Query(default=None, description="Search: quotation number, client name, or registration no"),
    insurer_id: uuid.UUID | None = Query(default=None),
    status_filter: QuotationStatus | None = Query(default=None, alias="status"),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    vehicle_class: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    query = (
        db.query(Quotation)
        .join(Client, Quotation.client_id == Client.id)
        .join(Vehicle, Quotation.vehicle_id == Vehicle.id)
        .join(Insurer, Quotation.insurer_id == Insurer.id)
        .options(
            joinedload(Quotation.client),
            joinedload(Quotation.vehicle),
            joinedload(Quotation.insurer),
            joinedload(Quotation.risk_note),
        )
    )
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(Quotation.quotation_number.ilike(like), Client.full_name.ilike(like), Vehicle.registration_no.ilike(like))
        )
    if insurer_id:
        query = query.filter(Quotation.insurer_id == insurer_id)
    if status_filter:
        query = query.filter(Quotation.status == status_filter)
    if vehicle_class:
        query = query.filter(Quotation.vehicle_class_label.ilike(f"%{vehicle_class}%"))
    if date_from:
        query = query.filter(Quotation.created_at >= date_from)
    if date_to:
        query = query.filter(Quotation.created_at <= date_to)

    total = query.count()
    rows = query.order_by(Quotation.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return {"total": total, "page": page, "page_size": page_size, "items": [_summary(q) for q in rows]}


def _get_full(db: Session, quotation_id: uuid.UUID) -> Quotation:
    quotation = (
        db.query(Quotation)
        .options(
            joinedload(Quotation.client),
            joinedload(Quotation.vehicle),
            joinedload(Quotation.insurer),
            joinedload(Quotation.motor_class),
            joinedload(Quotation.items),
            joinedload(Quotation.snapshot),
            joinedload(Quotation.risk_note),
        )
        .filter(Quotation.id == quotation_id)
        .one_or_none()
    )
    if quotation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    return quotation


@router.get("/{quotation_id}")
def get_quotation_detail(quotation_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    quotation = _get_full(db, quotation_id)
    return {
        **_summary(quotation),
        "client": {
            "full_name": quotation.client.full_name,
            "phone": quotation.client.phone,
            "email": quotation.client.email,
            "id_or_passport": quotation.client.id_or_passport,
        },
        "vehicle": {
            "registration_no": quotation.vehicle.registration_no,
            "make": quotation.vehicle.make,
            "model": quotation.vehicle.model,
            "age_years": quotation.vehicle.age_years,
            "year_of_manufacture": quotation.vehicle.year_of_manufacture,
        },
        "sum_insured": float(quotation.sum_insured),
        "basic_premium": float(quotation.basic_premium),
        "subtotal": float(quotation.subtotal),
        "levies": float(quotation.levies),
        "stamp_duty": float(quotation.stamp_duty),
        "amount_paid": float(quotation.amount_paid),
        "balance": float(quotation.balance),
        "items": [{"label": i.label, "amount": float(i.amount)} for i in sorted(quotation.items, key=lambda x: x.sort_order)],
        "snapshot": quotation.snapshot.data if quotation.snapshot else None,
        "accepted_at": quotation.accepted_at,
        "rejected_at": quotation.rejected_at,
        "expires_at": quotation.expires_at,
        "locked": quotation.locked,
        "risk_note": (
            {
                "id": str(quotation.risk_note.id),
                "risk_note_number": quotation.risk_note.risk_note_number,
                "status": quotation.risk_note.status.value,
            }
            if quotation.risk_note
            else None
        ),
    }


@router.get("/{quotation_id}/pdf")
def download_pdf(quotation_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    quotation = _get_full(db, quotation_id)
    if quotation.pdf_document_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF not available")
    document = db.get(Document, quotation.pdf_document_id)
    content = storage_service.read_bytes(document.storage_path)

    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="quotation_downloaded", entity_type="quotation", entity_id=str(quotation.id),
    )
    db.commit()
    return Response(content=content, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{document.filename}"'})


@router.post("/{quotation_id}/email")
def email_quotation(quotation_id: uuid.UUID, payload: EmailSendRequest, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    quotation = _get_full(db, quotation_id)
    to_email = payload.to_email or quotation.client.email
    if not to_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No recipient email available")
    if quotation.pdf_document_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quotation PDF not available")

    document = db.get(Document, quotation.pdf_document_id)
    log = email_service.send_documents_email(
        db, to_email=to_email, subject=f"Imoth Insurance Brokers – Quotation {quotation.quotation_number}",
        body=f"Please find attached quotation {quotation.quotation_number}.",
        documents=[document], initiated_by=user.email, quotation_id=quotation.id,
    )
    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="quotation_emailed", entity_type="quotation", entity_id=str(quotation.id),
        new_value={"to": to_email, "status": log.status.value}, ip_address=get_client_ip(request),
    )
    db.commit()
    return {"status": log.status.value, "error": log.error_message}


@router.get("/{quotation_id}/emails")
def list_email_history(quotation_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    logs = db.query(EmailLog).filter(EmailLog.quotation_id == quotation_id).order_by(EmailLog.created_at.desc()).all()
    return [
        {
            "id": str(l.id), "recipient": l.recipient, "subject": l.subject, "status": l.status.value,
            "sent_at": l.sent_at, "error_message": l.error_message, "retry_count": l.retry_count,
            "initiated_by": l.initiated_by, "created_at": l.created_at,
        }
        for l in logs
    ]


@router.post("/emails/{email_log_id}/retry")
def retry_email(email_log_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    log = db.get(EmailLog, email_log_id)
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email log not found")
    email_service.retry_email(db, log)
    db.commit()
    return {"status": log.status.value, "error": log.error_message}


def _document_admin_out(upload: ClientDocumentUpload) -> dict:
    return {
        "id": str(upload.id),
        "document_type": upload.document_type.value,
        "label": DOCUMENT_LABELS[upload.document_type]["label"],
        "original_filename": upload.original_filename,
        "mime_type": upload.mime_type,
        "file_size_bytes": upload.file_size_bytes,
        "status": upload.status.value,
        "uploaded_at": upload.uploaded_at,
        "verification_status": upload.verification_status.value,
        "verified_by": str(upload.verified_by) if upload.verified_by else None,
        "verified_at": upload.verified_at,
    }


@router.get("/{quotation_id}/documents")
def list_client_documents(quotation_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    quotation = _get_full(db, quotation_id)
    uploads = (
        db.query(ClientDocumentUpload)
        .filter(ClientDocumentUpload.quotation_id == quotation.id)
        .order_by(ClientDocumentUpload.uploaded_at.desc())
        .all()
    )
    active = [u for u in uploads if u.status == ClientUploadStatus.ACTIVE]
    return {
        "required_count": len(DOCUMENT_LABELS),
        "uploaded_count": len(active),
        "all_uploaded": client_document_service.required_documents_complete(db, quotation.id),
        "documents": [_document_admin_out(u) for u in uploads],
    }


@router.get("/{quotation_id}/documents/{document_upload_id}/download")
def download_client_document(
    quotation_id: uuid.UUID,
    document_upload_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    upload = db.get(ClientDocumentUpload, document_upload_id)
    if upload is None or upload.quotation_id != quotation_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    content = storage_service.read_bytes(upload.storage_path)

    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="client_document_downloaded", entity_type="client_document_upload", entity_id=str(upload.id),
    )
    db.commit()
    return Response(
        content=content,
        media_type=upload.mime_type,
        headers={"Content-Disposition": f'inline; filename="{upload.original_filename}"'},
    )


class VerifyDocumentRequest(BaseModel):
    verification_status: VerificationStatus


@router.post("/{quotation_id}/documents/{document_upload_id}/verify")
def verify_client_document(
    quotation_id: uuid.UUID,
    document_upload_id: uuid.UUID,
    payload: VerifyDocumentRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    upload = db.get(ClientDocumentUpload, document_upload_id)
    if upload is None or upload.quotation_id != quotation_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if payload.verification_status == VerificationStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification status must be VERIFIED or REJECTED")

    upload = client_document_service.verify_document(
        db, upload=upload, new_status=payload.verification_status, verifier_id=user.id, actor_label=user.email,
    )
    return _document_admin_out(upload)


@router.get("/{quotation_id}/audit")
def get_audit_trail(quotation_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    quotation = _get_full(db, quotation_id)
    entity_ids = [str(quotation.id)]
    if quotation.risk_note:
        entity_ids.append(str(quotation.risk_note.id))
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.entity_id.in_(entity_ids))
        .order_by(AuditLog.timestamp.desc())
        .all()
    )
    return [
        {
            "action": l.action, "entity_type": l.entity_type, "actor_label": l.actor_label,
            "actor_type": l.actor_type.value, "timestamp": l.timestamp,
            "previous_value": l.previous_value, "new_value": l.new_value,
        }
        for l in logs
    ]
