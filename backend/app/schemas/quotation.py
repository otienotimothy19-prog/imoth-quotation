import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import QuotationStatus, RiskNoteStatus
from app.services.vehicle_age import MIN_MANUFACTURE_YEAR, current_year


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


class CompareRequest(BaseModel):
    client: ClientIn
    vehicle: VehicleIn
    category: str
    sum_insured: float = Field(ge=0)
    options: QuoteOptionsIn = QuoteOptionsIn()


class CompareOption(BaseModel):
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
    sum_insured: float = Field(ge=0)
    options: QuoteOptionsIn = QuoteOptionsIn()
    amount_paid: float = Field(default=0, ge=0)


class QuotationLineOut(BaseModel):
    label: str
    amount: float


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
