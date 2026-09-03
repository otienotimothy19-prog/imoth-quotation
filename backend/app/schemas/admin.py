import uuid

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import RiskNoteStatus


class InsurerCreate(BaseModel):
    code: str = Field(min_length=2, max_length=50)
    name: str = Field(min_length=2, max_length=255)
    disclaimer: str | None = None
    note: str | None = None

    @field_validator("code")
    @classmethod
    def _code_format(cls, v: str) -> str:
        v = v.strip().lower()
        if not v.replace("_", "").isalnum():
            raise ValueError("Code may only contain lowercase letters, numbers and underscores")
        return v

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v


class InsurerUpdate(BaseModel):
    name: str | None = None
    disclaimer: str | None = None
    note: str | None = None
    active: bool | None = None

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("Name is required")
        return v


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
    key: str = Field(min_length=1, max_length=50)
    label: str = Field(min_length=1, max_length=255)
    rate: float = Field(ge=0)


def _validate_pll_options(options: list[PllOption] | None) -> list[PllOption] | None:
    if options is None:
        return None
    keys = [o.key for o in options]
    if len(keys) != len(set(keys)):
        raise ValueError("Passenger Legal Liability option keys must be unique within a class")
    return options


class FlatOnly(BaseModel):
    premium: float | None = Field(default=None, ge=0)
    rate_on_si: float | None = Field(default=None, ge=0)
    min_premium: float | None = Field(default=None, ge=0)
    note: str = ""

    @model_validator(mode="after")
    def _require_premium_or_rate(self):
        if self.premium is None and self.rate_on_si is None:
            raise ValueError("Provide either a fixed premium or a rate on sum insured")
        if self.rate_on_si is not None and self.min_premium is None:
            raise ValueError("A minimum premium is required when using a rate on sum insured")
        return self


class MotorClassCreate(BaseModel):
    insurer_id: uuid.UUID
    code: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=50)
    max_age: int | None = Field(default=None, ge=0, le=100)
    min_si: float = Field(default=0, ge=0)
    max_si: float | None = Field(default=None, ge=0)
    has_lr_toggle: bool = False
    pll_per_seat: float | None = Field(default=None, ge=0)
    pll_options: list[PllOption] | None = None
    flat_only: FlatOnly | None = None
    excess: list[str] = []
    benefits: list[str] = []
    limits: list[str] = []

    @field_validator("pll_options")
    @classmethod
    def _pll_options_unique_create(cls, v):
        return _validate_pll_options(v)

    @model_validator(mode="after")
    def _si_range(self):
        if self.max_si is not None and self.max_si < self.min_si:
            raise ValueError("Max Sum Insured cannot be less than Min Sum Insured")
        return self


class MotorClassUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = Field(default=None, min_length=1, max_length=50)
    max_age: int | None = Field(default=None, ge=0, le=100)
    min_si: float | None = Field(default=None, ge=0)
    max_si: float | None = Field(default=None, ge=0)
    has_lr_toggle: bool | None = None
    pll_per_seat: float | None = Field(default=None, ge=0)
    pll_options: list[PllOption] | None = None
    flat_only: FlatOnly | None = None
    excess: list[str] | None = None
    benefits: list[str] | None = None
    limits: list[str] | None = None
    active: bool | None = None
    # Optional: when set, this update is also recorded as a new RateVersion
    # (used by the Rates screen when editing a flat-rate product's premium
    # or its Passenger Legal Liability rates, so those changes get the same
    # version history as banded rates).
    change_reason: str | None = None

    @field_validator("pll_options")
    @classmethod
    def _pll_options_unique_update(cls, v):
        return _validate_pll_options(v)

    @model_validator(mode="after")
    def _si_range(self):
        if self.max_si is not None and self.min_si is not None and self.max_si < self.min_si:
            raise ValueError("Max Sum Insured cannot be less than Min Sum Insured")
        return self


class RateBandIn(BaseModel):
    min_si: float = Field(ge=0)
    max_si: float | None = Field(default=None, ge=0)
    rate: float = Field(ge=0)
    min_premium: float = Field(ge=0)
    # Optional passenger-capacity limits (PSV classes). Leave both blank for
    # a band that applies regardless of passenger count -- the norm for
    # every non-PSV class.
    min_passengers: int | None = Field(default=None, ge=0)
    max_passengers: int | None = Field(default=None, ge=0)
    # Optional tonnage limits (commercial/goods-carrying classes). Same
    # leave-both-blank-for-any convention as the passenger limits above.
    min_tonnage: float | None = Field(default=None, ge=0)
    max_tonnage: float | None = Field(default=None, ge=0)
    ep_included: bool = True
    ep_not_offered: bool = False
    ep_rate: float = Field(default=0, ge=0)
    ep_min: float = Field(default=0, ge=0)
    ep_mandatory: bool = False
    pvt_included: bool = True
    pvt_not_offered: bool = False
    pvt_rate: float = Field(default=0, ge=0)
    pvt_min: float = Field(default=0, ge=0)
    pvt_mandatory: bool = False

    @model_validator(mode="after")
    def _validate_band(self):
        if self.max_si is not None and self.max_si < self.min_si:
            raise ValueError("Max SI cannot be less than Min SI")
        if self.max_passengers is not None and self.min_passengers is not None and self.max_passengers < self.min_passengers:
            raise ValueError("Max passengers cannot be less than Min passengers")
        if self.max_tonnage is not None and self.min_tonnage is not None and self.max_tonnage < self.min_tonnage:
            raise ValueError("Max tonnage cannot be less than Min tonnage")
        if self.ep_included and self.ep_not_offered:
            raise ValueError("Excess Protector cannot be both Included and Not Offered")
        if self.ep_mandatory and (self.ep_included or self.ep_not_offered):
            raise ValueError("Excess Protector cannot be Mandatory while also Included or Not Offered")
        if self.pvt_included and self.pvt_not_offered:
            raise ValueError("PVT cannot be both Included and Not Offered")
        if self.pvt_mandatory and (self.pvt_included or self.pvt_not_offered):
            raise ValueError("PVT cannot be Mandatory while also Included or Not Offered")
        return self


def _si_ranges_overlap(a: RateBandIn, b: RateBandIn) -> bool:
    a_hi = a.max_si if a.max_si is not None else float("inf")
    b_hi = b.max_si if b.max_si is not None else float("inf")
    return a.min_si <= b_hi and b.min_si <= a_hi


def _optional_ranges_overlap(a: RateBandIn, b: RateBandIn, *, lo_attr: str, hi_attr: str) -> bool:
    """A band with no range configured on this optional dimension (e.g.
    passenger capacity, tonnage) applies to every value of it, so it's
    treated as unbounded for overlap purposes."""
    a_lo = getattr(a, lo_attr) if getattr(a, lo_attr) is not None else float("-inf")
    a_hi = getattr(a, hi_attr) if getattr(a, hi_attr) is not None else float("inf")
    b_lo = getattr(b, lo_attr) if getattr(b, lo_attr) is not None else float("-inf")
    b_hi = getattr(b, hi_attr) if getattr(b, hi_attr) is not None else float("inf")
    return a_lo <= b_hi and b_lo <= a_hi


def _check_no_band_overlaps(bands: list[RateBandIn], *, label: str) -> None:
    # Two bands only genuinely conflict if their Sum-Insured range AND their
    # passenger-capacity range AND their tonnage range all overlap -- PSV
    # classes intentionally reuse the same Sum-Insured range across bands
    # split apart by passenger count (e.g. 7-14 vs 15-33 seats), and
    # commercial classes do the same split apart by tonnage, neither of
    # which is a conflict.
    ordered = sorted(bands, key=lambda b: b.min_si)
    for i, a in enumerate(ordered):
        for b in ordered[i + 1 :]:
            if (
                _si_ranges_overlap(a, b)
                and _optional_ranges_overlap(a, b, lo_attr="min_passengers", hi_attr="max_passengers")
                and _optional_ranges_overlap(a, b, lo_attr="min_tonnage", hi_attr="max_tonnage")
            ):
                raise ValueError(
                    f"{label}: band {a.min_si:,.0f}-{'∞' if a.max_si is None else f'{a.max_si:,.0f}'} "
                    f"overlaps band {b.min_si:,.0f}-{'∞' if b.max_si is None else f'{b.max_si:,.0f}'} "
                    "for the same passenger and tonnage range"
                )


class RateBandsUpdate(BaseModel):
    bands: list[RateBandIn] = Field(min_length=1)
    bands_alt: list[RateBandIn] | None = None
    change_reason: str = Field(min_length=1)

    @field_validator("change_reason")
    @classmethod
    def _reason_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("A reason is required for this rate change")
        return v

    @model_validator(mode="after")
    def _no_overlaps(self):
        _check_no_band_overlaps(self.bands, label="Standard bands")
        if self.bands_alt:
            _check_no_band_overlaps(self.bands_alt, label="Alternative bands")
        return self


class VoidRiskNoteRequest(BaseModel):
    new_status: RiskNoteStatus
    reason: str = Field(min_length=3)


# Known numeric settings, validated by key even though `values` is a free-
# form dict (it must stay that way -- settings are keyed by string and new
# keys can be added without a schema change). (min, max) is inclusive;
# None means unbounded on that side.
_NUMERIC_SETTING_RANGES: dict[str, tuple[float | None, float | None]] = {
    "quotation.validity_days": (1, 365),
    "levy.rate": (0, 1),
    "levy.stamp_duty": (0, None),
    "documents.max_file_size_mb": (0.1, 100),
}


class SettingsUpdate(BaseModel):
    values: dict

    @field_validator("values")
    @classmethod
    def _validate_known_numeric_keys(cls, v: dict) -> dict:
        for key, (lo, hi) in _NUMERIC_SETTING_RANGES.items():
            if key not in v:
                continue
            value = v[key]
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{key} must be a number")
            if lo is not None and value < lo:
                raise ValueError(f"{key} must be at least {lo}")
            if hi is not None and value > hi:
                raise ValueError(f"{key} must be at most {hi}")
        return v
