from datetime import datetime

from pydantic import BaseModel

from app.models.client_document import RequiredDocumentType, VerificationStatus


class ClientDocumentOut(BaseModel):
    id: str
    document_type: RequiredDocumentType
    label: str
    original_filename: str
    mime_type: str
    file_size_bytes: int
    uploaded_at: datetime
    verification_status: VerificationStatus

    model_config = {"from_attributes": True}


class RequiredDocumentSlot(BaseModel):
    document_type: RequiredDocumentType
    label: str
    description: str
    uploaded: bool
    document: ClientDocumentOut | None = None


class DocumentUploadStatusOut(BaseModel):
    quotation_id: str
    uploaded_count: int
    required_count: int
    all_uploaded: bool
    allowed_mime_types: list[str]
    max_file_size_mb: int
    slots: list[RequiredDocumentSlot]
