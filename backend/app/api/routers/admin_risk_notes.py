import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, require_admin
from app.database import get_db
from app.models.client_vehicle import Client, Vehicle
from app.models.documents_email_audit import AuditLog, Document
from app.models.enums import ActorType, RiskNoteStatus
from app.models.insurer_rate import Insurer
from app.models.quotation import Quotation
from app.models.risk_note import RiskNote
from app.models.user import User
from app.schemas.admin import VoidRiskNoteRequest
from app.schemas.quotation import EmailSendRequest
from app.services import audit_service, email_service, storage_service
from app.services.quote_service import QuoteServiceError, void_risk_note

router = APIRouter(prefix="/api/admin/risk-notes", tags=["admin-risk-notes"])


def _summary(rn: RiskNote) -> dict:
    return {
        "id": str(rn.id),
        "risk_note_number": rn.risk_note_number,
        "quotation_id": str(rn.quotation_id),
        "quotation_number": rn.quotation.quotation_number,
        "client_name": rn.quotation.client.full_name,
        "registration_no": rn.quotation.vehicle.registration_no,
        "insurer_name": rn.quotation.insurer.name,
        "status": rn.status.value,
        "sum_insured": float(rn.sum_insured),
        "premium": float(rn.premium),
        "cover_start_date": rn.cover_start_date,
        "cover_end_date": rn.cover_end_date,
        "generated_at": rn.generated_at,
    }


@router.get("")
def list_risk_notes(
    q: str | None = Query(default=None, description="Search: risk note number, quotation number, registration, client"),
    insurer_id: uuid.UUID | None = Query(default=None),
    status_filter: RiskNoteStatus | None = Query(default=None, alias="status"),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    query = (
        db.query(RiskNote)
        .join(Quotation, RiskNote.quotation_id == Quotation.id)
        .join(Client, RiskNote.client_id == Client.id)
        .join(Vehicle, RiskNote.vehicle_id == Vehicle.id)
        .join(Insurer, RiskNote.insurer_id == Insurer.id)
        .options(
            joinedload(RiskNote.quotation).joinedload(Quotation.client),
            joinedload(RiskNote.quotation).joinedload(Quotation.vehicle),
            joinedload(RiskNote.quotation).joinedload(Quotation.insurer),
        )
    )
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                RiskNote.risk_note_number.ilike(like),
                Quotation.quotation_number.ilike(like),
                Client.full_name.ilike(like),
                Vehicle.registration_no.ilike(like),
            )
        )
    if insurer_id:
        query = query.filter(RiskNote.insurer_id == insurer_id)
    if status_filter:
        query = query.filter(RiskNote.status == status_filter)
    if date_from:
        query = query.filter(RiskNote.generated_at >= date_from)
    if date_to:
        query = query.filter(RiskNote.generated_at <= date_to)

    total = query.count()
    rows = query.order_by(RiskNote.generated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": [_summary(r) for r in rows]}


def _get_full(db: Session, risk_note_id: uuid.UUID) -> RiskNote:
    rn = (
        db.query(RiskNote)
        .options(
            joinedload(RiskNote.quotation).joinedload(Quotation.client),
            joinedload(RiskNote.quotation).joinedload(Quotation.vehicle),
            joinedload(RiskNote.quotation).joinedload(Quotation.insurer),
            joinedload(RiskNote.status_history),
        )
        .filter(RiskNote.id == risk_note_id)
        .one_or_none()
    )
    if rn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk note not found")
    return rn


@router.get("/{risk_note_id}")
def get_detail(risk_note_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    rn = _get_full(db, risk_note_id)
    return {
        **_summary(rn),
        "quotation_accepted_at": rn.quotation_accepted_at,
        "status_history": [
            {
                "previous_status": h.previous_status, "new_status": h.new_status, "reason": h.reason,
                "changed_by": str(h.changed_by) if h.changed_by else None, "changed_at": h.changed_at,
            }
            for h in sorted(rn.status_history, key=lambda x: x.changed_at)
        ],
    }


@router.get("/{risk_note_id}/pdf")
def download_pdf(risk_note_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    rn = _get_full(db, risk_note_id)
    if rn.pdf_document_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF not available")
    document = db.get(Document, rn.pdf_document_id)
    content = storage_service.read_bytes(document.storage_path)

    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="risk_note_downloaded", entity_type="risk_note", entity_id=str(rn.id),
    )
    db.commit()
    return Response(content=content, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{document.filename}"'})


@router.post("/{risk_note_id}/email")
def email_risk_note(risk_note_id: uuid.UUID, payload: EmailSendRequest, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    rn = _get_full(db, risk_note_id)
    to_email = payload.to_email or rn.quotation.client.email
    if not to_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No recipient email available")

    documents = []
    if payload.include_risk_note or not payload.include_quotation:
        if rn.pdf_document_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Risk note PDF not available")
        documents.append(db.get(Document, rn.pdf_document_id))
    if payload.include_quotation:
        if rn.quotation.pdf_document_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quotation PDF not available")
        documents.append(db.get(Document, rn.quotation.pdf_document_id))

    subject = f"Imoth Insurance Brokers – Risk Note {rn.risk_note_number}"
    log = email_service.send_documents_email(
        db, to_email=to_email, subject=subject, body=f"Please find attached Risk Note {rn.risk_note_number}.",
        documents=documents, initiated_by=user.email, quotation_id=rn.quotation_id, risk_note_id=rn.id,
    )
    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="risk_note_emailed", entity_type="risk_note", entity_id=str(rn.id),
        new_value={"to": to_email, "status": log.status.value}, ip_address=get_client_ip(request),
    )
    db.commit()
    return {"status": log.status.value, "error": log.error_message}


@router.post("/{risk_note_id}/void")
def void(risk_note_id: uuid.UUID, payload: VoidRiskNoteRequest, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    try:
        rn = void_risk_note(
            db, risk_note_id=risk_note_id, new_status=payload.new_status, reason=payload.reason,
            actor_label=user.email, actor_id=user.id,
        )
    except QuoteServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _summary(_get_full(db, rn.id))


@router.get("/{risk_note_id}/audit")
def get_audit_trail(risk_note_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    rn = _get_full(db, risk_note_id)
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.entity_id.in_([str(rn.id), str(rn.quotation_id)]))
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
