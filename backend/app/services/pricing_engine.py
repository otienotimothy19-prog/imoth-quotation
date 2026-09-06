"""Motor quotation pricing engine.

This is a line-by-line port of the ``computePremium`` / ``findBand`` /
``effectiveBand`` functions from the legacy client-side tool
(``legacy/imoth_motor_quotation_reference.html``). The arithmetic here must
keep producing byte-identical results to that tool for identical inputs --
see ``backend/tests/test_pricing_parity.py``.

All monetary inputs/outputs are plain floats (KES). Callers pass a
``motor_class`` dict shaped like one entry of
``app.seed.insurers_data.INSURERS[x]["classes"][y]`` (or the equivalent
built from the database via ``app.services.rate_config.class_to_dict``).
"""

from dataclasses import dataclass, field

PRIVATE_AGE_LIMIT_FOR_EP_PVT = 15


@dataclass
class PremiumLine:
    label: str
    amount: float


@dataclass
class PremiumResult:
    lines: list[PremiumLine]
    subtotal: float
    levies: float
    stamp_duty: float
    total: float
    band_used: dict | None
    options_used: dict = field(default_factory=dict)
    pll_rate: float | None = None
    pll_amount: float | None = None
    pll_included: bool = False

    def as_dict(self) -> dict:
        return {
            "lines": [{"label": l.label, "amount": l.amount} for l in self.lines],
            "subtotal": self.subtotal,
            "levies": self.levies,
            "stamp_duty": self.stamp_duty,
            "total": self.total,
            "band_used": self.band_used,
            "options_used": self.options_used,
            "pll_rate": self.pll_rate,
            "pll_amount": self.pll_amount,
            "pll_included": self.pll_included,
        }


def _si_matches(b: dict, si: float) -> bool:
    return si >= b["min_si"] and (b["max_si"] is None or si <= b["max_si"])


def _optional_range_matches(b: dict, value: float | None, *, lo_key: str, hi_key: str) -> bool:
    """True if this band's optional numeric range (e.g. passenger-capacity
    for PSV classes, tonnage for commercial/goods-carrying classes) admits
    the given value. A band with no range configured on this dimension --
    the default, and the only case for classes that don't use it -- always
    matches, since the dimension simply doesn't apply to it."""
    lo, hi = b.get(lo_key), b.get(hi_key)
    if lo is None and hi is None:
        return True
    if value is None:
        return False
    if lo is not None and value < lo:
        return False
    if hi is not None and value > hi:
        return False
    return True


def _passengers_match(b: dict, passengers: int | None) -> bool:
    return _optional_range_matches(b, passengers, lo_key="min_passengers", hi_key="max_passengers")


def _tonnage_matches(b: dict, tonnage: float | None) -> bool:
    return _optional_range_matches(b, tonnage, lo_key="min_tonnage", hi_key="max_tonnage")


def find_band(bands: list[dict], si: float, passengers: int | None = None, tonnage: float | None = None) -> dict:
    for b in bands:
        if _si_matches(b, si) and _passengers_match(b, passengers) and _tonnage_matches(b, tonnage):
            return b
    # No band matches every dimension (e.g. passenger count or tonnage
    # outside every configured band's range). Fall back to matching by Sum
    # Insured alone so a class that hasn't opted into passenger/tonnage
    # bands -- or a value outside what's configured -- still prices instead
    # of erroring out, mirroring the pre-existing SI-only fallback below.
    for b in bands:
        if _si_matches(b, si):
            return b
    # fall back to nearest band if outside declared ranges (mirrors legacy behaviour)
    return bands[-1]


def effective_band(motor_class: dict, band_: dict, age: float | None) -> dict:
    """Market rule: private motor vehicles over 15 years old are not offered
    Excess Protector (Own Damage) or PVT cover, regardless of what the normal
    Sum-Insured band would otherwise include.

    This blanket rule only applies to standard 15-year private-car products.
    A product that is itself documented to cover vehicles beyond 15 years
    (e.g. an insurer's dedicated older-vehicle class with its own max_age
    and its own EP/PVT terms baked into its bands) is exempt -- its own
    band configuration already governs the whole age range it is eligible
    for, and this generic rule must not strip benefits that product
    explicitly provides."""
    class_max_age = motor_class.get("max_age")
    is_dedicated_older_vehicle_product = class_max_age is not None and class_max_age > PRIVATE_AGE_LIMIT_FOR_EP_PVT
    if (
        motor_class.get("category") == "private"
        and age is not None
        and age > PRIVATE_AGE_LIMIT_FOR_EP_PVT
        and not is_dedicated_older_vehicle_product
    ):
        out = dict(band_)
        out.update(
            ep_included=False,
            pvt_included=False,
            ep_not_offered=True,
            pvt_not_offered=True,
            age_rule_applied=True,
        )
        return out
    out = dict(band_)
    out.setdefault("age_rule_applied", False)
    return out


def compute_premium(
    motor_class: dict,
    sum_insured: float,
    options: dict,
    levy_rate: float,
    stamp_duty: float,
) -> PremiumResult:
    """options keys (all optional, default falsy):
    ep (bool), pvt (bool), pv_terror (bool), lr_band ('good'|'bad'),
    pll_seats (int), pll_option_key (str), age (float|None)
    """
    lines: list[PremiumLine] = []
    subtotal = 0.0
    band_used = None

    flat_only = motor_class.get("flat_only")
    if flat_only:
        if flat_only.get("rate_on_si") is not None:
            amt = max(sum_insured * flat_only["rate_on_si"], flat_only["min_premium"])
        else:
            amt = flat_only["premium"]
        lines.append(PremiumLine(f"{motor_class['label']} premium", amt))
        subtotal += amt
    else:
        use_bands = (
            motor_class["bands_alt"]
            if (motor_class.get("has_lr_toggle") and options.get("lr_band") == "bad")
            else motor_class["bands"]
        )
        raw_band = find_band(use_bands, sum_insured, options.get("pll_seats") or None, options.get("tonnage"))
        b = effective_band(motor_class, raw_band, options.get("age"))
        base = max(sum_insured * b["rate"], b["min_premium"])
        lines.append(PremiumLine(f"Basic Premium @ {b['rate'] * 100:.2f}% of SI (Min {b['min_premium']:,.0f})", base))
        subtotal += base

        ep_charged = options.get("ep") or b.get("ep_mandatory")
        if not b["ep_included"] and not b["ep_not_offered"] and ep_charged:
            ep = max(sum_insured * b["ep_rate"], b["ep_min"])
            label = "Excess Protector (Own Damage)" + (" (mandatory)" if b.get("ep_mandatory") else "")
            lines.append(PremiumLine(f"{label} @ {b['ep_rate'] * 100:.2f}%", ep))
            subtotal += ep

        pvt_charged = options.get("pvt") or b.get("pvt_mandatory")
        if not b["pvt_included"] and not b["pvt_not_offered"] and pvt_charged:
            p = max(sum_insured * b["pvt_rate"], b["pvt_min"])
            label = "PVT Cover" + (" (mandatory)" if b.get("pvt_mandatory") else "")
            lines.append(PremiumLine(f"{label} @ {b['pvt_rate'] * 100:.2f}%", p))
            subtotal += p

        if options.get("pv_terror"):
            pv = max(sum_insured * 0.0025, 2500)
            lines.append(PremiumLine("Political Violence & Terrorism extension", pv))
            subtotal += pv

        band_used = b

    pll_seats = options.get("pll_seats") or 0
    passenger_category = options.get("passenger_category")
    pll_rate: float | None = None
    pll_amount: float | None = None
    pll_included = bool(motor_class.get("pll_included"))
    if pll_included:
        # PLL is bundled into the base rate -- show it, but never charge it
        # again on top.
        if pll_seats > 0:
            lines.append(PremiumLine("Passenger Legal Liability — Included", 0.0))
        pll_rate = 0.0
        pll_amount = 0.0
    elif motor_class.get("pll_options") and pll_seats > 0:
        pll_options = motor_class["pll_options"]
        # Prefer the option explicitly tagged for this passenger category
        # (e.g. a "Students" tier vs an "Organised group / general hire"
        # tier); fall back to the legacy pll_option_key match, then to the
        # first option -- the exact pre-existing behaviour for any class
        # that hasn't tagged its options with applies_to.
        opt = (
            next((o for o in pll_options if passenger_category and passenger_category in (o.get("applies_to") or [])), None)
            or next((o for o in pll_options if o["key"] == options.get("pll_option_key")), pll_options[0])
        )
        pll_amount = opt["rate"] * pll_seats
        pll_rate = opt["rate"]
        lines.append(PremiumLine(f"Passenger Legal Liability ({pll_seats} seats, {opt['label']} @ {opt['rate']:,.0f})", pll_amount))
        subtotal += pll_amount
    elif motor_class.get("pll_per_seat") and pll_seats > 0:
        pll_rate = motor_class["pll_per_seat"]
        pll_amount = pll_rate * pll_seats
        lines.append(PremiumLine(f"Passenger Legal Liability ({pll_seats} seats @ {motor_class['pll_per_seat']:,.0f})", pll_amount))
        subtotal += pll_amount

    levies = subtotal * levy_rate
    total = subtotal + levies + stamp_duty

    return PremiumResult(
        lines=lines,
        subtotal=subtotal,
        levies=levies,
        stamp_duty=stamp_duty,
        total=total,
        band_used=band_used,
        options_used=options,
        pll_rate=pll_rate,
        pll_amount=pll_amount,
        pll_included=pll_included,
    )


def eligibility_reason(
    motor_class: dict,
    sum_insured: float,
    age: int | None,
    *,
    institution_type: str | None = None,
    vehicle_type: str | None = None,
    passenger_category: str | None = None,
) -> str | None:
    """None if the motor class is eligible for this Sum Insured / vehicle
    age (and, for Commercial Institutional classes, institution/vehicle/
    passenger-category restrictions); otherwise a human-readable
    explanation of why not. Vehicles beyond a motor class's configured
    maximum age are excluded outright rather than shown with a warning:
    there is no approved manual-underwriting referral workflow in this
    system to route an over-age option to instead, so it must not appear
    as an immediately eligible quotation -- but the reason must still be
    surfaced clearly rather than the option simply vanishing."""
    max_age = motor_class.get("max_age")
    if max_age is not None and age is not None and age > max_age:
        return (
            f"Vehicle age: {age} years\n"
            f"Maximum eligible age: {max_age} years\n"
            "Not eligible for this insurer's product"
        )
    eligible_institutions = motor_class.get("eligible_institution_types")
    if eligible_institutions and institution_type not in eligible_institutions:
        return f"This insurer's product is not offered for institution type '{institution_type}'."
    eligible_vehicles = motor_class.get("eligible_vehicle_types")
    if eligible_vehicles and vehicle_type not in eligible_vehicles:
        return f"This insurer's product is not offered for vehicle type '{vehicle_type}'."
    eligible_passenger_categories = motor_class.get("eligible_passenger_categories")
    if eligible_passenger_categories and passenger_category not in eligible_passenger_categories:
        return f"This insurer's product is not offered for passenger category '{passenger_category}'."
    if motor_class.get("flat_only"):
        return None
    # "bands" is always present (possibly []) on a real class_dict built by
    # motor_class_to_dict -- a class with none configured yet must be
    # excluded with a clear reason rather than crash `find_band` on an
    # empty list. A caller that omits the key entirely (e.g. a minimal
    # synthetic dict in a unit test that only cares about age/SI checks)
    # is treated as not applicable, so this doesn't require every existing
    # test fixture to add a "bands" key it doesn't otherwise need.
    if "bands" in motor_class and not motor_class["bands"]:
        return "This insurer's product has not yet been configured with rate bands."
    min_si = motor_class.get("min_si", 0)
    if sum_insured < min_si:
        return f"Sum Insured of KES {sum_insured:,.0f} is below this product's minimum vehicle value of KES {min_si:,.0f}."
    max_si = motor_class.get("max_si")
    if max_si is not None and sum_insured > max_si:
        return f"Sum Insured of KES {sum_insured:,.0f} exceeds this product's maximum vehicle value of KES {max_si:,.0f}."
    return None


def is_eligible(
    motor_class: dict,
    sum_insured: float,
    age: int | None,
    *,
    institution_type: str | None = None,
    vehicle_type: str | None = None,
    passenger_category: str | None = None,
) -> bool:
    """Whether a motor class can be quoted for the given SI / vehicle age
    (and institution/vehicle/passenger-category restrictions, if any)."""
    return (
        eligibility_reason(
            motor_class, sum_insured, age,
            institution_type=institution_type, vehicle_type=vehicle_type, passenger_category=passenger_category,
        )
        is None
    )
