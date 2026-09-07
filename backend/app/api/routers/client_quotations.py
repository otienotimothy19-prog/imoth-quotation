import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_quote_access_subject, require_quote_subject_match
from app.core.config import settings
from app.core.limiter import limiter
from app.core.security import create_quote_access_token
from app.database import get_db
from app.models.enums import QuotationSource, QuoteSelectionStatus
from app.schemas.quotation import (
    AcceptQuotationRequest,
    CompareRequest,
    CompareResponse,
    CustomerAttachOut,
    CustomerIn,
    GenerateQuotationRequest,
    IneligibleOption,
    QuotationOut,
    QuoteSelectionOut,
    RejectQuotationRequest,
    RiskNoteOut,
    SelectQuoteRequest,
)
from app.services import storage_service
from app.services.quote_selection_service import QuoteSelectionError, attach_customer, get_selection, select_quote
from app.services.quote_service import (
    QuoteServiceError,
    accept_quotation,
    generate_quotation,
    get_quotation_full,
    list_eligible_options,
    reject_quotation,
)
from app.services.settings_service import get_setting
from app.services.vehicle_age import calculate_vehicle_age

router = APIRouter(prefix="/api/quotes", tags=["client-quotations"])


def _quotation_to_out(q) -> QuotationOut:
    snapshot_data = q.snapshot.data if q.snapshot else {}
    options_used = snapshot_data.get("options_used") or {}
    calculation = snapshot_data.get("calculation") or {}
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
        commercial_use=options_used.get("commercial_use"),
        tonnage=options_used.get("tonnage"),
        institution_type=options_used.get("institution_type"),
        institutional_vehicle_type=options_used.get("institutional_vehicle_type"),
        passenger_category=options_used.get("passenger_category"),
        passenger_seats=options_used.get("pll_seats") or None,
        pll_rate=calculation.get("pll_rate"),
        pll_amount=calculation.get("pll_amount"),
        pll_included=bool(calculation.get("pll_included")),
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
        commercial_use=payload.commercial_use,
        institution_type=payload.institution_type,
        institutional_vehicle_type=payload.institutional_vehicle_type,
        passenger_category=payload.passenger_category,
    )
    if not options:
        detail = "No insurer currently offers this vehicle class at the given Sum Insured and vehicle age. Try adjusting the Sum Insured or vehicle class."
        if ineligible:
            detail += " " + " | ".join(i["reason"].replace("\n", " ") for i in ineligible)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    for option in options:
        if option["tonnage_required"] and not payload.options.tonnage:
            continue  # Not yet a priceable offer; retain the existing tonnage prompt.
        selection = select_quote(
            db, category=payload.category, vehicle_in=payload.vehicle,
            insurer_id=option["insurer_id"], motor_class_id=option["motor_class_id"],
            sum_insured=payload.sum_insured, options=payload.options,
            commercial_use=payload.commercial_use, institution_type=payload.institution_type,
            institutional_vehicle_type=payload.institutional_vehicle_type,
            passenger_category=payload.passenger_category, as_offer=True,
        )
        option.update(
            offer_id=selection.id,
            offer_token=create_quote_access_token(str(selection.id), get_setting(db, "quote_selection.validity_minutes", 60)),
            offer_expires_at=selection.expires_at,
            **{field: float(getattr(selection, field)) for field in
               ("basic_premium", "subtotal", "levies", "stamp_duty", "total_premium")},
        )
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
            commercial_use=payload.commercial_use,
            institution_type=payload.institution_type,
            institutional_vehicle_type=payload.institutional_vehicle_type,
            passenger_category=payload.passenger_category,
        )
    except QuoteServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _quotation_to_out(quotation)


@router.post("/select", response_model=QuoteSelectionOut)
@limiter.limit(settings.RATE_LIMIT_ANON)
def select(request: Request, payload: SelectQuoteRequest, db: Session = Depends(get_db)):
    try:
        selection = select_quote(
            db,
            category=payload.category,
            vehicle_in=payload.vehicle,
            insurer_id=payload.insurer_id,
            motor_class_id=payload.motor_class_id,
            sum_insured=payload.sum_insured,
            options=payload.options,
            commercial_use=payload.commercial_use,
            institution_type=payload.institution_type,
            institutional_vehicle_type=payload.institutional_vehicle_type,
            passenger_category=payload.passenger_category,
        )
    except QuoteSelectionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    validity_minutes = get_setting(db, "quote_selection.validity_minutes", 60)
    token = create_quote_access_token(subject=str(selection.id), expires_minutes=validity_minutes)
    return QuoteSelectionOut(
        selection_id=selection.id,
        access_token=token,
        expires_at=selection.expires_at,
        insurer_name=selection.insurer.name,
        vehicle_class_label=selection.vehicle_class_label,
        cover_type=selection.cover_type,
        sum_insured=float(selection.sum_insured),
        basic_premium=float(selection.basic_premium),
        subtotal=float(selection.subtotal),
        levies=float(selection.levies),
        stamp_duty=float(selection.stamp_duty),
        total_premium=float(selection.total_premium),
        items=[{"label": i["label"], "amount": float(i["amount"])} for i in selection.items],
    )


@router.patch("/selections/{selection_id}/customer", response_model=CustomerAttachOut)
@limiter.limit(settings.RATE_LIMIT_ANON)
def submit_customer_details(
    request: Request,
    selection_id: uuid.UUID,
    payload: CustomerIn,
    db: Session = Depends(get_db),
    granted_subject: str = Depends(get_quote_access_subject),
):
    require_quote_subject_match(granted_subject, selection_id)
    selection = get_selection(db, selection_id)
    if selection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation selection not found")
    if selection.status == QuoteSelectionStatus.CONVERTED and selection.converted_quotation_id:
        # Idempotent re-submission (e.g. a repeated click/retry) -- hand
        # back a fresh token for the already-created quotation instead of
        # erroring, so the client can simply move on to the next step.
        token = create_quote_access_token(subject=str(selection.converted_quotation_id), expires_minutes=60 * 24)
        return CustomerAttachOut(quotation_id=selection.converted_quotation_id, access_token=token)

    try:
        quotation = attach_customer(
            db,
            selection=selection,
            customer_in=payload,
            actor_label=payload.email or payload.phone,
        )
    except QuoteSelectionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    token = create_quote_access_token(subject=str(quotation.id), expires_minutes=60 * 24)
    return CustomerAttachOut(quotation_id=quotation.id, access_token=token)


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


@router.post("/{quotation_id}/complete-acceptance", response_model=RiskNoteOut)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
def complete_acceptance(
    request: Request,
    quotation_id: uuid.UUID,
    payload: AcceptQuotationRequest,
    db: Session = Depends(get_db),
    granted_subject: str = Depends(get_quote_access_subject),
):
    require_quote_subject_match(granted_subject, quotation_id)
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
