from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_client_ip, require_admin, require_super_admin
from app.database import get_db
from app.models.enums import ActorType
from app.models.user import User
from app.schemas.admin import SettingsUpdate
from app.services import audit_service
from app.services.settings_service import DEFAULT_SETTINGS, get_all_settings, set_setting

router = APIRouter(prefix="/api/admin/settings", tags=["admin-settings"])

# SMTP credentials and DB connection details live only in environment
# variables (app.core.config.settings) and are intentionally not part of
# this whitelist -- they must never be readable or writable via the API.
ALLOWED_KEYS = set(DEFAULT_SETTINGS.keys())


@router.get("")
def get_settings(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    return get_all_settings(db)


@router.put("")
def update_settings(payload: SettingsUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_super_admin)):
    unknown = set(payload.values.keys()) - ALLOWED_KEYS
    if unknown:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown setting key(s): {', '.join(sorted(unknown))}")

    before = get_all_settings(db)
    for key, value in payload.values.items():
        set_setting(db, key, value, updated_by=user.id)

    audit_service.record(
        db, actor_type=ActorType.ADMIN, actor_label=user.email, actor_id=user.id,
        action="settings_changed", entity_type="system_settings", entity_id=None,
        previous_value={k: before.get(k) for k in payload.values}, new_value=payload.values,
        ip_address=get_client_ip(request),
    )
    db.commit()
    return get_all_settings(db)
