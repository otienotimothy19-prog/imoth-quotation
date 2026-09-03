from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.database import get_db
from app.models.enums import QuotationStatus
from app.models.insurer_rate import Insurer
from app.models.quotation import Quotation
from app.models.risk_note import RiskNote
from app.models.user import User

router = APIRouter(prefix="/api/admin/dashboard", tags=["admin-dashboard"])


@router.get("")
def dashboard(
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start date must be before end date")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    base_query = db.query(Quotation)
    if date_from:
        base_query = base_query.filter(Quotation.created_at >= date_from)
    if date_to:
        base_query = base_query.filter(Quotation.created_at <= date_to)

    quotations_today = db.query(func.count(Quotation.id)).filter(Quotation.created_at >= today_start).scalar()
    quotations_this_month = db.query(func.count(Quotation.id)).filter(Quotation.created_at >= month_start).scalar()
    accepted = base_query.filter(Quotation.status == QuotationStatus.ACCEPTED).count()
    rejected = base_query.filter(Quotation.status == QuotationStatus.REJECTED).count()
    total_in_range = base_query.count()
    conversion_rate = round((accepted / total_in_range) * 100, 1) if total_in_range else 0.0
    total_quoted_premium = base_query.with_entities(func.coalesce(func.sum(Quotation.total_premium), 0)).scalar()
    risk_notes_generated = db.query(func.count(RiskNote.id)).join(Quotation, RiskNote.quotation_id == Quotation.id)
    if date_from:
        risk_notes_generated = risk_notes_generated.filter(Quotation.created_at >= date_from)
    if date_to:
        risk_notes_generated = risk_notes_generated.filter(Quotation.created_at <= date_to)
    risk_notes_generated = risk_notes_generated.scalar()

    by_insurer = (
        db.query(Insurer.name, func.count(Quotation.id), func.coalesce(func.sum(Quotation.total_premium), 0))
        .join(Quotation, Quotation.insurer_id == Insurer.id)
        .group_by(Insurer.name)
        .order_by(func.count(Quotation.id).desc())
        .all()
    )
    by_vehicle_class = (
        db.query(Quotation.vehicle_class_label, func.count(Quotation.id))
        .group_by(Quotation.vehicle_class_label)
        .order_by(func.count(Quotation.id).desc())
        .limit(10)
        .all()
    )

    recent_quotations = (
        db.query(Quotation)
        .order_by(Quotation.created_at.desc())
        .limit(5)
        .all()
    )
    recent_risk_notes = (
        db.query(RiskNote)
        .order_by(RiskNote.generated_at.desc())
        .limit(5)
        .all()
    )

    return {
        "quotations_today": quotations_today,
        "quotations_this_month": quotations_this_month,
        "accepted_quotations": accepted,
        "rejected_quotations": rejected,
        "conversion_rate_pct": conversion_rate,
        "total_quoted_premium": float(total_quoted_premium or 0),
        "risk_notes_generated": risk_notes_generated,
        "by_insurer": [{"insurer": n, "count": c, "total_premium": float(t)} for n, c, t in by_insurer],
        "by_vehicle_class": [{"vehicle_class": n, "count": c} for n, c in by_vehicle_class],
        "recent_quotations": [
            {
                "id": str(q.id), "quotation_number": q.quotation_number, "status": q.status.value,
                "total_premium": float(q.total_premium), "created_at": q.created_at,
                "client_name": q.client.full_name, "registration_no": q.vehicle.registration_no,
            }
            for q in recent_quotations
        ],
        "recent_risk_notes": [
            {
                "id": str(r.id), "risk_note_number": r.risk_note_number, "status": r.status.value,
                "premium": float(r.premium), "generated_at": r.generated_at,
            }
            for r in recent_risk_notes
        ],
    }
