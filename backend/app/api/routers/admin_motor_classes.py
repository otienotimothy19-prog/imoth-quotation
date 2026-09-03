import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, require_admin
from app.database import get_db
from app.models.enums import ActorType
from app.models.insurer_rate import Insurer, MotorClass, RateVersion
from app.models.quotation import Quotation
from app.models.user import User
from app.schemas.admin import MotorClassCreate, MotorClassUpdate
from app.services import audit_service
from app.services.rate_config import motor_class_to_dict, rate_version_snapshot

router = APIRouter(prefix="/api/admin/motor-classes", tags=["admin-motor-classes"])


def _class_out(mc: MotorClass) -> dict:
    d = motor_class_to_dict(mc)
    d["insurer_id"] = str(mc.insurer_id)
    d["insurer_code"] = mc.insurer.code
    d["insurer_name"] = mc.insurer.name
    d["active"] = mc.active
    d["created_at"] = mc.created_at
    return d


@router.get("")
def list_motor_classes(
    insurer_id: uuid.UUID | None = Query(default=None),
    category: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    q = db.query(MotorClass).options(joinedload(MotorClass.insurer), joinedload(MotorClass.rate_bands))
    if insurer_id:
        q = q.filter(MotorClass.insurer_id == insurer_id)
    if category:
        q = q.filter(MotorClass.category == category)
    return [_class_out(mc) for mc in q.order_by(MotorClass.category, MotorClass.label).all()]


@router.get("/{motor_class_id}")
def get_motor_class(motor_class_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    mc = (
        db.query(MotorClass)
        .options(joinedload(MotorClass.insurer), joinedload(MotorClass.rate_bands))
        .filter(MotorClass.id == motor_class_id)
        .one_or_none()
    )
    if mc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Motor class not found")
    return _class_out(mc)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_motor_class(payload: MotorClassCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    insurer = db.get(Insurer, payload.insurer_id)
    if insurer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Insurer not found")
    if db.query(MotorClass).filter_by(insurer_id=insurer.id, code=payload.code).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A class with this code already exists for this insurer")

    mc = MotorClass(
        insurer_id=insurer.id,
        code=payload.code,
        label=payload.label,
        category=payload.category,
        max_age=payload.max_age,
        min_si=payload.min_si,
        max_si=payload.max_si,
        has_lr_toggle=payload.has_lr_toggle,
        pll_per_seat=payload.pll_per_seat,
        pll_options=[o.model_dump() for o in payload.pll_options] if payload.pll_options else None,
        flat_only=payload.flat_only.model_dump() if payload.flat_only else None,
        excess=payload.excess,
        benefits=payload.benefits,
        limits=payload.limits,
        active=True,
    )
    db.add(mc)
    db.flush()

    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="motor_class_created", entity_type="motor_class", entity_id=str(mc.id),
        new_value={"insurer": insurer.code, "code": mc.code}, ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(mc)
    return _class_out(mc)


@router.delete("/{motor_class_id}")
def delete_motor_class(motor_class_id: uuid.UUID, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Permanently removes a motor class. Only allowed when no quotation has
    ever been generated against it -- once a Quotation references a class,
    it must be kept (as a record, even if wrong) and Disabled instead, so
    that quotation/risk-note history never loses its pricing context. Rate
    bands and rate-version history for the class cascade-delete with it at
    the database level."""
    mc = db.query(MotorClass).options(joinedload(MotorClass.insurer)).filter(MotorClass.id == motor_class_id).one_or_none()
    if mc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Motor class not found")

    quotation_count = db.query(Quotation).filter(Quotation.motor_class_id == mc.id).count()
    if quotation_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot delete: {quotation_count} quotation(s) already reference this class. "
                "Disable it instead to hide it from new quotations without losing that history."
            ),
        )

    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="motor_class_deleted", entity_type="motor_class", entity_id=str(mc.id),
        previous_value={"insurer": mc.insurer.code, "code": mc.code, "label": mc.label},
        ip_address=get_client_ip(request),
    )
    db.delete(mc)
    db.commit()
    return {"deleted": True, "id": str(motor_class_id)}


@router.patch("/{motor_class_id}")
def update_motor_class(motor_class_id: uuid.UUID, payload: MotorClassUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    mc = db.query(MotorClass).options(joinedload(MotorClass.insurer)).filter(MotorClass.id == motor_class_id).one_or_none()
    if mc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Motor class not found")

    data = payload.model_dump(exclude_unset=True)
    change_reason = data.pop("change_reason", None)
    previous = {k: getattr(mc, k) for k in data if hasattr(mc, k)}
    if "pll_options" in data and data["pll_options"] is not None:
        data["pll_options"] = [o if isinstance(o, dict) else o.model_dump() for o in data["pll_options"]]
    if "flat_only" in data and data["flat_only"] is not None:
        data["flat_only"] = data["flat_only"] if isinstance(data["flat_only"], dict) else data["flat_only"].model_dump()
    for k, v in data.items():
        setattr(mc, k, v)
    db.flush()

    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="motor_class_changed", entity_type="motor_class", entity_id=str(mc.id),
        previous_value={k: str(v) for k, v in previous.items()}, new_value={k: str(v) for k, v in data.items()},
        ip_address=get_client_ip(request),
    )

    # A change_reason means this edit should also be versioned like a
    # standard rate change -- primarily for flat-rate products, which have
    # no RateBand rows of their own to version through the Rates PUT.
    if change_reason:
        last_version = (
            db.query(RateVersion)
            .filter(RateVersion.motor_class_id == mc.id)
            .order_by(RateVersion.version_no.desc())
            .first()
        )
        db.refresh(mc)
        db.add(
            RateVersion(
                motor_class_id=mc.id,
                version_no=(last_version.version_no + 1) if last_version else 1,
                data=rate_version_snapshot(mc),
                change_reason=change_reason,
                created_by=user.id,
            )
        )

    db.commit()
    db.refresh(mc)
    return _class_out(mc)
