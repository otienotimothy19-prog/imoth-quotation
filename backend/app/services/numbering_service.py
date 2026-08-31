"""Atomic quotation / risk-note numbering: QT-2026-000001, RN-2026-000001.

Uses SELECT ... FOR UPDATE on a per (doc_type, year) counter row so
concurrent requests can never be handed the same number.
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.documents_email_audit import DocumentCounter

QUOTATION_PREFIX = "QT"
RISK_NOTE_PREFIX = "RN"


def _next_seq(db: Session, doc_type: str, year: int) -> int:
    counter = db.execute(
        select(DocumentCounter)
        .where(DocumentCounter.doc_type == doc_type, DocumentCounter.year == year)
        .with_for_update()
    ).scalar_one_or_none()

    if counter is None:
        counter = DocumentCounter(doc_type=doc_type, year=year, seq=0)
        db.add(counter)
        db.flush()
        # Re-select with lock to guard against a concurrent insert race.
        counter = db.execute(
            select(DocumentCounter)
            .where(DocumentCounter.doc_type == doc_type, DocumentCounter.year == year)
            .with_for_update()
        ).scalar_one()

    counter.seq += 1
    db.flush()
    return counter.seq


def generate_quotation_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    seq = _next_seq(db, QUOTATION_PREFIX, year)
    return f"{QUOTATION_PREFIX}-{year}-{seq:06d}"


def generate_risk_note_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    seq = _next_seq(db, RISK_NOTE_PREFIX, year)
    return f"{RISK_NOTE_PREFIX}-{year}-{seq:06d}"
