import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_client_ip, require_admin
from app.database import get_db
from app.models.enums import ActorType
from app.models.insurer_rate import Insurer
from app.models.user import User
from app.schemas.admin import InsurerCreate, InsurerOut, InsurerUpdate
from app.services import audit_service, storage_service

router = APIRouter(prefix="/api/admin/insurers", tags=["admin-insurers"])


@router.get("", response_model=list[InsurerOut])
def list_insurers(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    return db.query(Insurer).order_by(Insurer.name).all()


@router.post("", response_model=InsurerOut, status_code=status.HTTP_201_CREATED)
def create_insurer(payload: InsurerCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if db.query(Insurer).filter_by(code=payload.code).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insurer code already exists")
    insurer = Insurer(code=payload.code, name=payload.name, disclaimer=payload.disclaimer, note=payload.note, active=True)
    db.add(insurer)
    db.flush()
    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="insurer_created", entity_type="insurer", entity_id=str(insurer.id),
        new_value={"code": insurer.code, "name": insurer.name}, ip_address=get_client_ip(request),
    )
    db.commit()
    return insurer


@router.patch("/{insurer_id}", response_model=InsurerOut)
def update_insurer(insurer_id: uuid.UUID, payload: InsurerUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    insurer = db.get(Insurer, insurer_id)
    if insurer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Insurer not found")

    previous = {"name": insurer.name, "active": insurer.active, "disclaimer": insurer.disclaimer, "note": insurer.note}
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(insurer, k, v)

    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="insurer_changed", entity_type="insurer", entity_id=str(insurer.id),
        previous_value=previous, new_value=data, ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(insurer)
    return insurer


@router.post("/{insurer_id}/logo", response_model=InsurerOut)
def upload_logo(insurer_id: uuid.UUID, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    insurer = db.get(Insurer, insurer_id)
    if insurer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Insurer not found")
    if file.content_type not in ("image/png", "image/jpeg", "image/svg+xml", "image/webp"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Logo must be a PNG, JPEG, WEBP or SVG image")

    content = file.file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Logo must be under 2MB")

    storage_path, _ = storage_service.save_bytes(content, subdir="insurer_logos", filename=file.filename or f"{insurer.code}.png")
    insurer.logo_path = storage_path

    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="insurer_changed", entity_type="insurer", entity_id=str(insurer.id),
        new_value={"logo_path": storage_path}, ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(insurer)
    return insurer
