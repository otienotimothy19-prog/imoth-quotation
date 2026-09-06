"""Coverage for splitting Commercial Tuk Tuk (goods/business use, a 4th
Commercial sub-branch) from PSV Tuk Tuk (fare-paying passenger use, its own
top-level category, untouched by this change).

Covers: the migration's exact code mapping, category-level isolation
between the two (no label matching, no cross-contamination either way),
the newly-enforced allow-list on `commercial_use` (previously defined but
never actually rejected an unsupported value), Commercial Tuk Tuk's
minimal intake (no tonnage, no passenger fields), and that the reused
`commercial_use`/tonnage-band/eligibility machinery keeps working
unchanged for Own Goods, General Cartage and Commercial Institutional.
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.pricing_engine import eligibility_reason, is_eligible

client = TestClient(app)

CURRENT_YEAR = datetime.now(timezone.utc).year

# admin_token / admin_headers come from tests/conftest.py (session-scoped,
# shared across the whole suite to stay under the login rate limit).


def _unique_reg():
    return f"KTK {uuid.uuid4().hex[:3].upper()}Z"


def _unique_phone():
    return f"07{uuid.uuid4().int % 10**8:08d}"


def _get_class(admin_headers, insurer_code, class_code):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    insurer = next(i for i in insurers if i["code"] == insurer_code)
    classes = client.get("/api/admin/motor-classes", params={"insurer_id": insurer["id"]}, headers=admin_headers).json()
    return insurer, next(c for c in classes if c["code"] == class_code)


# ---------------------------------------------------------------------
# Migration smoke test: exact code mapping, no fuzzy label matching
# ---------------------------------------------------------------------
@pytest.mark.parametrize(
    "insurer_code,class_code",
    [
        ("pioneer", "tuktuk_corporate"),
        ("monarch", "tuktuk_commercial"),
        ("definite", "tuktuk_commercial"),
    ],
)
def test_migrated_commercial_tuktuk_classes(admin_headers, insurer_code, class_code):
    _, cls = _get_class(admin_headers, insurer_code, class_code)
    assert cls["category"] == "commercial"
    assert cls["commercial_use"] == "commercial_tuktuk"


def test_migrated_directline_tpo_tuktuk_commercial_keeps_tpo_category(admin_headers):
    """Directline is a TPO-only insurer bucketing every vehicle type under
    category="tpo" -- that pre-existing bucketing is untouched; only the
    commercial_use tag is set."""
    _, cls = _get_class(admin_headers, "directline", "tpo_tuktuk_commercial")
    assert cls["category"] == "tpo"
    assert cls["commercial_use"] == "commercial_tuktuk"


@pytest.mark.parametrize(
    "insurer_code,class_code",
    [
        ("monarch", "tuktuk_psv"),
        ("definite", "tuktuk_psv"),
        ("directline", "tpo_psv_tuktuk"),
    ],
)
def test_psv_tuktuk_classes_are_untouched(admin_headers, insurer_code, class_code):
    _, cls = _get_class(admin_headers, insurer_code, class_code)
    assert cls["category"] in ("tuktuk", "tpo")
    assert cls["commercial_use"] is None


def test_no_motor_class_still_uses_bare_tuktuk_for_commercial_use(admin_headers):
    """Every remaining category="tuktuk" row must be PSV-only -- none of
    them carry a commercial_use tag (that would mean the split is leaky)."""
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    for insurer in insurers:
        classes = client.get("/api/admin/motor-classes", params={"insurer_id": insurer["id"]}, headers=admin_headers).json()
        for c in classes:
            if c["category"] == "tuktuk":
                assert c["commercial_use"] is None, f"{insurer['code']}/{c['code']} is category=tuktuk but tagged commercial_use"


# ---------------------------------------------------------------------
# Allow-list enforcement: commercial_use must be rejected if unsupported.
# This tuple existed before but was never actually wired into a validator.
# ---------------------------------------------------------------------
@pytest.mark.parametrize("bad_value", ["hybrid", "tanker", "private_hire", "online_hailed", "bogus"])
def test_compare_rejects_unsupported_commercial_use(bad_value):
    resp = client.post(
        "/api/quotes/compare",
        json={
            "client": {"full_name": "Bad Commercial Use Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
            "category": "commercial",
            "commercial_use": bad_value,
            "sum_insured": 1000000,
        },
    )
    assert resp.status_code == 422


def test_generate_rejects_unsupported_commercial_use(admin_headers):
    # Use any known-good commercial class id just to exercise the request
    # shape; the validator rejects before the class is even looked up.
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    monarch = next(i for i in insurers if i["code"] == "monarch")
    classes = client.get("/api/admin/motor-classes", params={"insurer_id": monarch["id"]}, headers=admin_headers).json()
    any_commercial = next(c for c in classes if c["category"] == "commercial")
    resp = client.post(
        "/api/quotes/generate",
        json={
            "client": {"full_name": "Bad Commercial Use Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
            "insurer_id": monarch["id"],
            "motor_class_id": any_commercial["id"],
            "commercial_use": "hybrid",
            "sum_insured": 1000000,
        },
    )
    assert resp.status_code == 422


def test_valid_commercial_use_values_are_all_accepted_by_compare():
    for value in ["own_goods", "general_cartage", "commercial_tuktuk"]:
        resp = client.post(
            "/api/quotes/compare",
            json={
                "client": {"full_name": "Valid Commercial Use Client", "phone": _unique_phone()},
                "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
                "category": "commercial",
                "commercial_use": value,
                "sum_insured": 1000000,
            },
        )
        assert resp.status_code in (200, 404), f"{value} unexpectedly rejected: {resp.text}"


# ---------------------------------------------------------------------
# Category-level isolation: Commercial Tuk Tuk vs PSV Tuk Tuk must never
# cross-contaminate a comparison, in either direction.
# ---------------------------------------------------------------------
def test_commercial_tuktuk_compare_never_returns_a_psv_tuktuk_class(admin_headers):
    resp = client.post(
        "/api/quotes/compare",
        json={
            "client": {"full_name": "Commercial Tuktuk Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
            "category": "commercial",
            "commercial_use": "commercial_tuktuk",
            "sum_insured": 300000,
        },
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["options"]) > 0
    for opt in resp.json()["options"]:
        cls = client.get(f"/api/admin/motor-classes/{opt['motor_class_id']}", headers=admin_headers).json()
        assert cls["category"] == "commercial"
        assert cls["commercial_use"] == "commercial_tuktuk"


def test_psv_tuktuk_compare_never_returns_a_commercial_tuktuk_class(admin_headers):
    resp = client.post(
        "/api/quotes/compare",
        json={
            "client": {"full_name": "PSV Tuktuk Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
            "category": "tuktuk",
            "sum_insured": 300000,
        },
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["options"]) > 0
    for opt in resp.json()["options"]:
        cls = client.get(f"/api/admin/motor-classes/{opt['motor_class_id']}", headers=admin_headers).json()
        assert cls["category"] == "tuktuk"
        assert cls["commercial_use"] is None


# ---------------------------------------------------------------------
# Commercial Tuk Tuk intake: only sum_insured + year_of_manufacture. No
# tonnage, no passenger/institutional fields required or accepted.
# ---------------------------------------------------------------------
def test_generate_commercial_tuktuk_quotation_minimal_fields(admin_headers):
    _, cls = _get_class(admin_headers, "monarch", "tuktuk_commercial")
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    monarch = next(i for i in insurers if i["code"] == "monarch")

    resp = client.post(
        "/api/quotes/generate",
        json={
            "client": {"full_name": "Commercial Tuktuk Generate Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
            "insurer_id": monarch["id"],
            "motor_class_id": cls["id"],
            "commercial_use": "commercial_tuktuk",
            "sum_insured": 300000,
            "amount_paid": 0,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["commercial_use"] == "commercial_tuktuk"
    assert body["tonnage"] is None
    assert body["institution_type"] is None
    assert body["passenger_seats"] is None
    assert body["calculated_age_years"] == 3


def test_commercial_tuktuk_max_age_enforced(admin_headers):
    # Monarch's tuktuk_commercial class has max_age=10 in the approved
    # binder terms.
    _, cls = _get_class(admin_headers, "monarch", "tuktuk_commercial")
    assert cls["max_age"] == 10
    class_dict = {
        "max_age": cls["max_age"], "min_si": cls["min_si"], "max_si": cls["max_si"],
        "flat_only": cls["flat_only"], "bands": cls["bands"],
    }
    assert is_eligible(class_dict, 300000, 5)
    assert not is_eligible(class_dict, 300000, 11)
    reason = eligibility_reason(class_dict, 300000, 11)
    assert reason is not None and "age" in reason.lower()


def test_commercial_tuktuk_min_si_enforced(admin_headers):
    _, cls = _get_class(admin_headers, "monarch", "tuktuk_commercial")
    assert cls["min_si"] == 250000
    class_dict = {
        "max_age": cls["max_age"], "min_si": cls["min_si"], "max_si": cls["max_si"],
        "flat_only": cls["flat_only"], "bands": cls["bands"],
    }
    assert not is_eligible(class_dict, 100000, 3)
    assert is_eligible(class_dict, 250000, 3)


# ---------------------------------------------------------------------
# Regression: Own Goods/General Cartage tonnage rules and Commercial
# Institutional passenger rules must keep working exactly as before.
# ---------------------------------------------------------------------
def test_own_goods_still_applies_tonnage_bands(admin_headers):
    resp = client.post(
        "/api/quotes/compare",
        json={
            "client": {"full_name": "Own Goods Tonnage Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
            "category": "commercial",
            "commercial_use": "own_goods",
            "sum_insured": 1000000,
            "options": {"tonnage": 5},
        },
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["options"]) > 0


def test_commercial_institutional_still_applies_passenger_rules():
    resp = client.post(
        "/api/quotes/compare",
        json={
            "client": {"full_name": "Institutional Regression Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 3},
            "category": "commercial",
            "commercial_use": "commercial_institutional",
            "institution_type": "SCHOOL",
            "institutional_vehicle_type": "BUS",
            "passenger_category": "STUDENTS",
            "sum_insured": 1000000,
            "options": {"pll_seats": 32},
        },
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["options"]) > 0


# ---------------------------------------------------------------------
# Admin API: creating/updating a Commercial Tuk Tuk class
# ---------------------------------------------------------------------
def test_admin_can_create_commercial_tuktuk_class(admin_headers):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    insurer = next(i for i in insurers if i["active"])
    resp = client.post(
        "/api/admin/motor-classes",
        json={
            "insurer_id": insurer["id"],
            "code": f"test_commercial_tuktuk_{uuid.uuid4().hex[:8]}",
            "label": "Test Commercial Tuk Tuk",
            "category": "commercial",
            "commercial_use": "commercial_tuktuk",
            "max_age": 10,
            "min_si": 250000,
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["category"] == "commercial"
    assert body["commercial_use"] == "commercial_tuktuk"

    delete_resp = client.delete(f"/api/admin/motor-classes/{body['id']}", headers=admin_headers)
    assert delete_resp.status_code == 200


# ---------------------------------------------------------------------
# Historical quotation preservation: a quotation generated against a
# reclassified class must remain fully readable via both the client and
# admin quotation-detail endpoints.
# ---------------------------------------------------------------------
def test_reclassified_tuktuk_quotation_remains_readable(admin_headers):
    _, cls = _get_class(admin_headers, "monarch", "tuktuk_commercial")
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    monarch = next(i for i in insurers if i["code"] == "monarch")

    gen_resp = client.post(
        "/api/quotes/generate",
        json={
            "client": {"full_name": "Historical Tuktuk Client", "phone": _unique_phone()},
            "vehicle": {"registration_no": _unique_reg(), "year_of_manufacture": CURRENT_YEAR - 2},
            "insurer_id": monarch["id"],
            "motor_class_id": cls["id"],
            "commercial_use": "commercial_tuktuk",
            "sum_insured": 300000,
            "amount_paid": 0,
        },
    )
    assert gen_resp.status_code == 200, gen_resp.text
    qid = gen_resp.json()["id"]

    client_view = client.get(f"/api/quotes/{qid}")
    assert client_view.status_code == 200
    assert client_view.json()["vehicle_class_label"] == cls["label"]

    admin_view = client.get(f"/api/admin/quotations/{qid}", headers=admin_headers)
    assert admin_view.status_code == 200
    assert admin_view.json()["snapshot"]["options_used"]["commercial_use"] == "commercial_tuktuk"
