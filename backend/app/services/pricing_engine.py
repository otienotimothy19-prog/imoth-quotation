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

    def as_dict(self) -> dict:
        return {
            "lines": [{"label": l.label, "amount": l.amount} for l in self.lines],
            "subtotal": self.subtotal,
            "levies": self.levies,
            "stamp_duty": self.stamp_duty,
            "total": self.total,
            "band_used": self.band_used,
            "options_used": self.options_used,
        }


def find_band(bands: list[dict], si: float) -> dict:
    for b in bands:
        if si >= b["min_si"] and (b["max_si"] is None or si <= b["max_si"]):
            return b
    # fall back to nearest band if outside declared ranges (mirrors legacy behaviour)
    return bands[-1]


def effective_band(motor_class: dict, band_: dict, age: float | None) -> dict:
    """Market rule: private motor vehicles over 15 years old are not offered
    Excess Protector (Own Damage) or PVT cover, regardless of what the normal
    Sum-Insured band would otherwise include."""
    if motor_class.get("category") == "private" and age is not None and age > PRIVATE_AGE_LIMIT_FOR_EP_PVT:
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
        raw_band = find_band(use_bands, sum_insured)
        b = effective_band(motor_class, raw_band, options.get("age"))
        base = max(sum_insured * b["rate"], b["min_premium"])
        lines.append(PremiumLine(f"Basic Premium @ {b['rate'] * 100:.2f}% of SI (Min {b['min_premium']:,.0f})", base))
        subtotal += base

        if not b["ep_included"] and not b["ep_not_offered"] and options.get("ep"):
            ep = max(sum_insured * b["ep_rate"], b["ep_min"])
            lines.append(PremiumLine(f"Excess Protector (Own Damage) @ {b['ep_rate'] * 100:.2f}%", ep))
            subtotal += ep

        if not b["pvt_included"] and not b["pvt_not_offered"] and options.get("pvt"):
            p = max(sum_insured * b["pvt_rate"], b["pvt_min"])
            lines.append(PremiumLine(f"PVT Cover @ {b['pvt_rate'] * 100:.2f}%", p))
            subtotal += p

        if options.get("pv_terror"):
            pv = max(sum_insured * 0.0025, 2500)
            lines.append(PremiumLine("Political Violence & Terrorism extension", pv))
            subtotal += pv

        band_used = b

    pll_seats = options.get("pll_seats") or 0
    if motor_class.get("pll_options") and pll_seats > 0:
        opt = next(
            (o for o in motor_class["pll_options"] if o["key"] == options.get("pll_option_key")),
            motor_class["pll_options"][0],
        )
        pll = opt["rate"] * pll_seats
        lines.append(PremiumLine(f"Passenger Legal Liability ({pll_seats} seats, {opt['label']} @ {opt['rate']:,.0f})", pll))
        subtotal += pll
    elif motor_class.get("pll_per_seat") and pll_seats > 0:
        pll = motor_class["pll_per_seat"] * pll_seats
        lines.append(PremiumLine(f"Passenger Legal Liability ({pll_seats} seats @ {motor_class['pll_per_seat']:,.0f})", pll))
        subtotal += pll

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
    )


def is_eligible(motor_class: dict, sum_insured: float, age: int | None) -> bool:
    """Whether a motor class can be quoted for the given SI / vehicle age.

    Vehicles beyond a motor class's configured maximum age are excluded
    outright rather than shown with a warning: there is no approved manual-
    underwriting referral workflow in this system to route an over-age
    option to instead, so it must not appear as an immediately eligible
    quotation.
    """
    max_age = motor_class.get("max_age")
    if max_age is not None and age is not None and age > max_age:
        return False
    if motor_class.get("flat_only"):
        return True
    if sum_insured < motor_class.get("min_si", 0):
        return False
    max_si = motor_class.get("max_si")
    if max_si is not None and sum_insured > max_si:
        return False
    return True
