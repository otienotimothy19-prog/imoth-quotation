"""System settings: Imoth company info, numbering, levies, PDF footer,
conditions text, quotation validity. Backed by the `system_settings`
key/value table so admins can edit them without a code change. SMTP
credentials are intentionally NOT stored here -- they stay in environment
variables (see app.core.config.settings) and are never exposed to the API.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings as env_settings
from app.models.documents_email_audit import SystemSetting

DEFAULT_SETTINGS: dict = {
    "company.name": "Imoth Insurance Brokers Limited",
    "company.tagline": "Insurance | Health | Pension",
    "company.address": "P.O. Box 23280 – 00100, Nairobi, Wabera Street, Salama House, Suite 305",
    "company.phone": "0759 642 797",
    "company.email": "insurance@imoth.co.ke",
    "company.paybill": "4108121",
    "company.logo_document_id": None,
    "quotation.validity_days": env_settings.QUOTATION_VALIDITY_DAYS,
    "levy.rate": env_settings.LEVY_RATE,
    "levy.stamp_duty": env_settings.STAMP_DUTY,
    "pdf.footer_text": (
        "Premiums quoted are inclusive of levies and stamp duty. "
        "Subject to the terms and conditions of the insurer's standard policy wording "
        "and satisfactory underwriting/loss-ratio review."
    ),
    "quotation.conditions": [
        "Valid for the validity period stated from the date of this quotation.",
        "Subject to the terms and conditions of the insurer's standard policy wording and satisfactory underwriting/loss-ratio review.",
        "Final premium confirmed on receipt of full KYC (Proposal Form, Logbook, Driving Licence, KRA PIN, National ID) and, where applicable, a current independent valuation report.",
    ],
    "documents.allowed_mime_types": ["application/pdf", "image/jpeg", "image/png"],
    "documents.max_file_size_mb": 5,
    "risk_note.conditions": [
        "This Risk Note confirms cover has been bound with the insurer named, subject to receipt of full premium and KYC documentation.",
        "Cover is subject to the insurer's standard policy wording, terms, conditions and exclusions.",
        "This Risk Note is not a policy document; the formal policy schedule will follow from the insurer.",
    ],
}


def get_all_settings(db: Session) -> dict:
    rows = db.execute(select(SystemSetting)).scalars().all()
    merged = dict(DEFAULT_SETTINGS)
    for row in rows:
        merged[row.key] = row.value.get("v") if isinstance(row.value, dict) and "v" in row.value else row.value
    return merged


def get_setting(db: Session, key: str, default=None):
    row = db.execute(select(SystemSetting).where(SystemSetting.key == key)).scalar_one_or_none()
    if row is None:
        return DEFAULT_SETTINGS.get(key, default)
    return row.value.get("v") if isinstance(row.value, dict) and "v" in row.value else row.value


def set_setting(db: Session, key: str, value, updated_by: uuid.UUID | None = None) -> None:
    row = db.execute(select(SystemSetting).where(SystemSetting.key == key)).scalar_one_or_none()
    wrapped = {"v": value}
    if row is None:
        row = SystemSetting(key=key, value=wrapped, updated_by=updated_by)
        db.add(row)
    else:
        row.value = wrapped
        row.updated_by = updated_by
    db.flush()
