"""Coverage for the Commercial Institutional reclassification: Commercial
Institutional is a passenger-carrying sub-use of category="commercial"
(school/church/company/NGO/government/hospital vehicles carrying their own
people), never a separate top-level category and never goods-carrying.

Covers: PLL rate selection by passenger category (`applies_to`, with its
untagged fallback preserved), `pll_included` never double-charging,
eligibility restrictions by institution/vehicle/passenger-category, the
authoritative backend `tonnage_required` check, admin configuration of the
new MotorClass fields, the data migration's effect on the 4 previously
`category="institutional"` seed rows, and the compare/generate API
contract for the institutional intake fields.
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.pricing_engine import compute_premium, eligibility_reason, is_eligible

client = TestClient(app)

CURRENT_YEAR = datetime.now(timezone.utc).year

# admin_token / admin_headers come from tests/conftest.py (session-scoped,
# shared across the whole suite to stay under the login rate limit).


def _unique_reg():
    return f"KIN {uuid.uuid4().hex[:3].upper()}Z"


def _unique_phone():
    return f"07{uuid.uuid4().int % 10**8:08d}"


# ---------------------------------------------------------------------
# Pricing engine: PLL rate selection by passenger category (`applies_to`)
# ---------------------------------------------------------------------
def _institutional_class(**overrides):
    base = {
        "label": "Test Institutional",
        "category": "commercial",
        "commercial_use": "commercial_institutional",
        "max_age": None,
        "min_si": 0,
        "max_si": None,
        "has_lr_toggle": False,
        "flat_only": None,
        "pll_per_seat": None,
        "pll_options": None,
        "pll_included": False,
        "bands": [
            {
                "min_si": 0, "max_si": None, "rate": 0.035, "min_premium": 30000,
                "min_passengers": None, "max_passengers": None, "min_tonnage": None, "max_tonnage": None,
                "ep_included": True, "ep_not_offered": False, "ep_rate": 0, "ep_min": 0, "ep_mandatory": False,
                "pvt_included": True, "pvt_not_offered": False, "pvt_rate": 0, "pvt_min": 0, "pvt_mandatory": False,
            }
        ],
    }
    base.update(overrides)
    return base


def test_pll_applies_to_selects_tagged_option_for_students():
    mc = _institutional_class(
        pll_options=[
            {"key": "student", "label": "Students", "rate": 250, "applies_to": ["STUDENTS"]},
            {"key": "organised", "label": "Organised group", "rate": 500, "applies_to": ["STAFF", "CHURCH_MEMBERS", "GENERAL_INSTITUTIONAL"]},
        ]
    )
    result = compute_premium(mc, 1000000, {"pll_seats": 32, "passenger_category": "STUDENTS"}, 0.0045, 40.0)
    assert result.pll_rate == 250
    assert result.pll_amount == 250 * 32
    assert any("32 seats" in l.label and "250" in l.label for l in result.lines)


def test_pll_applies_to_selects_tagged_option_for_staff():
    mc = _institutional_class(
        pll_options=[
            {"key": "student", "label": "Students", "rate": 250, "applies_to": ["STUDENTS"]},
            {"key": "organised", "label": "Organised group", "rate": 500, "applies_to": ["STAFF", "CHURCH_MEMBERS", "GENERAL_INSTITUTIONAL"]},
        ]
    )
    result = compute_premium(mc, 1000000, {"pll_seats": 10, "passenger_category": "STAFF"}, 0.0045, 40.0)
    assert result.pll_rate == 500
    assert result.pll_amount == 500 * 10


def test_pll_applies_to_falls_back_to_pll_option_key_when_untagged():
    """A class that hasn't tagged its options with `applies_to` (or is
    quoted with no passenger_category) must keep behaving exactly as
    before this feature existed -- selecting by the legacy
    `pll_option_key`, falling back to the first option."""
    mc = _institutional_class(
        pll_options=[
            {"key": "student", "label": "Students", "rate": 0},
            {"key": "corporate", "label": "Corporate", "rate": 500},
        ]
    )
    result = compute_premium(mc, 1000000, {"pll_seats": 5, "pll_option_key": "corporate"}, 0.0045, 40.0)
    assert result.pll_rate == 500
    assert result.pll_amount == 2500

    result_default = compute_premium(mc, 1000000, {"pll_seats": 5}, 0.0045, 40.0)
    assert result_default.pll_rate == 0


def test_pll_included_never_charges_and_shows_included_line():
    mc = _institutional_class(pll_included=True, pll_options=[{"key": "x", "label": "x", "rate": 999}])
    result = compute_premium(mc, 1000000, {"pll_seats": 20, "passenger_category": "STUDENTS"}, 0.0045, 40.0)
    assert result.pll_included is True
    assert result.pll_amount == 0.0
    assert any("Included" in l.label and l.amount == 0.0 for l in result.lines)
    # never double-charged from the tiered options that are also configured
    assert result.subtotal == pytest.approx(max(1000000 * 0.035, 30000))


def test_pll_included_with_zero_seats_adds_no_line():
    mc = _institutional_class(pll_included=True)
    result = compute_premium(mc, 1000000, {"pll_seats": 0}, 0.0045, 40.0)
    assert not any("Passenger Legal Liability" in l.label for l in result.lines)


# ---------------------------------------------------------------------
# Pricing engine: eligibility restrictions by institution / vehicle /
# passenger category
# ---------------------------------------------------------------------
def test_eligibility_reason_none_when_no_restriction_configured():
    mc = _institutional_class()
    assert eligibility_reason(mc, 1000000, 5, institution_type="SCHOOL", vehicle_type="VAN", passenger_category="STUDENTS") is None


def test_eligibility_rejects_mismatched_institution_type():
    mc = _institutional_class(eligible_institution_types=["SCHOOL", "CHURCH"])
    reason = eligibility_reason(mc, 1000000, 5, institution_type="COMPANY", vehicle_type="VAN", passenger_category="STAFF")
    assert reason is not None
    assert "institution type" in reason.lower()
    assert not is_eligible(mc, 1000000, 5, institution_type="COMPANY", vehicle_type="VAN", passenger_category="STAFF")
    assert is_eligible(mc, 1000000, 5, institution_type="SCHOOL", vehicle_type="VAN", passenger_category="STUDENTS")


def test_eligibility_rejects_mismatched_vehicle_type():
    mc = _institutional_class(eligible_vehicle_types=["BUS"])
    assert eligibility_reason(mc, 1000000, 5, vehicle_type="VAN") is not None
    assert eligibility_reason(mc, 1000000, 5, vehicle_type="BUS") is None


def test_eligibility_rejects_mismatched_passenger_category():
    mc = _institutional_class(eligible_passenger_categories=["STUDENTS"])
    assert eligibility_reason(mc, 1000000, 5, passenger_category="STAFF") is not None
    assert eligibility_reason(mc, 1000000, 5, passenger_category="STUDENTS") is None


def test_class_with_no_bands_yet_is_ineligible_not_a_crash():
    """A newly created (non-flat) class with no rate bands configured yet
    must be excluded with a clear reason -- not crash `find_band` with an
    IndexError on an empty list the moment it becomes eligible for a
    comparison (e.g. right after creation, before an admin has added its
    first band)."""
    mc = _institutional_class(bands=[])
    reason = eligibility_reason(mc, 1000000, 5, institution_type="SCHOOL", vehicle_type="VAN", passenger_category="STUDENTS")
    assert reason is not None
    assert "not yet been configured" in reason.lower()
    assert not is_eligible(mc, 1000000, 5)


# ---------------------------------------------------------------------
# Migration smoke test: the 4 previously category="institutional" seed
# rows must now be category="commercial", commercial_use=
# "commercial_institutional" -- exact insurer/class pairs, no fuzzy
# matching.
# ---------------------------------------------------------------------
@pytest.mark.parametrize(
    "insurer_code,class_code",
    [
        ("pioneer", "school_bus"),
        ("monarch", "commercial_institutional"),
        ("cic", "institutional"),
        ("definite", "commercial_institutional"),
    ],
)
def test_migrated_institutional_classes_are_now_commercial(admin_headers, insurer_code, class_code):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    insurer = next(i for i in insurers if i["code"] == insurer_code)
    classes = client.get("/api/admin/motor-classes", params={"insurer_id": insurer["id"]}, headers=admin_headers).json()
    cls = next(c for c in classes if c["code"] == class_code)
    assert cls["category"] == "commercial"
    assert cls["commercial_use"] == "commercial_institutional"


def test_no_motor_class_uses_the_old_institutional_category(admin_headers):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    for insurer in insurers:
        classes = client.get("/api/admin/motor-classes", params={"insurer_id": insurer["id"]}, headers=admin_headers).json()
        for c in classes:
            assert c["category"] != "institutional"


# ---------------------------------------------------------------------
# Admin API: configuring the new MotorClass fields
# ---------------------------------------------------------------------
def _an_insurer_id(admin_headers):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    return next(i for i in insurers if i["active"])["id"]


def test_create_commercial_institutional_class_with_new_fields(admin_headers):
    resp = client.post(
        "/api/admin/motor-classes",
        json={
            "insurer_id": _an_insurer_id(admin_headers),
            "code": f"test_institutional_{uuid.uuid4().hex[:8]}",
            "label": "Test Commercial Institutional",
            "category": "commercial",
            "commercial_use": "commercial_institutional",
            "min_si": 500000,
            "eligible_institution_types": ["SCHOOL", "CHURCH"],
            "eligible_vehicle_types": ["VAN", "BUS"],
            "eligible_passenger_categories": ["STUDENTS", "STAFF"],
            "tonnage_required": False,
            "pll_options": [
                {"key": "student", "label": "Students", "rate": 250, "applies_to": ["STUDENTS"]},
                {"key": "staff", "label": "Staff", "rate": 500, "applies_to": ["STAFF"]},
            ],
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["category"] == "commercial"
    assert body["commercial_use"] == "commercial_institutional"
    assert body["eligible_institution_types"] == ["SCHOOL", "CHURCH"]
    assert body["eligible_vehicle_types"] == ["VAN", "BUS"]
    assert body["eligible_passenger_categories"] == ["STUDENTS", "STAFF"]
    assert body["pll_options"][0]["applies_to"] == ["STUDENTS"]


def test_create_class_rejects_invalid_commercial_use(admin_headers):
    resp = client.post(
        "/api/admin/motor-classes",
        json={
            "insurer_id": _an_insurer_id(admin_headers),
            "code": f"test_bad_use_{uuid.uuid4().hex[:8]}",
            "label": "Bad Commercial Use",
            "category": "commercial",
            "commercial_use": "not_a_real_use",
            "min_si": 500000,
        },
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_update_class_eligibility_and_tonnage_required_round_trip(admin_headers):
    created = client.post(
        "/api/admin/motor-classes",
        json={
            "insurer_id": _an_insurer_id(admin_headers),
            "code": f"test_update_institutional_{uuid.uuid4().hex[:8]}",
            "label": "Test Update Institutional",
            "category": "commercial",
            "commercial_use": "commercial_institutional",
            "min_si": 500000,
        },
        headers=admin_headers,
    ).json()

    resp = client.patch(
        f"/api/admin/motor-classes/{created['id']}",
        json={
            "eligible_institution_types": ["HOSPITAL"],
            "tonnage_required": True,
            "pll_included": True,
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["eligible_institution_types"] == ["HOSPITAL"]
    assert body["tonnage_required"] is True
    assert body["pll_included"] is True


# ---------------------------------------------------------------------
# Compare / generate API integration
# ---------------------------------------------------------------------
def test_compare_requires_institutional_intake_fields_when_flagged():
    resp = client.post(
        "/api/quotes/compare",
        json={
            "client": {"full_name": "Test Institutional Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
            "category": "commercial",
            "commercial_use": "commercial_institutional",
            "sum_insured": 1000000,
            "options": {"pll_seats": 32},
        },
    )
    assert resp.status_code == 422


def test_compare_commercial_never_returns_a_psv_class(admin_headers):
    resp = client.post(
        "/api/quotes/compare",
        json={
            "client": {"full_name": "Own Goods Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
            "category": "commercial",
            "commercial_use": "own_goods",
            "sum_insured": 1000000,
        },
    )
    assert resp.status_code == 200, resp.text
    for opt in resp.json()["options"]:
        cls = client.get(f"/api/admin/motor-classes/{opt['motor_class_id']}", headers=admin_headers).json()
        assert cls["category"] == "commercial"
        assert cls["commercial_use"] == "own_goods"


def test_general_cartage_compare_succeeds_without_institutional_fields():
    resp = client.post(
        "/api/quotes/compare",
        json={
            "client": {"full_name": "General Cartage Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
            "category": "commercial",
            "commercial_use": "general_cartage",
            "sum_insured": 1000000,
        },
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["options"]) > 0


def _generate_institutional_quotation(admin_headers, insurer_code, class_code, *, passenger_category, seats=10, sum_insured=1000000):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    insurer = next(i for i in insurers if i["code"] == insurer_code)
    classes = client.get("/api/admin/motor-classes", params={"insurer_id": insurer["id"]}, headers=admin_headers).json()
    cls = next(c for c in classes if c["code"] == class_code)

    payload = {
        "client": {"full_name": "Institutional Passenger Test", "phone": _unique_phone()},
        "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
        "insurer_id": insurer["id"],
        "motor_class_id": cls["id"],
        "commercial_use": "commercial_institutional",
        "institution_type": "SCHOOL",
        "institutional_vehicle_type": "BUS",
        "passenger_category": passenger_category,
        "sum_insured": sum_insured,
        "options": {"pll_seats": seats},
        "amount_paid": 0,
    }
    resp = client.post("/api/quotes/generate", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_monarch_commercial_institutional_students_get_tagged_rate(admin_headers):
    # Monarch's Commercial Institutional class rates Students at
    # KES 250/seat and everyone else (organised groups) at KES 500/seat --
    # exactly the rates that must never be hard-coded as universal, only
    # ever read from this insurer's own configured pll_options.
    q = _generate_institutional_quotation(admin_headers, "monarch", "commercial_institutional", passenger_category="STUDENTS", seats=32)
    assert q["pll_rate"] == 250
    assert q["pll_amount"] == 250 * 32
    assert q["passenger_category"] == "STUDENTS"
    assert q["institution_type"] == "SCHOOL"
    assert q["institutional_vehicle_type"] == "BUS"
    assert q["passenger_seats"] == 32


def test_monarch_commercial_institutional_staff_get_organised_group_rate(admin_headers):
    q = _generate_institutional_quotation(admin_headers, "monarch", "commercial_institutional", passenger_category="STAFF", seats=10)
    assert q["pll_rate"] == 500
    assert q["pll_amount"] == 500 * 10


def test_tonnage_required_rejected_at_generate_without_tonnage(admin_headers):
    created = client.post(
        "/api/admin/motor-classes",
        json={
            "insurer_id": _an_insurer_id(admin_headers),
            "code": f"test_tonnage_required_{uuid.uuid4().hex[:8]}",
            "label": "Test Tonnage Required",
            "category": "commercial",
            "commercial_use": "own_goods",
            "min_si": 500000,
            "tonnage_required": True,
        },
        headers=admin_headers,
    ).json()
    bands_resp = client.put(
        f"/api/admin/rates/{created['id']}",
        json={
            "bands": [{"min_si": 500000, "max_si": None, "rate": 0.04, "min_premium": 30000}],
            "change_reason": "test setup",
        },
        headers=admin_headers,
    )
    assert bands_resp.status_code == 200, bands_resp.text

    insurer_id = created["insurer_id"]
    resp = client.post(
        "/api/quotes/generate",
        json={
            "client": {"full_name": "Tonnage Test Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
            "insurer_id": insurer_id,
            "motor_class_id": created["id"],
            "commercial_use": "own_goods",
            "sum_insured": 1000000,
            "options": {},
            "amount_paid": 0,
        },
    )
    assert resp.status_code == 400
    assert "tonnage" in resp.json()["detail"].lower()

    resp_ok = client.post(
        "/api/quotes/generate",
        json={
            "client": {"full_name": "Tonnage Test Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
            "insurer_id": insurer_id,
            "motor_class_id": created["id"],
            "commercial_use": "own_goods",
            "sum_insured": 1000000,
            "options": {"tonnage": 5},
            "amount_paid": 0,
        },
    )
    assert resp_ok.status_code == 200, resp_ok.text
