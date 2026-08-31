import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.limiter import limiter
from app.database import get_db
from app.models.client_document import REQUIRED_DOCUMENT_TYPES, RequiredDocumentType
from app.schemas.client_document import ClientDocumentOut, DocumentUploadStatusOut, RequiredDocumentSlot
from app.services import client_document_service
from app.services.client_document_service import DOCUMENT_LABELS, ClientDocumentError
from app.services.quote_service import get_quotation_full
from app.services.settings_service import get_setting

router = APIRouter(prefix="/api/quotes", tags=["client-documents-upload"])


def _document_out(upload) -> ClientDocumentOut:
    return ClientDocumentOut(
        id=str(upload.id),
        document_type=upload.document_type,
        label=DOCUMENT_LABELS[upload.document_type]["label"],
        original_filename=upload.original_filename,
        mime_type=upload.mime_type,
        file_size_bytes=upload.file_size_bytes,
        uploaded_at=upload.uploaded_at,
        verification_status=upload.verification_status,
    )


def _status_response(db: Session, quotation_id: uuid.UUID) -> DocumentUploadStatusOut:
    active = client_document_service.list_active_documents(db, quotation_id)
    slots = []
    for doc_type in REQUIRED_DOCUMENT_TYPES:
        meta = DOCUMENT_LABELS[doc_type]
        upload = active.get(doc_type)
        slots.append(
            RequiredDocumentSlot(
                document_type=doc_type,
                label=meta["label"],
                description=meta["description"],
                uploaded=upload is not None,
                document=_document_out(upload) if upload else None,
            )
        )
    return DocumentUploadStatusOut(
        quotation_id=str(quotation_id),
        uploaded_count=len(active),
        required_count=len(REQUIRED_DOCUMENT_TYPES),
        all_uploaded=len(active) == len(REQUIRED_DOCUMENT_TYPES),
        allowed_mime_types=get_setting(db, "documents.allowed_mime_types"),
        max_file_size_mb=get_setting(db, "documents.max_file_size_mb"),
        slots=slots,
    )


@router.get("/{quotation_id}/documents/status", response_model=DocumentUploadStatusOut)
def get_upload_status(quotation_id: uuid.UUID, db: Session = Depends(get_db)):
    quotation = get_quotation_full(db, quotation_id)
    if quotation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    return _status_response(db, quotation_id)


@router.post("/{quotation_id}/documents/{document_type}", response_model=DocumentUploadStatusOut)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
def upload_document(
    request: Request,
    quotation_id: uuid.UUID,
    document_type: RequiredDocumentType,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    quotation = get_quotation_full(db, quotation_id)
    if quotation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")

    try:
        client_document_service.upload_client_document(
            db,
            quotation=quotation,
            document_type=document_type,
            file=file,
            actor_label=quotation.client.email or quotation.client.phone,
        )
    except ClientDocumentError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return _status_response(db, quotation_id)


@router.delete("/{quotation_id}/documents/{document_type}", response_model=DocumentUploadStatusOut)
def remove_document(quotation_id: uuid.UUID, document_type: RequiredDocumentType, db: Session = Depends(get_db)):
    quotation = get_quotation_full(db, quotation_id)
    if quotation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")

    try:
        client_document_service.remove_client_document(
            db,
            quotation=quotation,
            document_type=document_type,
            actor_label=quotation.client.email or quotation.client.phone,
        )
    except ClientDocumentError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return _status_response(db, quotation_id)
