import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.limiter import limiter
from app.database import get_db
from app.models.enums import QuotationSource
from app.schemas.quotation import (
    AcceptQuotationRequest,
    CompareRequest,
    CompareResponse,
    GenerateQuotationRequest,
    IneligibleOption,
    QuotationOut,
    RejectQuotationRequest,
    RiskNoteOut,
)
from app.services import storage_service
from app.services.quote_service import (
    QuoteServiceError,
    accept_quotation,
    generate_quotation,
    get_quotation_full,
    list_eligible_options,
    reject_quotation,
)
from app.services.vehicle_age import calculate_vehicle_age

router = APIRouter(prefix="/api/quotes", tags=["client-quotations"])


def _quotation_to_out(q) -> QuotationOut:
    snapshot_data = q.snapshot.data if q.snapshot else {}
    return QuotationOut(
        id=q.id,
        quotation_number=q.quotation_number,
        status=q.status,
        client_name=q.client.full_name,
        vehicle_registration=q.vehicle.registration_no,
        insurer_name=q.insurer.name,
        vehicle_class_label=q.vehicle_class_label,
        cover_type=q.cover_type,
        sum_insured=float(q.sum_insured),
        basic_premium=float(q.basic_premium),
        subtotal=float(q.subtotal),
        levies=float(q.levies),
        stamp_duty=float(q.stamp_duty),
        total_premium=float(q.total_premium),
        amount_paid=float(q.amount_paid),
        balance=float(q.balance),
        items=[{"label": i.label, "amount": float(i.amount)} for i in sorted(q.items, key=lambda x: x.sort_order)],
        excess=snapshot_data.get("excess", []),
        benefits=snapshot_data.get("benefits", []),
        limits=snapshot_data.get("limits", []),
        year_of_manufacture=snapshot_data.get("year_of_manufacture"),
        calculated_age_years=snapshot_data.get("calculated_age_years"),
        generated_at=q.generated_at,
        accepted_at=q.accepted_at,
        rejected_at=q.rejected_at,
        expires_at=q.expires_at,
        locked=q.locked,
        has_risk_note=q.risk_note is not None,
        created_at=q.created_at,
    )


@router.post("/compare", response_model=CompareResponse)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
def compare_insurers(request: Request, payload: CompareRequest, db: Session = Depends(get_db)):
    options, ineligible = list_eligible_options(
        db,
        category=payload.category,
        sum_insured=payload.sum_insured,
        options=payload.options,
        year_of_manufacture=payload.vehicle.year_of_manufacture,
    )
    if not options:
        detail = "No insurer currently offers this vehicle class at the given Sum Insured and vehicle age. Try adjusting the Sum Insured or vehicle class."
        if ineligible:
            detail += " " + " | ".join(i["reason"].replace("\n", " ") for i in ineligible)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return CompareResponse(
        category=payload.category,
        sum_insured=payload.sum_insured,
        calculated_age_years=calculate_vehicle_age(payload.vehicle.year_of_manufacture),
        options=options,
        ineligible_options=[IneligibleOption(**i) for i in ineligible],
    )


@router.post("/generate", response_model=QuotationOut)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
def generate(request: Request, payload: GenerateQuotationRequest, db: Session = Depends(get_db)):
    try:
        quotation = generate_quotation(
            db,
            client_in=payload.client,
            vehicle_in=payload.vehicle,
            insurer_id=payload.insurer_id,
            motor_class_id=payload.motor_class_id,
            sum_insured=payload.sum_insured,
            options=payload.options,
            amount_paid=payload.amount_paid,
            source=QuotationSource.CLIENT_PORTAL,
            created_by=None,
            actor_label=payload.client.email or payload.client.phone,
        )
    except QuoteServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _quotation_to_out(quotation)


@router.get("/{quotation_id}", response_model=QuotationOut)
def get_quotation(quotation_id: uuid.UUID, db: Session = Depends(get_db)):
    quotation = get_quotation_full(db, quotation_id)
    if quotation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    return _quotation_to_out(quotation)


@router.get("/{quotation_id}/pdf")
def download_quotation_pdf(quotation_id: uuid.UUID, db: Session = Depends(get_db)):
    quotation = get_quotation_full(db, quotation_id)
    if quotation is None or quotation.pdf_document_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation PDF not found")
    from app.models.documents_email_audit import Document

    document = db.get(Document, quotation.pdf_document_id)
    content = storage_service.read_bytes(document.storage_path)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{document.filename}"'},
    )


@router.post("/{quotation_id}/accept", response_model=RiskNoteOut)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
def accept(request: Request, quotation_id: uuid.UUID, payload: AcceptQuotationRequest, db: Session = Depends(get_db)):
    quotation = get_quotation_full(db, quotation_id)
    if quotation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    try:
        risk_note = accept_quotation(
            db,
            quotation_id=quotation_id,
            cover_start_date=payload.cover_start_date,
            acceptance_confirmed=payload.acceptance_confirmed,
            actor_label=quotation.client.email or quotation.client.phone,
            actor_id=None,
        )
    except QuoteServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    q = get_quotation_full(db, quotation_id)
    return RiskNoteOut(
        id=risk_note.id,
        risk_note_number=risk_note.risk_note_number,
        quotation_id=quotation_id,
        quotation_number=q.quotation_number,
        status=risk_note.status,
        client_name=q.client.full_name,
        vehicle_registration=q.vehicle.registration_no,
        insurer_name=q.insurer.name,
        cover_type=risk_note.cover_type,
        sum_insured=float(risk_note.sum_insured),
        premium=float(risk_note.premium),
        cover_start_date=risk_note.cover_start_date,
        cover_end_date=risk_note.cover_end_date,
        generated_at=risk_note.generated_at,
    )


@router.post("/{quotation_id}/reject", response_model=QuotationOut)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
def reject(request: Request, quotation_id: uuid.UUID, payload: RejectQuotationRequest, db: Session = Depends(get_db)):
    quotation = get_quotation_full(db, quotation_id)
    if quotation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    try:
        reject_quotation(
            db,
            quotation_id=quotation_id,
            reason=payload.reason,
            actor_label=quotation.client.email or quotation.client.phone,
            actor_id=None,
        )
    except QuoteServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _quotation_to_out(get_quotation_full(db, quotation_id))
