"""Configurable SMTP email service. Credentials come from environment
variables only (app.core.config.settings) and are never exposed via the API.
Every send attempt -- success or failure -- is recorded in `email_logs` so
admins can see delivery status and retry failures. A failed send never
touches the underlying quotation/risk-note records.
"""
import logging
import smtplib
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.documents_email_audit import Document, EmailLog
from app.models.enums import EmailStatus

logger = logging.getLogger("imoth.email")


class EmailNotConfiguredError(Exception):
    pass


def _send_smtp(*, to_email: str, subject: str, body: str, attachments: list[tuple[str, bytes]]) -> None:
    if not settings.SMTP_HOST:
        raise EmailNotConfiguredError("SMTP is not configured (SMTP_HOST is empty)")

    msg = EmailMessage()
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    for filename, content in attachments:
        msg.add_attachment(content, maintype="application", subtype="pdf", filename=filename)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls()
        if settings.SMTP_USERNAME:
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        smtp.send_message(msg)


def send_documents_email(
    db: Session,
    *,
    to_email: str,
    subject: str,
    body: str,
    documents: list[Document],
    initiated_by: str,
    quotation_id: uuid.UUID | None = None,
    risk_note_id: uuid.UUID | None = None,
) -> EmailLog:
    from app.services import storage_service

    log = EmailLog(
        recipient=to_email,
        quotation_id=quotation_id,
        risk_note_id=risk_note_id,
        document_ids=[str(d.id) for d in documents],
        subject=subject,
        initiated_by=initiated_by,
        status=EmailStatus.PENDING,
    )
    db.add(log)
    db.flush()

    try:
        attachments = [(d.filename, storage_service.read_bytes(d.storage_path)) for d in documents]
        _send_smtp(to_email=to_email, subject=subject, body=body, attachments=attachments)
        log.status = EmailStatus.SENT
        log.sent_at = datetime.now(timezone.utc)
        log.error_message = None
    except Exception as exc:  # noqa: BLE001 -- must never bubble up and corrupt quotation/risk-note state
        logger.warning("Email send failed to %s: %s", to_email, exc)
        log.status = EmailStatus.FAILED
        log.error_message = str(exc)

    db.flush()
    return log


def retry_email(db: Session, log: EmailLog) -> EmailLog:
    from app.models.documents_email_audit import Document as DocumentModel
    from app.services import storage_service

    documents = db.query(DocumentModel).filter(DocumentModel.id.in_(log.document_ids)).all()
    log.retry_count += 1
    try:
        attachments = [(d.filename, storage_service.read_bytes(d.storage_path)) for d in documents]
        _send_smtp(to_email=log.recipient, subject=log.subject, body="Please find your requested Imoth document(s) attached.", attachments=attachments)
        log.status = EmailStatus.SENT
        log.sent_at = datetime.now(timezone.utc)
        log.error_message = None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Email retry failed to %s: %s", log.recipient, exc)
        log.status = EmailStatus.FAILED
        log.error_message = str(exc)
    db.flush()
    return log
