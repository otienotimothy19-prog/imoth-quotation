"""Endpoints for the agent app. Agents create quotations through the
shared /api/admin/quotations endpoint (require_any_staff) and read the
insurer/class lists from the admin routers; everything here is scoped to
the logged-in agent's own quotations."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_agent
from app.api.routers.admin_quotations import _summary
from app.database import get_db
from app.models.client_vehicle import Client, Vehicle
from app.models.quotation import Quotation
from app.models.user import User

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.get("/quotations")
def my_quotations(
    q: str | None = Query(default=None, description="Search: quotation number, client name, or registration no"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_agent),
):
    query = (
        db.query(Quotation)
        .join(Client, Quotation.client_id == Client.id)
        .join(Vehicle, Quotation.vehicle_id == Vehicle.id)
        .options(
            joinedload(Quotation.client),
            joinedload(Quotation.vehicle),
            joinedload(Quotation.insurer),
            joinedload(Quotation.risk_note),
            joinedload(Quotation.created_by_user),
        )
        .filter(Quotation.created_by_id == user.id)
    )
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(Quotation.quotation_number.ilike(like), Client.full_name.ilike(like), Vehicle.registration_no.ilike(like))
        )
    total = query.count()
    rows = query.order_by(Quotation.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": [_summary(r) for r in rows]}
