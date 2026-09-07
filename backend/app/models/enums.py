import enum


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    STAFF = "STAFF"


class QuotationStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    GENERATED = "GENERATED"
    SENT = "SENT"
    # A real Quotation row created once "About You" is submitted for a
    # quote selected through the anonymous-comparison flow, but before the
    # customer has uploaded all required documents and confirmed
    # acceptance. Behaves exactly like GENERATED for every existing
    # purpose (PDF already rendered, visible to admin) except that
    # accept_quotation() also accepts a transition to ACCEPTED from here.
    DOCUMENTS_PENDING = "DOCUMENTS_PENDING"
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


class InstitutionType(str, enum.Enum):
    SCHOOL = "SCHOOL"
    CHURCH = "CHURCH"
    COMPANY = "COMPANY"
    NGO = "NGO"
    GOVERNMENT = "GOVERNMENT"
    HOSPITAL = "HOSPITAL"
    OTHER = "OTHER"


class InstitutionalVehicleType(str, enum.Enum):
    VAN = "VAN"
    MINIBUS = "MINIBUS"
    BUS = "BUS"
    OTHER = "OTHER"


class PassengerCategory(str, enum.Enum):
    STUDENTS = "STUDENTS"
    STAFF = "STAFF"
    CHURCH_MEMBERS = "CHURCH_MEMBERS"
    GENERAL_INSTITUTIONAL = "GENERAL_INSTITUTIONAL"


class QuoteSelectionStatus(str, enum.Enum):
    """Lifecycle of an anonymous QuoteSelection -- the locked-in choice of
    insurer/class/premium a customer makes on the Compare Quotes step,
    before any personal information exists. Never reachable once
    CONVERTED; a fresh Quotation row (see QuotationStatus) takes over from
    there."""

    SELECTED_PENDING_DETAILS = "SELECTED_PENDING_DETAILS"
    CONVERTED = "CONVERTED"
    EXPIRED = "EXPIRED"
    ABANDONED = "ABANDONED"
