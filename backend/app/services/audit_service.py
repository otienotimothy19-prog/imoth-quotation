import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.documents_email_audit import AuditLog
from app.models.enums import ActorType


def record(
    db: Session,
    *,
    actor_type: ActorType,
    actor_label: str,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    actor_id: uuid.UUID | None = None,
    previous_value: dict | None = None,
    new_value: dict | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_type=actor_type,
        actor_id=actor_id,
        actor_label=actor_label,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        previous_value=previous_value,
        new_value=new_value,
        ip_address=ip_address,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.flush()
    return entry
