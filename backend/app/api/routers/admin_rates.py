import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_client_ip, require_admin
from app.database import get_db
from app.models.enums import ActorType
from app.models.insurer_rate import MotorClass, RateBand, RateVersion
from app.models.user import User
from app.schemas.admin import RateBandsUpdate
from app.services import audit_service
from app.services.rate_config import motor_class_to_dict, rate_version_snapshot

router = APIRouter(prefix="/api/admin/rates", tags=["admin-rates"])


@router.get("/{motor_class_id}")
def get_rates(motor_class_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    mc = (
        db.query(MotorClass)
        .options(joinedload(MotorClass.rate_bands), joinedload(MotorClass.insurer))
        .filter(MotorClass.id == motor_class_id)
        .one_or_none()
    )
    if mc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Motor class not found")
    if mc.flat_only:
        return {"motor_class_id": str(mc.id), "flat_only": mc.flat_only, "bands": [], "bands_alt": None}
    d = motor_class_to_dict(mc)
    return {"motor_class_id": str(mc.id), "flat_only": None, "bands": d["bands"], "bands_alt": d["bands_alt"], "has_lr_toggle": mc.has_lr_toggle}


@router.put("/{motor_class_id}")
def update_rates(motor_class_id: uuid.UUID, payload: RateBandsUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Replaces the active rate bands for a motor class. Historical
    quotations are never affected -- they carry their own frozen snapshot
    (QuotationSnapshot) taken at generation time. This endpoint records a new
    RateVersion so the change itself is auditable and reversible by an admin
    re-editing back to a prior version's values."""
    mc = (
        db.query(MotorClass)
        .options(joinedload(MotorClass.rate_bands), joinedload(MotorClass.insurer))
        .filter(MotorClass.id == motor_class_id)
        .one_or_none()
    )
    if mc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Motor class not found")
    if mc.flat_only:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This is a flat-rate class; edit flat_only via the motor class endpoint instead")
    if mc.has_lr_toggle and not payload.bands_alt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This class has a Loss-Ratio toggle; bands_alt is required")

    previous_snapshot = rate_version_snapshot(mc)

    # Deactivate (never delete) existing bands, then insert the replacement set.
    for b in mc.rate_bands:
        b.active = False
    db.flush()

    def _insert(bands, variant):
        for i, b in enumerate(bands):
            db.add(
                RateBand(
                    motor_class_id=mc.id,
                    variant=variant,
                    sort_order=i,
                    min_si=b.min_si,
                    max_si=b.max_si,
                    rate=b.rate,
                    min_premium=b.min_premium,
                    min_passengers=b.min_passengers,
                    max_passengers=b.max_passengers,
                    ep_included=b.ep_included,
                    ep_not_offered=b.ep_not_offered,
                    ep_rate=b.ep_rate,
                    ep_min=b.ep_min,
                    ep_mandatory=b.ep_mandatory,
                    pvt_included=b.pvt_included,
                    pvt_not_offered=b.pvt_not_offered,
                    pvt_rate=b.pvt_rate,
                    pvt_min=b.pvt_min,
                    pvt_mandatory=b.pvt_mandatory,
                    active=True,
                )
            )

    _insert(payload.bands, "standard")
    if payload.bands_alt:
        _insert(payload.bands_alt, "alt")
    db.flush()
    db.refresh(mc)

    new_snapshot = rate_version_snapshot(mc)
    last_version = (
        db.query(RateVersion)
        .filter(RateVersion.motor_class_id == mc.id)
        .order_by(RateVersion.version_no.desc())
        .first()
    )
    next_version_no = (last_version.version_no + 1) if last_version else 1
    db.add(
        RateVersion(
            motor_class_id=mc.id,
            version_no=next_version_no,
            data=new_snapshot,
            change_reason=payload.change_reason,
            created_by=user.id,
        )
    )

    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="rate_changed", entity_type="motor_class", entity_id=str(mc.id),
        previous_value={"bands": previous_snapshot.get("bands"), "bands_alt": previous_snapshot.get("bands_alt")},
        new_value={"bands": new_snapshot.get("bands"), "bands_alt": new_snapshot.get("bands_alt"), "reason": payload.change_reason},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(mc)
    return motor_class_to_dict(mc)


@router.get("/{motor_class_id}/versions")
def list_rate_versions(motor_class_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    versions = (
        db.query(RateVersion)
        .filter(RateVersion.motor_class_id == motor_class_id)
        .order_by(RateVersion.version_no.desc())
        .all()
    )
    return [
        {
            "id": str(v.id),
            "version_no": v.version_no,
            "change_reason": v.change_reason,
            "created_at": v.created_at,
            "created_by": str(v.created_by) if v.created_by else None,
        }
        for v in versions
    ]
