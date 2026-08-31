import enum


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    STAFF = "STAFF"


class QuotationStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    GENERATED = "GENERATED"
    SENT = "SENT"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class RiskNoteStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    VOID = "VOID"
    CANCELLED = "CANCELLED"
    SUPERSEDED = "SUPERSEDED"


class DocumentType(str, enum.Enum):
    QUOTATION = "QUOTATION"
    RISK_NOTE = "RISK_NOTE"


class EmailStatus(str, enum.Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"


class ActorType(str, enum.Enum):
    CLIENT = "CLIENT"
    ADMIN = "ADMIN"
    SYSTEM = "SYSTEM"


class QuotationSource(str, enum.Enum):
    CLIENT_PORTAL = "CLIENT_PORTAL"
    ADMIN_PANEL = "ADMIN_PANEL"
    API = "API"
