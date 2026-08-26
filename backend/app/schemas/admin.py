import uuid

from pydantic import BaseModel, Field

from app.models.enums import RiskNoteStatus


class InsurerCreate(BaseModel):
    code: str = Field(min_length=2, max_length=50)
    name: str = Field(min_length=2, max_length=255)
    disclaimer: str | None = None
    note: str | None = None


class InsurerUpdate(BaseModel):
    name: str | None = None
    disclaimer: str | None = None
    note: str | None = None
    active: bool | None = None


class InsurerOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    logo_path: str | None
    disclaimer: str | None
    note: str | None
    active: bool

    model_config = {"from_attributes": True}


class PllOption(BaseModel):
    key: str
    label: str
    rate: float


class FlatOnly(BaseModel):
    premium: float | None = None
    rate_on_si: float | None = None
    min_premium: float | None = None
    note: str = ""


class MotorClassCreate(BaseModel):
    insurer_id: uuid.UUID
    code: str = Field(min_length=1, max_length=80)
    label: str
    category: str
    max_age: int | None = None
    min_si: float = 0
    max_si: float | None = None
    has_lr_toggle: bool = False
    pll_per_seat: float | None = None
    pll_options: list[PllOption] | None = None
    flat_only: FlatOnly | None = None
    excess: list[str] = []
    benefits: list[str] = []
    limits: list[str] = []


class MotorClassUpdate(BaseModel):
    label: str | None = None
    category: str | None = None
    max_age: int | None = None
    min_si: float | None = None
    max_si: float | None = None
    has_lr_toggle: bool | None = None
    pll_per_seat: float | None = None
    pll_options: list[PllOption] | None = None
    flat_only: FlatOnly | None = None
    excess: list[str] | None = None
    benefits: list[str] | None = None
    limits: list[str] | None = None
    active: bool | None = None


class RateBandIn(BaseModel):
    min_si: float
    max_si: float | None = None
    rate: float
    min_premium: float
    ep_included: bool = True
    ep_not_offered: bool = False
    ep_rate: float = 0
    ep_min: float = 0
    pvt_included: bool = True
    pvt_not_offered: bool = False
    pvt_rate: float = 0
    pvt_min: float = 0


class RateBandsUpdate(BaseModel):
    bands: list[RateBandIn]
    bands_alt: list[RateBandIn] | None = None
    change_reason: str


class VoidRiskNoteRequest(BaseModel):
    new_status: RiskNoteStatus
    reason: str = Field(min_length=3)


class SettingsUpdate(BaseModel):
    values: dict
