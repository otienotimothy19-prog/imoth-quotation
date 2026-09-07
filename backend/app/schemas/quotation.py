import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models.enums import InstitutionalVehicleType, InstitutionType, PassengerCategory, QuotationStatus, RiskNoteStatus
from app.services.vehicle_age import MIN_MANUFACTURE_YEAR, current_year

_KENYAN_PHONE_RE = re.compile(r"^(?:\+?254|0)([17]\d{8})$")
_KRA_PIN_RE = re.compile(r"^[A-Za-z]\d{9}[A-Za-z]$")


def normalize_kenyan_phone(value: str) -> str:
    """Accepts 07xx/01xx local format or +254/254-prefixed, and always
    returns the same canonical 2547xxxxxxxx/2541xxxxxxxx form -- so two
    customers who typed the same number differently (e.g. "0712 345 678"
    vs "+254712345678") are recognised as the same phone number wherever
    it's compared (get_or_create_client's lookup key)."""
    digits = re.sub(r"[\s-]", "", value or "")
    match = _KENYAN_PHONE_RE.match(digits)
    if not match:
        raise ValueError("Enter a valid Kenyan phone number, e.g. 07XX XXX XXX.")
    return f"254{match.group(1)}"

# Sub-uses of category="commercial" a customer may actually select. Hybrid /
# private_hire / online_hailed / tanker classes still exist and are
# admin-manageable, but are never offered as a customer-facing branch.
CUSTOMER_FACING_COMMERCIAL_USES = ("own_goods", "general_cartage", "commercial_institutional", "commercial_tuktuk")


def _validate_commercial_use_intake(commercial_use: str | None, institution_type, institutional_vehicle_type, passenger_category, pll_seats: int) -> None:
    if commercial_use is not None and commercial_use not in CUSTOMER_FACING_COMMERCIAL_USES:
        raise ValueError(f"commercial_use must be one of: {', '.join(CUSTOMER_FACING_COMMERCIAL_USES)}")
    if commercial_use != "commercial_institutional":
        return
    missing = []
    if institution_type is None:
        missing.append("institution_type")
    if institutional_vehicle_type is None:
        missing.append("institutional_vehicle_type")
    if passenger_category is None:
        missing.append("passenger_category")
    if missing:
        raise ValueError(f"Commercial Institutional requires: {', '.join(missing)}")
    if pll_seats <= 0:
        raise ValueError("Commercial Institutional requires a positive number of passenger seats")


class ClientIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    id_or_passport: str | None = Field(default=None, max_length=50)
    phone: str = Field(min_length=7, max_length=30)
    email: EmailStr | None = None


class VehicleIn(BaseModel):
    registration_no: str = Field(min_length=2, max_length=30)
    year_of_manufacture: int
    # Deprecated: vehicle age is always calculated server-side from
    # year_of_manufacture. Any value sent here is accepted for API
    # compatibility but never read for pricing, eligibility, or storage.
    age_years: int | None = Field(default=None, ge=0, le=80)
    make: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)

    @field_validator("year_of_manufacture")
    @classmethod
    def _validate_year_of_manufacture(cls, v: int) -> int:
        year = current_year()
        if v > year:
            raise ValueError(f"Year of manufacture cannot be later than {year}.")
        if v < MIN_MANUFACTURE_YEAR:
            raise ValueError(f"Enter a year between {MIN_MANUFACTURE_YEAR} and {year}.")
        return v


class QuoteOptionsIn(BaseModel):
    ep: bool = False
    pvt: bool = False
    pv_terror: bool = False
    lr_band: str | None = None  # 'good' | 'bad'
    pll_seats: int = 0
    pll_option_key: str | None = None
    # Vehicle carrying capacity in tonnes, for commercial/goods-carrying
    # classes whose rate bands are split by tonnage as well as Sum Insured.
    tonnage: float | None = Field(default=None, ge=0)


class CompareRequest(BaseModel):
    # No client details here on purpose -- comparing quotes is anonymous;
    # list_eligible_options never reads personal information, only vehicle
    # and cover details.
    vehicle: VehicleIn
    category: str
    # Only meaningful when category == "commercial" -- selects which
    # customer-facing branch (own_goods / general_cartage /
    # commercial_institutional) is being quoted.
    commercial_use: str | None = None
    institution_type: InstitutionType | None = None
    institutional_vehicle_type: InstitutionalVehicleType | None = None
    passenger_category: PassengerCategory | None = None
    sum_insured: float = Field(ge=0)
    options: QuoteOptionsIn = QuoteOptionsIn()

    @model_validator(mode="after")
    def _validate_commercial_use_intake(self):
        _validate_commercial_use_intake(
            self.commercial_use, self.institution_type, self.institutional_vehicle_type,
            self.passenger_category, self.options.pll_seats,
        )
        return self


class CompareOption(BaseModel):
    offer_id: uuid.UUID | None = None
    offer_token: str | None = None
    offer_expires_at: datetime | None = None
    insurer_id: uuid.UUID
    insurer_code: str
    insurer_name: str
    motor_class_id: uuid.UUID
    motor_class_code: str
    motor_class_label: str
    cover_type: str
    max_age: int | None
    basic_premium: float
    subtotal: float
    levies: float
    stamp_duty: float
    total_premium: float
    # True if a tonnage figure must be supplied before this specific option
    # can be generated (rare -- most classes, including every Commercial
    # Institutional product today, don't require it).
    tonnage_required: bool = False


class IneligibleOption(BaseModel):
    insurer_id: uuid.UUID
    insurer_code: str
    insurer_name: str
    motor_class_id: uuid.UUID
    motor_class_code: str
    motor_class_label: str
    max_age: int | None
    reason: str


class CompareResponse(BaseModel):
    category: str
    sum_insured: float
    calculated_age_years: int
    options: list[CompareOption]
    ineligible_options: list[IneligibleOption] = []


class GenerateQuotationRequest(BaseModel):
    client: ClientIn
    vehicle: VehicleIn
    insurer_id: uuid.UUID
    motor_class_id: uuid.UUID
    commercial_use: str | None = None
    institution_type: InstitutionType | None = None
    institutional_vehicle_type: InstitutionalVehicleType | None = None
    passenger_category: PassengerCategory | None = None
    sum_insured: float = Field(ge=0)
    options: QuoteOptionsIn = QuoteOptionsIn()
    amount_paid: float = Field(default=0, ge=0)

    @model_validator(mode="after")
    def _validate_commercial_use_intake(self):
        _validate_commercial_use_intake(
            self.commercial_use, self.institution_type, self.institutional_vehicle_type,
            self.passenger_category, self.options.pll_seats,
        )
        return self


class SelectQuoteRequest(BaseModel):
    """Body of POST /api/quotes/select -- everything GenerateQuotationRequest
    has except `client`: locking in a comparison result is still anonymous."""

    vehicle: VehicleIn
    category: str
    commercial_use: str | None = None
    institution_type: InstitutionType | None = None
    institutional_vehicle_type: InstitutionalVehicleType | None = None
    passenger_category: PassengerCategory | None = None
    insurer_id: uuid.UUID
    motor_class_id: uuid.UUID
    sum_insured: float = Field(ge=0)
    options: QuoteOptionsIn = QuoteOptionsIn()

    @model_validator(mode="after")
    def _validate_commercial_use_intake(self):
        _validate_commercial_use_intake(
            self.commercial_use, self.institution_type, self.institutional_vehicle_type,
            self.passenger_category, self.options.pll_seats,
        )
        return self


class QuotationLineOut(BaseModel):
    label: str
    amount: float


class QuoteSelectionOut(BaseModel):
    selection_id: uuid.UUID
    access_token: str
    expires_at: datetime
    insurer_name: str
    vehicle_class_label: str
    cover_type: str
    sum_insured: float
    basic_premium: float
    subtotal: float
    levies: float
    stamp_duty: float
    total_premium: float
    items: list[QuotationLineOut]


class CustomerIn(BaseModel):
    """"About You" -- collected only after a quote has been selected. ID/
    passport and KRA PIN are required at this stage (unlike the legacy
    ClientIn used by the still-supported /generate path), matching "ID or
    passport number is required at acceptance" / "KRA PIN is required"."""

    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=7, max_length=30)
    email: EmailStr | None = None
    id_or_passport: str = Field(min_length=1, max_length=50)
    kra_pin: str = Field(min_length=1, max_length=20)

    @field_validator("full_name")
    @classmethod
    def _full_name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Please enter your full name.")
        return v

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str) -> str:
        return normalize_kenyan_phone(v)

    @field_validator("id_or_passport")
    @classmethod
    def _id_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("ID or passport number is required.")
        return v

    @field_validator("kra_pin")
    @classmethod
    def _validate_kra_pin(cls, v: str) -> str:
        v = v.strip().upper()
        if not _KRA_PIN_RE.match(v):
            raise ValueError("Enter a valid KRA PIN, e.g. A123456789B.")
        return v


class CustomerAttachOut(BaseModel):
    quotation_id: uuid.UUID
    access_token: str


class QuotationOut(BaseModel):
    id: uuid.UUID
    quotation_number: str
    status: QuotationStatus
    client_name: str
    vehicle_registration: str
    insurer_name: str
    vehicle_class_label: str
    cover_type: str
    sum_insured: float
    basic_premium: float
    subtotal: float
    levies: float
    stamp_duty: float
    total_premium: float
    amount_paid: float
    balance: float
    items: list[QuotationLineOut]
    excess: list[str]
    benefits: list[str]
    limits: list[str]
    year_of_manufacture: int | None
    calculated_age_years: int | None
    # Which customer-facing Commercial branch this is, present only when
    # the vehicle class is Commercial (None otherwise).
    commercial_use: str | None = None
    # Carrying capacity in tonnes, present only when supplied (Own Goods /
    # General Cartage, or any insurer whose class requires it).
    tonnage: float | None = None
    # Institutional details, present only for Commercial Institutional
    # quotations (None otherwise).
    institution_type: str | None = None
    institutional_vehicle_type: str | None = None
    passenger_category: str | None = None
    passenger_seats: int | None = None
    pll_rate: float | None = None
    pll_amount: float | None = None
    pll_included: bool = False
    generated_at: datetime | None
    accepted_at: datetime | None
    rejected_at: datetime | None
    expires_at: datetime | None
    locked: bool
    has_risk_note: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AcceptQuotationRequest(BaseModel):
    cover_start_date: datetime | None = None
    acceptance_confirmed: bool = False


class RejectQuotationRequest(BaseModel):
    reason: str | None = None


class RiskNoteOut(BaseModel):
    id: uuid.UUID
    risk_note_number: str
    quotation_id: uuid.UUID
    quotation_number: str
    status: RiskNoteStatus
    client_name: str
    vehicle_registration: str
    insurer_name: str
    cover_type: str
    sum_insured: float
    premium: float
    cover_start_date: datetime
    cover_end_date: datetime | None
    generated_at: datetime

    model_config = {"from_attributes": True}


class EmailSendRequest(BaseModel):
    to_email: EmailStr | None = None  # defaults to client's saved email if omitted
    include_quotation: bool = True
    include_risk_note: bool = False
