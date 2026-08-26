import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_client_ip, require_admin, require_super_admin
from app.core.security import hash_password
from app.database import get_db
from app.models.enums import ActorType
from app.models.user import User
from app.schemas.auth import UserCreate, UserOut, UserUpdate
from app.services import audit_service

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    return db.query(User).order_by(User.full_name).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_super_admin)):
    email = payload.email.lower()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A user with this email already exists")

    new_user = User(
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        is_active=True,
    )
    db.add(new_user)
    db.flush()

    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="admin_user_created", entity_type="user", entity_id=str(new_user.id),
        new_value={"email": email, "role": payload.role.value}, ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(new_user)
    return new_user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: uuid.UUID, payload: UserUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_super_admin)):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    data = payload.model_dump(exclude_unset=True)
    previous = {k: getattr(target, k) for k in data if k != "password" and hasattr(target, k)}

    if "password" in data:
        password = data.pop("password")
        if password:
            target.password_hash = hash_password(password)
    for k, v in data.items():
        setattr(target, k, v)

    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="admin_user_changed", entity_type="user", entity_id=str(target.id),
        previous_value={k: str(v) for k, v in previous.items()}, new_value={k: str(v) for k, v in data.items()},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(target)
    return target
