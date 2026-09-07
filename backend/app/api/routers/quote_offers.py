"""Secured anonymous offers reuse the locked QuoteSelection snapshot and audit store."""
import uuid
import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.deps import get_quote_access_subject, require_quote_subject_match
from app.core.config import settings
from app.core.limiter import limiter
from app.core.security import create_quote_access_token
from app.database import get_db
from app.models.quote_selection import QuoteSelection
from app.models.documents_email_audit import AuditLog
from app.models.enums import ActorType, QuoteSelectionStatus
from app.services import audit_service, email_service, offer_pdf_service
from app.services.quote_service import _company_settings

router = APIRouter(prefix='/api/quote-offers', tags=['quote-offers'])


class PlateLookup(BaseModel):
    registration_no: str

    @field_validator('registration_no')
    @classmethod
    def normalize(cls, value):
        value = re.sub(r'[\s-]', '', value.upper())
        if not re.fullmatch(r'[A-Z0-9]{4,15}', value):
            raise ValueError('Enter a valid vehicle number plate.')
        return value


@router.post('/retrieve')
@limiter.limit('10/minute')
def retrieve(request: Request, payload: PlateLookup, db: Session = Depends(get_db)):
    # Number plates retrieve only anonymous, unaccepted offers, never customer records.
    offers = db.execute(select(QuoteSelection).where(
        func.regexp_replace(func.upper(QuoteSelection.registration_no), '[^A-Z0-9]', '', 'g') == payload.registration_no,
        QuoteSelection.status == QuoteSelectionStatus.OFFERED,
        QuoteSelection.expires_at > datetime.now(timezone.utc),
    ).order_by(QuoteSelection.created_at.desc()).limit(100)).scalars().all()
    results = []
    seen = set()
    for offer in offers:
        key = (offer.insurer_id, offer.motor_class_id)
        if key in seen:
            continue
        seen.add(key)
        data = summary(offer)
        minutes = max(1, int((offer.expires_at-datetime.now(timezone.utc)).total_seconds()/60))
        # Retrieval grants offer access only, not access to personal details.
        data['access_token'] = create_quote_access_token(f'offer:{offer.id}', minutes)
        results.append(data)
    return {'offers': results}


class EmailRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: EmailStr

    @field_validator('email', mode='before')
    @classmethod
    def normalize(cls, value):
        if not isinstance(value, str) or any(ord(c) < 32 or ord(c) == 127 for c in value):
            raise ValueError('Enter a valid email address.')
        return value.strip()


def authorized_offer(offer_id: uuid.UUID, db: Session = Depends(get_db), subject: str = Depends(get_quote_access_subject)):
    require_quote_subject_match(subject.removeprefix('offer:'), offer_id)
    offer = db.execute(select(QuoteSelection).where(QuoteSelection.id == offer_id).with_for_update()).scalar_one_or_none()
    if offer is None:
        raise HTTPException(404, 'Quotation offer not found.')
    if offer.expires_at <= datetime.now(timezone.utc) or offer.status not in (
        QuoteSelectionStatus.OFFERED, QuoteSelectionStatus.SELECTED_PENDING_DETAILS
    ):
        raise HTTPException(410, 'This quotation offer has expired or has already been accepted. Please compare quotes again.')
    return offer


def record(db, offer, request, action, **values):
    entry = audit_service.record(db, actor_type=ActorType.CLIENT, actor_label='Prospective Client',
        action=action, entity_type='quote_offer', entity_id=str(offer.id),
        ip_address=request.client.host if request.client else None,
        new_value={'insurer': offer.snapshot_data['insurer_name'], **values})
    db.commit()
    return entry


def summary(offer, *, offer_only=True):
    # Token lifetime is bounded by the persisted expiry on every endpoint.
    minutes = max(1, int((offer.expires_at-datetime.now(timezone.utc)).total_seconds()/60))
    subject = f'offer:{offer.id}' if offer_only else str(offer.id)
    return dict(selection_id=str(offer.id), status=offer.status.value, access_token=create_quote_access_token(subject, minutes),
        expires_at=offer.expires_at, insurer_name=offer.snapshot_data['insurer_name'], vehicle_class_label=offer.vehicle_class_label,
        cover_type=offer.cover_type, items=offer.items,
        **{key: float(getattr(offer,key)) for key in ('sum_insured','basic_premium','subtotal','levies','stamp_duty','total_premium')})


@router.get('/{offer_id}')
def get_offer(offer: QuoteSelection = Depends(authorized_offer)):
    return summary(offer)


@router.post('/{offer_id}/select')
def select_offer(request: Request, offer: QuoteSelection = Depends(authorized_offer), db: Session = Depends(get_db),
                 subject: str = Depends(get_quote_access_subject)):
    if subject.startswith('offer:') and offer.status != QuoteSelectionStatus.OFFERED:
        raise HTTPException(409, 'Acceptance has already started. Please use your existing acceptance session.')
    if offer.status == QuoteSelectionStatus.OFFERED:
        offer.status = QuoteSelectionStatus.SELECTED_PENDING_DETAILS
        offer.snapshot_data = {**offer.snapshot_data, 'offer_selected': True}
        record(db, offer, request, 'quote_selected', status=offer.status.value)
    return summary(offer, offer_only=False)


@router.get('/{offer_id}/pdf')
@limiter.limit('20/minute')
def download(request: Request, offer: QuoteSelection = Depends(authorized_offer), db: Session = Depends(get_db)):
    try:
        content = offer_pdf_service.render_offer_pdf(offer, _company_settings(db))
    except Exception:
        record(db, offer, request, 'pdf_downloaded', status='failed', error='PDF generation failed')
        raise HTTPException(503, 'Could not prepare the PDF. Please try again.')
    record(db, offer, request, 'pdf_downloaded', status='success')
    return Response(content, media_type='application/pdf', headers={
        'Content-Disposition': f'attachment; filename="{offer_pdf_service.filename(offer)}"',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})


@router.post('/{offer_id}/email')
@limiter.limit('5/minute')
def email(request: Request, payload: EmailRequest, idempotency_key: uuid.UUID = Header(),
          offer: QuoteSelection = Depends(authorized_offer), db: Session = Depends(get_db)):
    recipient = str(payload.email)
    # The offer row lock serializes reservations across all application workers.
    attempts = db.execute(select(AuditLog).where(AuditLog.entity_type == 'quote_offer',
        AuditLog.entity_id == str(offer.id), AuditLog.action == 'email_sent')).scalars().all()
    for attempt in attempts:
        data = attempt.new_value
        if data.get('key') == str(idempotency_key):
            if data.get('recipient') != recipient:
                raise HTTPException(409, 'This delivery request was already used for another address.')
            if data.get('status') == 'sent':
                return {'message': f'Quotation sent successfully to {recipient}'}
            raise HTTPException(409, 'This delivery was already attempted. Check its result before sending again.')
    if len(attempts) >= 5:
        raise HTTPException(429, 'This quotation has reached its email sharing limit. Please download the PDF.')
    if any(a.new_value.get('recipient') == recipient and a.new_value.get('status') in ('pending', 'sent') for a in attempts):
        raise HTTPException(409, 'This quotation is already being sent or has been sent to this address.')
    entry = record(db, offer, request, 'email_sent', status='pending', recipient=recipient, key=str(idempotency_key))
    try:
        content = offer_pdf_service.render_offer_pdf(offer, _company_settings(db))
        token = summary(offer)['access_token']
        link = f"{settings.PUBLIC_APP_URL.rstrip('/')}/quote/offer/{offer.id}#token={token}"
        body = (f"{offer_pdf_service.OFFER_TITLE}\n{offer_pdf_service.OFFER_NOTICE}\n\n"
                f"Hello,\n\nPlease find attached the motor insurance quotation you requested from Imoth Insurance Brokers.\n\n"
                f"Insurer: {offer.snapshot_data['insurer_name']}\nCover: {offer.cover_type.replace('_', ' ').title()}\n"
                f"Vehicle: {offer.registration_no}\nTotal Premium: KES {float(offer.total_premium):,.2f}\n"
                f"Valid Until: {offer.expires_at.astimezone(timezone.utc):%d %b %Y %H:%M UTC}\n\n"
                f"You can return to your quotation using the secure link below:\n\n{link}\n\n"
                'Kind regards,\nImoth Insurance Brokers')
        email_service._send_smtp(to_email=recipient,
            subject='Your Motor Insurance Quotation from Imoth Insurance Brokers', body=body,
            attachments=[(offer_pdf_service.filename(offer), content)])
    except Exception:
        # Do not persist exception strings from SMTP: they can contain credentials.
        entry.new_value = {**entry.new_value, 'status': 'failed', 'error': 'Quotation delivery failed'}
        db.commit()
        raise HTTPException(503, 'Could not send the quotation. Please try again shortly or download the PDF.')
    entry.new_value = {**entry.new_value, 'status': 'sent', 'completed_at': datetime.now(timezone.utc).isoformat()}
    db.commit()
    return {'message': f'Quotation sent successfully to {recipient}'}
