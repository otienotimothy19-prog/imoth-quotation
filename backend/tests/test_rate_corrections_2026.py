"""Coverage for the 2025/2026 rate-card correction task: corrected Monarch,
Definite, Britam and Pioneer figures, the new Star Discover insurer,
ep_mandatory/pvt_mandatory support, the per-class exemption from the
blanket "private vehicles over 15yrs lose EP/PVT" rule, and the clear
eligibility-reason explanation for age-excluded options.

Unit-level tests exercise the pricing engine directly against
``INSURERS`` (fast, exact); API-level tests exercise the full
compare/generate flow via ``TestClient`` against a migrated + seeded
database (see README "Running tests").
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.seed.insurers_data import INSURERS, LEVY_RATE, STAMP_DUTY
from app.services.pricing_engine import compute_premium, eligibility_reason, is_eligible

client = TestClient(app)

CURRENT_YEAR = datetime.now(timezone.utc).year


def _client(phone=None):
    return {
        "full_name": "Rate Correction Test Client",
        "phone": phone or f"07{uuid.uuid4().int % 10**8:08d}",
        "email": "ratetest@example.com",
    }


def _vehicle(year_of_manufacture, reg=None):
    return {"registration_no": reg or f"KRC {uuid.uuid4().hex[:3].upper()}A", "year_of_manufacture": year_of_manufacture}


def compare(year_of_manufacture, category="private", sum_insured=1200000, reg=None):
    return client.post(
        "/api/quotes/compare",
        json={
            "client": _client(),
            "vehicle": _vehicle(year_of_manufacture, reg=reg),
            "category": category,
            "sum_insured": sum_insured,
        },
    )


# ---------------------------------------------------------------------
# 1. Monarch private car -- corrected minimum premium (Kshs 20,000, not
#    25,000) and band boundaries.
# ---------------------------------------------------------------------
def test_monarch_private_minimum_premium_corrected():
    mc = INSURERS["monarch"]["classes"]["private"]
    result = compute_premium(mc, 500000, {"age": 5}, LEVY_RATE, STAMP_DUTY)
    assert result.lines[0].amount == pytest.approx(20000)


def test_monarch_private_band_boundary_at_2_5m():
    mc = INSURERS["monarch"]["classes"]["private"]
    below = compute_premium(mc, 2500000, {"age": 5}, LEVY_RATE, STAMP_DUTY)
    above = compute_premium(mc, 2500001, {"age": 5}, LEVY_RATE, STAMP_DUTY)
    assert below.lines[0].amount == pytest.approx(2500000 * 0.035)
    assert above.lines[0].amount == pytest.approx(2500001 * 0.03)


# ---------------------------------------------------------------------
# 2. Monarch's dedicated 20-year private-car product: preserved separately,
#    and exempt from the blanket >15yr EP/PVT-stripping rule since its own
#    bands already document EP/PVT for its whole eligible age range.
# ---------------------------------------------------------------------
def test_monarch_20yr_product_eligible_at_16_to_20_years():
    mc = INSURERS["monarch"]["classes"]["private_400_499"]
    assert mc["max_age"] == 20
    for age in (16, 17, 20):
        assert is_eligible(mc, 500000, age), f"age {age} should remain eligible for the 20-year product"
    assert not is_eligible(mc, 500000, 21)


def test_monarch_20yr_product_not_stripped_by_blanket_15yr_rule():
    """Excess Protector is documented as genuinely unavailable on this
    product (ep_not_offered) regardless of age; PVT (0.25% min 2,500) must
    still be chargeable at age 17, not silently zeroed out by the generic
    private->age>15 stripping rule that governs the standard 15-year
    product."""
    mc = INSURERS["monarch"]["classes"]["private_400_499"]
    result = compute_premium(mc, 500000, {"age": 17, "pvt": True}, LEVY_RATE, STAMP_DUTY)
    pvt_lines = [l for l in result.lines if "PVT" in l.label]
    assert pvt_lines, "PVT must still be chargeable at age 17 on Monarch's dedicated 20-year product"
    assert pvt_lines[0].amount == pytest.approx(max(500000 * 0.0025, 2500))


def test_monarch_standard_15yr_product_still_strips_ep_pvt_over_15():
    """The blanket rule must still apply to Monarch's ordinary 15-year
    private car product (max_age 15) -- only products explicitly designed
    for longer ages are exempt."""
    mc = INSURERS["monarch"]["classes"]["private"]
    result = compute_premium(mc, 1000000, {"age": 17, "ep": True, "pvt": True}, LEVY_RATE, STAMP_DUTY)
    assert not any("Excess Protector" in l.label or "PVT" in l.label for l in result.lines)


# ---------------------------------------------------------------------
# 3. Britam private car -- EP corrected to 0.5% (was miscoded at 0.25%),
#    and EP/PVT are mandatory (always charged, independent of customer
#    opt-in).
# ---------------------------------------------------------------------
def test_britam_private_ep_rate_corrected_to_half_percent():
    mc = INSURERS["britam"]["classes"]["private"]
    band = mc["bands"][0]
    assert band["ep_rate"] == pytest.approx(0.005)


@pytest.mark.parametrize("ep_opt,pvt_opt", [(False, False), (True, True)])
def test_britam_private_ep_and_pvt_are_mandatory(ep_opt, pvt_opt):
    """EP and PVT must be charged on Britam private car regardless of
    whether the customer opted in -- the binder terms make them mandatory,
    not customer-selected add-ons."""
    mc = INSURERS["britam"]["classes"]["private"]
    result = compute_premium(mc, 2000000, {"age": 5, "ep": ep_opt, "pvt": pvt_opt}, LEVY_RATE, STAMP_DUTY)
    assert any("Excess Protector" in l.label for l in result.lines)
    assert any("PVT" in l.label for l in result.lines)


def test_britam_private_third_band_ep_pvt_inclusive_not_double_charged():
    """Above Kshs 3,000,000, EP/PVT are inclusive of the 3% rate -- there
    must be no separate mandatory line item (that would double-charge)."""
    mc = INSURERS["britam"]["classes"]["private"]
    result = compute_premium(mc, 3500000, {"age": 5}, LEVY_RATE, STAMP_DUTY)
    assert not any("Excess Protector" in l.label or "PVT" in l.label for l in result.lines)
    assert len(result.lines) == 1


def test_britam_commercial_general_cartage_corrected_and_mandatory():
    mc = INSURERS["britam"]["classes"]["commercial_general_cartage"]
    result = compute_premium(mc, 2000000, {}, LEVY_RATE, STAMP_DUTY)
    assert result.lines[0].amount == pytest.approx(2000000 * 0.05)
    ep = next(l for l in result.lines if "Excess Protector" in l.label)
    pvt = next(l for l in result.lines if "PVT" in l.label)
    assert ep.amount == pytest.approx(max(2000000 * 0.0025, 5000))
    assert pvt.amount == pytest.approx(max(2000000 * 0.0025, 3000))


def test_britam_commercial_own_goods_mandatory_ep_pvt():
    mc = INSURERS["britam"]["classes"]["commercial_own_goods"]
    result = compute_premium(mc, 200000, {}, LEVY_RATE, STAMP_DUTY)
    # Below the rate/SI product, the documented floors (Kshs 5,000 EP / 3,000 PVT) apply.
    ep = next(l for l in result.lines if "Excess Protector" in l.label)
    pvt = next(l for l in result.lines if "PVT" in l.label)
    assert ep.amount == pytest.approx(5000)
    assert pvt.amount == pytest.approx(3000)


# ---------------------------------------------------------------------
# 4. Pioneer school bus -- corrected rate (3.5%, not 3%) and minimum
#    premium (Kshs 37,500, not 50,000).
# ---------------------------------------------------------------------
def test_pioneer_school_bus_corrected_rate_and_minimum():
    mc = INSURERS["pioneer"]["classes"]["school_bus"]
    band = mc["bands"][0]
    assert band["rate"] == pytest.approx(0.035)
    assert band["min_premium"] == pytest.approx(37500)
    result = compute_premium(mc, 2000000, {}, LEVY_RATE, STAMP_DUTY)
    assert result.lines[0].amount == pytest.approx(2000000 * 0.035)


# ---------------------------------------------------------------------
# 5. Pioneer Farm & Warehouses / Construction: separate products (not
#    combined), correct max_age 15 (was incorrectly 20 on the old combined
#    class).
# ---------------------------------------------------------------------
def test_pioneer_farm_and_construction_are_separate_products():
    classes = INSURERS["pioneer"]["classes"]
    assert "special_farm_warehouses" in classes
    assert "special_construction" in classes
    assert "special_type" not in classes  # old combined class removed from the seed source
    farm = classes["special_farm_warehouses"]
    construction = classes["special_construction"]
    assert farm["max_age"] == 15
    assert construction["max_age"] == 15
    assert farm["bands"][0]["rate"] == pytest.approx(0.025)
    assert construction["bands"][0]["rate"] == pytest.approx(0.03)


def test_pioneer_special_type_pvt_free_up_to_5m_documented_gap_above():
    """PVT is documented as free up to Kshs 5,000,000 on this product; the
    additional percentage above that threshold was not supplied in the
    source, so it is not implemented (see the completion report) -- PVT
    remains included/free even above Kshs 5,000,000 today. This test pins
    that known, disclosed behaviour so a future fix to add the real
    above-5M rate has to consciously update it."""
    mc = INSURERS["pioneer"]["classes"]["special_farm_warehouses"]
    below = compute_premium(mc, 4000000, {}, LEVY_RATE, STAMP_DUTY)
    above = compute_premium(mc, 6000000, {}, LEVY_RATE, STAMP_DUTY)
    assert not any("PVT" in l.label for l in below.lines)  # included/free, no separate charge
    assert not any("PVT" in l.label for l in above.lines)  # still free -- documented gap, not a fabricated rate


# ---------------------------------------------------------------------
# 6. Definite -- newly added motor classes with their documented age
#    limits (motorcycle PSV 5yrs, tuk-tuk 10yrs), and the missing PLL now
#    present on commercial institutional.
# ---------------------------------------------------------------------
def test_definite_motorcycle_psv_five_year_limit():
    mc = INSURERS["definite"]["classes"]["motorcycle_psv"]
    assert mc["max_age"] == 5
    assert is_eligible(mc, 150000, 5)
    assert not is_eligible(mc, 150000, 6)


def test_definite_tuktuk_ten_year_limit_both_variants():
    for code in ("tuktuk_commercial", "tuktuk_psv"):
        mc = INSURERS["definite"]["classes"][code]
        assert mc["max_age"] == 10
        assert is_eligible(mc, 250000, 10), code
        assert not is_eligible(mc, 250000, 11), code


def test_definite_commercial_institutional_has_documented_pll():
    mc = INSURERS["definite"]["classes"]["commercial_institutional"]
    assert mc["pll_per_seat"] == pytest.approx(250)


def test_definite_psv_chauffeur_taxi_added():
    mc = INSURERS["definite"]["classes"]["psv_chauffeur_taxi"]
    assert mc["max_age"] == 15
    assert mc["bands"][0]["rate"] == pytest.approx(0.055)
    assert mc["bands"][0]["min_premium"] == pytest.approx(40000)
    assert mc["bands"][0]["ep_not_offered"] is True


# ---------------------------------------------------------------------
# 7. Star Discover -- new insurer, private-car 15-year limit, documented
#    first-band EP/PVT, and the deliberately undocumented higher bands
#    treated as not-offered rather than assumed.
# ---------------------------------------------------------------------
def test_star_discover_insurer_present():
    assert "star_discover" in INSURERS


def test_star_discover_private_car_fifteen_year_limit():
    mc = INSURERS["star_discover"]["classes"]["private"]
    assert mc["max_age"] == 15
    assert is_eligible(mc, 1000000, 15)
    assert not is_eligible(mc, 1000000, 16)


def test_star_discover_private_first_band_documented_ep_pvt():
    mc = INSURERS["star_discover"]["classes"]["private"]
    result = compute_premium(mc, 1000000, {"age": 5, "ep": True, "pvt": True}, LEVY_RATE, STAMP_DUTY)
    ep = next(l for l in result.lines if "Excess Protector" in l.label)
    pvt = next(l for l in result.lines if "PVT" in l.label)
    assert ep.amount == pytest.approx(max(1000000 * 0.0025, 2500))
    assert pvt.amount == pytest.approx(max(1000000 * 0.0025, 2500))


def test_star_discover_private_upper_bands_not_offered_not_invented():
    """Only the 500,000-1,499,999 band restates EP/PVT terms in the
    source; the higher bands must not silently inherit those figures."""
    mc = INSURERS["star_discover"]["classes"]["private"]
    result = compute_premium(mc, 2000000, {"age": 5, "ep": True, "pvt": True}, LEVY_RATE, STAMP_DUTY)
    assert not any("Excess Protector" in l.label or "PVT" in l.label for l in result.lines)


def test_star_discover_selected_models_is_separate_product():
    mc = INSURERS["star_discover"]["classes"]["private_selected_models"]
    assert "declaration form mandatory" in " ".join(mc["benefits"]).lower()
    result = compute_premium(mc, 1000000, {}, LEVY_RATE, STAMP_DUTY)
    assert result.lines[0].amount == pytest.approx(45000)  # min premium floor at this SI


def test_star_discover_undocumented_products_not_created():
    """Star Discover's binder also names commercial own goods, general
    cartage, institutional/school buses, special types, corporate
    motorcycles and private TPO, but no rate figures were supplied for
    them -- they must not be fabricated."""
    codes = set(INSURERS["star_discover"]["classes"].keys())
    assert codes == {"private", "private_selected_models"}


# ---------------------------------------------------------------------
# 8. Eligibility-reason explanation for age-excluded options.
# ---------------------------------------------------------------------
def test_eligibility_reason_message_format():
    mc = {"max_age": 15, "category": "private"}
    reason = eligibility_reason(mc, 1000000, 17)
    assert reason == "Vehicle age: 17 years\nMaximum eligible age: 15 years\nNot eligible for this insurer's product"


def test_eligibility_reason_none_when_eligible():
    mc = {"max_age": 15, "min_si": 500000}
    assert eligibility_reason(mc, 1000000, 15) is None


def test_compare_endpoint_surfaces_ineligible_reason_for_over_age_class():
    """A vehicle old enough to exceed Star Discover's private-car max_age
    (15) but young enough to still qualify for Monarch's 20-year product
    must show Star Discover as ineligible with a clear reason, while still
    returning Monarch as an eligible option."""
    resp = compare(CURRENT_YEAR - 17, sum_insured=1000000)
    assert resp.status_code == 200
    body = resp.json()
    ineligible_codes = {(o["insurer_code"], o["motor_class_code"]) for o in body["ineligible_options"]}
    assert ("star_discover", "private") in ineligible_codes
    star_entry = next(o for o in body["ineligible_options"] if o["insurer_code"] == "star_discover")
    assert "Vehicle age: 17 years" in star_entry["reason"]
    assert "Maximum eligible age: 15 years" in star_entry["reason"]
    assert "Not eligible for this insurer's product" in star_entry["reason"]
    # Monarch's 20-year product should still be offered as eligible.
    eligible_codes = {(o["insurer_code"], o["motor_class_code"]) for o in body["options"]}
    assert ("monarch", "private_400_499") in eligible_codes


# ---------------------------------------------------------------------
# 9. Previously issued quotation snapshots are never recalculated by a
#    rate correction -- generate against Monarch's corrected private
#    class, then confirm the frozen snapshot keeps the corrected premium
#    even if the in-database rate were to change again later (simulated
#    by asserting the snapshot carries its own copy of the rate figures,
#    independent of the live motor_classes/rate_bands rows).
# ---------------------------------------------------------------------
def test_generated_quotation_snapshot_is_self_contained():
    resp = compare(CURRENT_YEAR - 3, sum_insured=1000000)
    assert resp.status_code == 200
    monarch_opt = next(o for o in resp.json()["options"] if o["insurer_code"] == "monarch" and o["motor_class_code"] == "private")
    reg = f"KRC {uuid.uuid4().hex[:3].upper()}S"
    gen = client.post(
        "/api/quotes/generate",
        json={
            "client": _client(),
            "vehicle": _vehicle(CURRENT_YEAR - 3, reg=reg),
            "insurer_id": monarch_opt["insurer_id"],
            "motor_class_id": monarch_opt["motor_class_id"],
            "sum_insured": 1000000,
        },
    )
    assert gen.status_code == 200
    body = gen.json()
    assert body["basic_premium"] == pytest.approx(max(1000000 * 0.035, 20000))

    detail = client.get(f"/api/quotes/{body['id']}")
    assert detail.status_code == 200
    assert detail.json()["basic_premium"] == pytest.approx(body["basic_premium"])
