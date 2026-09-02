"""Bridges the database representation of insurers/motor classes/rate bands
to the plain-dict shape the pricing engine (`app.services.pricing_engine`)
and the legacy-parity tests operate on."""

from app.models.insurer_rate import MotorClass, RateBand


def rate_band_to_dict(rb: RateBand) -> dict:
    return {
        "min_si": float(rb.min_si),
        "max_si": float(rb.max_si) if rb.max_si is not None else None,
        "rate": float(rb.rate),
        "min_premium": float(rb.min_premium),
        "ep_included": rb.ep_included,
        "ep_not_offered": rb.ep_not_offered,
        "ep_rate": float(rb.ep_rate),
        "ep_min": float(rb.ep_min),
        "ep_mandatory": rb.ep_mandatory,
        "pvt_included": rb.pvt_included,
        "pvt_not_offered": rb.pvt_not_offered,
        "pvt_rate": float(rb.pvt_rate),
        "pvt_min": float(rb.pvt_min),
        "pvt_mandatory": rb.pvt_mandatory,
    }


def motor_class_to_dict(mc: MotorClass) -> dict:
    active_bands = [b for b in mc.rate_bands if b.active]
    standard = sorted((b for b in active_bands if b.variant == "standard"), key=lambda b: b.sort_order)
    alt = sorted((b for b in active_bands if b.variant == "alt"), key=lambda b: b.sort_order)

    return {
        "id": str(mc.id),
        "code": mc.code,
        "label": mc.label,
        "category": mc.category,
        "max_age": mc.max_age,
        "min_si": float(mc.min_si),
        "max_si": float(mc.max_si) if mc.max_si is not None else None,
        "has_lr_toggle": mc.has_lr_toggle,
        "pll_per_seat": float(mc.pll_per_seat) if mc.pll_per_seat is not None else None,
        "pll_options": mc.pll_options,
        "flat_only": mc.flat_only,
        "excess": mc.excess or [],
        "benefits": mc.benefits or [],
        "limits": mc.limits or [],
        "bands": [rate_band_to_dict(b) for b in standard],
        "bands_alt": [rate_band_to_dict(b) for b in alt] if alt else None,
    }


def rate_version_snapshot(mc: MotorClass) -> dict:
    """Full point-in-time config for a motor class, used both for RateVersion
    history rows and (embedded further) inside QuotationSnapshot.data."""
    d = motor_class_to_dict(mc)
    d["insurer_code"] = mc.insurer.code
    d["insurer_name"] = mc.insurer.name
    d["insurer_disclaimer"] = mc.insurer.disclaimer
    d["insurer_note"] = mc.insurer.note
    return d
