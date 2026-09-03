"""Coverage for the admin-panel audit: backend validation, self-protection
and last-Super-Admin guards on user management, the risk-note void guard,
dashboard date-range validation, flat-rate change versioning, and filename
sanitization -- everything that must hold true regardless of what the
frontend does or doesn't send.
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import storage_service

client = TestClient(app)

CURRENT_YEAR = datetime.now(timezone.utc).year


@pytest.fixture(scope="module")
def admin_token():
    login = client.post("/api/auth/login", json={"email": "admin@imoth.co.ke", "password": "ChangeMe123!"})
    return login.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _unique_email():
    return f"test-{uuid.uuid4().hex[:10]}@example.com"


def _make_quotation():
    reg = f"KAP {uuid.uuid4().hex[:3].upper()}Z"
    phone = f"07{uuid.uuid4().int % 10**8:08d}"
    compare_resp = client.post(
        "/api/quotes/compare",
        json={
            "client": {"full_name": "Admin Panel Test", "phone": phone, "email": "adminpaneltest@example.com"},
            "vehicle": {"registration_no": reg, "year_of_manufacture": CURRENT_YEAR - 3},
            "category": "private",
            "sum_insured": 1000000,
        },
    )
    cheapest = compare_resp.json()["options"][0]
    gen_resp = client.post(
        "/api/quotes/generate",
        json={
            "client": {"full_name": "Admin Panel Test", "phone": phone, "email": "adminpaneltest@example.com"},
            "vehicle": {"registration_no": reg, "year_of_manufacture": CURRENT_YEAR - 3},
            "insurer_id": cheapest["insurer_id"],
            "motor_class_id": cheapest["motor_class_id"],
            "sum_insured": 1000000,
        },
    )
    return gen_resp.json()["id"]


def _accept_quotation(quotation_id):
    for doc_type, name in [("LOGBOOK", "logbook.pdf"), ("NATIONAL_ID", "id.pdf"), ("KRA_PIN", "kra.pdf")]:
        client.post(
            f"/api/quotes/{quotation_id}/documents/{doc_type}",
            files={"file": (name, b"%PDF-1.4 doc", "application/pdf")},
        )
    resp = client.post(f"/api/quotes/{quotation_id}/accept", json={"acceptance_confirmed": True})
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]  # risk note id


# ---------------------------------------------------------------------
# Dashboard date-range validation
# ---------------------------------------------------------------------
def test_dashboard_rejects_start_after_end(admin_headers):
    resp = client.get(
        "/api/admin/dashboard",
        params={"date_from": "2026-06-01T00:00:00", "date_to": "2026-01-01T23:59:59.999"},
        headers=admin_headers,
    )
    assert resp.status_code == 400
    assert "before" in resp.json()["detail"].lower()


def test_dashboard_accepts_full_day_end_of_range(admin_headers):
    resp = client.get(
        "/api/admin/dashboard",
        params={"date_from": "2026-01-01T00:00:00", "date_to": "2026-01-01T23:59:59.999"},
        headers=admin_headers,
    )
    assert resp.status_code == 200


def test_dashboard_requires_admin_auth():
    resp = client.get("/api/admin/dashboard")
    assert resp.status_code == 401


# ---------------------------------------------------------------------
# Admin Users: self-protection and last-Super-Admin guards (backend-
# enforced, independent of whatever the frontend disables)
# ---------------------------------------------------------------------
def test_admin_cannot_disable_own_account(admin_headers):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    resp = client.patch(f"/api/admin/users/{me['id']}", json={"is_active": False}, headers=admin_headers)
    assert resp.status_code == 400
    assert "own account" in resp.json()["detail"].lower()


def test_admin_cannot_change_own_role(admin_headers):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    resp = client.patch(f"/api/admin/users/{me['id']}", json={"role": "STAFF"}, headers=admin_headers)
    assert resp.status_code == 400
    assert "own role" in resp.json()["detail"].lower()


def test_cannot_disable_or_demote_the_last_active_super_admin(admin_headers):
    # The bootstrap admin is a SUPER_ADMIN. Create a second admin (non-super)
    # to act on it from, and confirm the *target* super admin (bootstrap)
    # can't be disabled/demoted by a different account either, once it's
    # confirmed to be the only active one.
    me = client.get("/api/auth/me", headers=admin_headers).json()
    only_super_admins = client.get("/api/admin/users", headers=admin_headers).json()
    active_supers = [u for u in only_super_admins if u["role"] == "SUPER_ADMIN" and u["is_active"]]
    if len(active_supers) != 1 or active_supers[0]["id"] != me["id"]:
        pytest.skip("Bootstrap admin is not the sole active Super Admin in this environment")

    resp = client.patch(f"/api/admin/users/{me['id']}", json={"is_active": False}, headers=admin_headers)
    assert resp.status_code == 400  # caught by the self-protection guard first, but still rejected


def test_last_active_super_admin_guard_survives_a_reduction_sequence(admin_headers):
    """Demoting a Super Admin from a *different* active Super Admin account
    is allowed as long as at least one other stays active; once reduced to
    exactly one, that guard (and separately, self-protection) stop it from
    going to zero.

    Note: because this endpoint itself requires the caller to already be an
    active Super Admin, a non-self actor mathematically can never be the
    one to trigger the "last active Super Admin" guard against someone
    else -- disabling any other active Super Admin always leaves the actor
    themselves still active. That branch of the guard exists as
    defence-in-depth (e.g. against a future change to who may call this
    endpoint), not as something reachable through this API today. What's
    verified here is the reachable part: the reduction down to one, and
    that the one remaining account can't remove itself.
    """
    create = client.post(
        "/api/admin/users",
        json={"email": _unique_email(), "password": "SecondSuper1", "full_name": "Second Super", "role": "SUPER_ADMIN"},
        headers=admin_headers,
    )
    assert create.status_code == 201, create.text
    second_super = create.json()

    login2 = client.post("/api/auth/login", json={"email": second_super["email"], "password": "SecondSuper1"})
    headers2 = {"Authorization": f"Bearer {login2.json()['access_token']}"}

    me = client.get("/api/auth/me", headers=admin_headers).json()
    # Two active Super Admins exist, so demoting the bootstrap one from the
    # second account succeeds (one, second_super, remains active).
    demote = client.patch(f"/api/admin/users/{me['id']}", json={"role": "ADMIN"}, headers=headers2)
    assert demote.status_code == 200
    try:
        # second_super is now the only active Super Admin. It cannot demote
        # or disable itself.
        self_demote = client.patch(f"/api/admin/users/{second_super['id']}", json={"role": "ADMIN"}, headers=headers2)
        assert self_demote.status_code == 400

        self_disable = client.patch(f"/api/admin/users/{second_super['id']}", json={"is_active": False}, headers=headers2)
        assert self_disable.status_code == 400
    finally:
        # Restore bootstrap admin to SUPER_ADMIN so later tests in this
        # shared-DB run aren't affected.
        client.patch(f"/api/admin/users/{me['id']}", json={"role": "SUPER_ADMIN"}, headers=headers2)


def test_create_user_rejects_short_password(admin_headers):
    resp = client.post(
        "/api/admin/users",
        json={"email": _unique_email(), "password": "short", "full_name": "Weak Pw", "role": "STAFF"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_create_user_rejects_duplicate_email(admin_headers):
    email = _unique_email()
    first = client.post(
        "/api/admin/users",
        json={"email": email, "password": "LongEnough1", "full_name": "First", "role": "STAFF"},
        headers=admin_headers,
    )
    assert first.status_code == 201
    dup = client.post(
        "/api/admin/users",
        json={"email": email, "password": "LongEnough1", "full_name": "Second", "role": "STAFF"},
        headers=admin_headers,
    )
    assert dup.status_code == 400


def test_user_management_requires_super_admin_not_just_admin(admin_headers):
    # A STAFF/ADMIN-role account must not be able to create or modify users.
    create = client.post(
        "/api/admin/users",
        json={"email": _unique_email(), "password": "LongEnough1", "full_name": "Plain Admin", "role": "ADMIN"},
        headers=admin_headers,
    )
    plain_admin = create.json()
    login = client.post("/api/auth/login", json={"email": plain_admin["email"], "password": "LongEnough1"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = client.post(
        "/api/admin/users",
        json={"email": _unique_email(), "password": "LongEnough1", "full_name": "Nope", "role": "STAFF"},
        headers=headers,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------
# Risk note void guard: cannot void an already-inactive risk note
# ---------------------------------------------------------------------
def test_cannot_void_an_already_inactive_risk_note(admin_headers):
    risk_note_id = _accept_quotation(_make_quotation())

    first_void = client.post(
        f"/api/admin/risk-notes/{risk_note_id}/void",
        json={"new_status": "VOID", "reason": "Client cancelled"},
        headers=admin_headers,
    )
    assert first_void.status_code == 200
    assert first_void.json()["status"] == "VOID"

    second_void = client.post(
        f"/api/admin/risk-notes/{risk_note_id}/void",
        json={"new_status": "CANCELLED", "reason": "Trying again"},
        headers=admin_headers,
    )
    assert second_void.status_code == 400
    assert "already" in second_void.json()["detail"].lower()


# ---------------------------------------------------------------------
# Rate band validation: contradictions, negatives, ranges, overlaps
# ---------------------------------------------------------------------
def _get_a_banded_motor_class(admin_headers):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    pioneer = next(i for i in insurers if i["code"] == "pioneer")
    classes = client.get("/api/admin/motor-classes", params={"insurer_id": pioneer["id"]}, headers=admin_headers).json()
    return next(c for c in classes if c["code"] == "private")


def _valid_band(**overrides):
    band = {
        "min_si": 500000, "max_si": 999999, "rate": 0.06, "min_premium": 37500,
        "ep_included": False, "ep_not_offered": False, "ep_rate": 0.0025, "ep_min": 5000, "ep_mandatory": False,
        "pvt_included": False, "pvt_not_offered": False, "pvt_rate": 0.0025, "pvt_min": 2500, "pvt_mandatory": False,
    }
    band.update(overrides)
    return band


def test_rate_band_rejects_ep_included_and_not_offered_together(admin_headers):
    cls = _get_a_banded_motor_class(admin_headers)
    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={"bands": [_valid_band(ep_included=True, ep_not_offered=True)], "bands_alt": None, "change_reason": "test"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_rate_band_rejects_mandatory_combined_with_included(admin_headers):
    cls = _get_a_banded_motor_class(admin_headers)
    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={"bands": [_valid_band(ep_included=True, ep_mandatory=True)], "bands_alt": None, "change_reason": "test"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_rate_band_rejects_negative_values(admin_headers):
    cls = _get_a_banded_motor_class(admin_headers)
    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={"bands": [_valid_band(rate=-0.01)], "bands_alt": None, "change_reason": "test"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_rate_band_rejects_max_si_below_min_si(admin_headers):
    cls = _get_a_banded_motor_class(admin_headers)
    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={"bands": [_valid_band(min_si=1000000, max_si=500000)], "bands_alt": None, "change_reason": "test"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_rate_bands_reject_overlap(admin_headers):
    cls = _get_a_banded_motor_class(admin_headers)
    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={
            "bands": [_valid_band(min_si=500000, max_si=1500000), _valid_band(min_si=1000000, max_si=2000000)],
            "bands_alt": None,
            "change_reason": "test",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_rate_bands_reject_empty_list(admin_headers):
    cls = _get_a_banded_motor_class(admin_headers)
    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={"bands": [], "bands_alt": None, "change_reason": "test"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_rate_bands_reject_blank_change_reason(admin_headers):
    cls = _get_a_banded_motor_class(admin_headers)
    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={"bands": [_valid_band()], "bands_alt": None, "change_reason": "   "},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_valid_rate_band_update_succeeds_and_versions(admin_headers):
    cls = _get_a_banded_motor_class(admin_headers)
    before_versions = client.get(f"/api/admin/rates/{cls['id']}/versions", headers=admin_headers).json()

    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={"bands": [_valid_band()], "bands_alt": None, "change_reason": "test: valid update"},
        headers=admin_headers,
    )
    assert resp.status_code == 200

    after_versions = client.get(f"/api/admin/rates/{cls['id']}/versions", headers=admin_headers).json()
    assert len(after_versions) == len(before_versions) + 1
    assert after_versions[0]["change_reason"] == "test: valid update"


# ---------------------------------------------------------------------
# PSV rate bands limited by number of passengers
# ---------------------------------------------------------------------
def _get_a_psv_banded_motor_class(admin_headers):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    for insurer in insurers:
        classes = client.get("/api/admin/motor-classes", params={"insurer_id": insurer["id"]}, headers=admin_headers).json()
        for c in classes:
            if c["category"] == "psv" and not c.get("flat_only") and c.get("bands"):
                return c
    pytest.fail("No banded PSV motor class found in seed data")


def test_rate_band_passenger_limits_round_trip(admin_headers):
    cls = _get_a_psv_banded_motor_class(admin_headers)
    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={
            "bands": [_valid_band(min_passengers=7, max_passengers=14)],
            "bands_alt": None,
            "change_reason": "test: add passenger limit",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200

    fetched = client.get(f"/api/admin/rates/{cls['id']}", headers=admin_headers).json()
    assert fetched["bands"][0]["min_passengers"] == 7
    assert fetched["bands"][0]["max_passengers"] == 14


def test_rate_bands_same_si_range_but_different_passenger_ranges_do_not_conflict(admin_headers):
    cls = _get_a_psv_banded_motor_class(admin_headers)
    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={
            "bands": [
                _valid_band(min_si=500000, max_si=None, min_passengers=7, max_passengers=14),
                _valid_band(min_si=500000, max_si=None, min_passengers=15, max_passengers=33),
            ],
            "bands_alt": None,
            "change_reason": "test: split by passenger count",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200
    fetched = client.get(f"/api/admin/rates/{cls['id']}", headers=admin_headers).json()
    passenger_ranges = {(b["min_passengers"], b["max_passengers"]) for b in fetched["bands"]}
    assert passenger_ranges == {(7, 14), (15, 33)}


def test_rate_bands_reject_overlap_with_same_passenger_range(admin_headers):
    cls = _get_a_psv_banded_motor_class(admin_headers)
    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={
            "bands": [
                _valid_band(min_si=500000, max_si=None, min_passengers=7, max_passengers=20),
                _valid_band(min_si=500000, max_si=None, min_passengers=15, max_passengers=33),
            ],
            "bands_alt": None,
            "change_reason": "test",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_rate_band_rejects_max_passengers_below_min_passengers(admin_headers):
    cls = _get_a_psv_banded_motor_class(admin_headers)
    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={"bands": [_valid_band(min_passengers=20, max_passengers=5)], "bands_alt": None, "change_reason": "test"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_rate_band_rejects_negative_passenger_limits(admin_headers):
    cls = _get_a_psv_banded_motor_class(admin_headers)
    resp = client.put(
        f"/api/admin/rates/{cls['id']}",
        json={"bands": [_valid_band(min_passengers=-1)], "bands_alt": None, "change_reason": "test"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------
# Flat-rate editing via the motor-classes endpoint, versioned
# ---------------------------------------------------------------------
def test_flat_rate_requires_premium_or_rate_on_si(admin_headers):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    kenyaorient = next(i for i in insurers if i["code"] == "kenyaorient")
    classes = client.get("/api/admin/motor-classes", params={"insurer_id": kenyaorient["id"]}, headers=admin_headers).json()
    flat_cls = next(c for c in classes if c["flat_only"])

    resp = client.patch(
        f"/api/admin/motor-classes/{flat_cls['id']}",
        json={"flat_only": {"premium": None, "rate_on_si": None, "min_premium": None, "note": ""}},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_flat_rate_update_with_change_reason_creates_rate_version(admin_headers):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    kenyaorient = next(i for i in insurers if i["code"] == "kenyaorient")
    classes = client.get("/api/admin/motor-classes", params={"insurer_id": kenyaorient["id"]}, headers=admin_headers).json()
    flat_cls = next(c for c in classes if c["flat_only"])

    before_versions = client.get(f"/api/admin/rates/{flat_cls['id']}/versions", headers=admin_headers).json()

    resp = client.patch(
        f"/api/admin/motor-classes/{flat_cls['id']}",
        json={"flat_only": {"premium": 3500, "rate_on_si": None, "min_premium": None, "note": "updated"}, "change_reason": "test flat update"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["flat_only"]["premium"] == 3500

    after_versions = client.get(f"/api/admin/rates/{flat_cls['id']}/versions", headers=admin_headers).json()
    assert len(after_versions) == len(before_versions) + 1
    assert after_versions[0]["change_reason"] == "test flat update"


# ---------------------------------------------------------------------
# Adding a brand-new flat-rate (e.g. Third Party Only) class for an
# insurer that has no such product yet -- must not disturb that
# insurer's existing Comprehensive/banded classes in any way.
# ---------------------------------------------------------------------
def test_create_flat_rate_class_succeeds_without_disturbing_comprehensive_class(admin_headers):
    comprehensive = _get_a_banded_motor_class(admin_headers)
    comprehensive_before = client.get(f"/api/admin/rates/{comprehensive['id']}", headers=admin_headers).json()

    resp = client.post(
        "/api/admin/motor-classes",
        json={
            "insurer_id": comprehensive["insurer_id"],
            "code": f"tpo_test_{uuid.uuid4().hex[:8]}",
            "label": "Third Party Only – Private (test)",
            "category": "tpo",
            "min_si": 0,
            "max_si": None,
            "flat_only": {"premium": 3200, "rate_on_si": None, "min_premium": None, "note": "Annual premium"},
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201
    created = resp.json()
    assert created["flat_only"]["premium"] == 3200
    assert created["active"] is True

    # New product is independently visible and editable via the Rates screen.
    fetched_rates = client.get(f"/api/admin/rates/{created['id']}", headers=admin_headers).json()
    assert fetched_rates["flat_only"]["premium"] == 3200

    # The pre-existing comprehensive class for the same insurer is untouched.
    comprehensive_after = client.get(f"/api/admin/rates/{comprehensive['id']}", headers=admin_headers).json()
    assert comprehensive_after == comprehensive_before


def test_create_flat_rate_class_requires_premium_or_rate_on_si(admin_headers):
    comprehensive = _get_a_banded_motor_class(admin_headers)
    resp = client.post(
        "/api/admin/motor-classes",
        json={
            "insurer_id": comprehensive["insurer_id"],
            "code": f"tpo_test_{uuid.uuid4().hex[:8]}",
            "label": "Third Party Only – invalid (test)",
            "category": "tpo",
            "flat_only": {"premium": None, "rate_on_si": None, "min_premium": None, "note": ""},
        },
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_newly_created_flat_rate_class_can_be_disabled_independently(admin_headers):
    comprehensive = _get_a_banded_motor_class(admin_headers)
    create_resp = client.post(
        "/api/admin/motor-classes",
        json={
            "insurer_id": comprehensive["insurer_id"],
            "code": f"tpo_test_{uuid.uuid4().hex[:8]}",
            "label": "Third Party Only – disable test",
            "category": "tpo",
            "flat_only": {"premium": 2800, "rate_on_si": None, "min_premium": None, "note": ""},
        },
        headers=admin_headers,
    )
    new_id = create_resp.json()["id"]

    disable_resp = client.patch(f"/api/admin/motor-classes/{new_id}", json={"active": False}, headers=admin_headers)
    assert disable_resp.status_code == 200
    assert disable_resp.json()["active"] is False

    # Disabling it must not touch the comprehensive class's active state.
    comprehensive_after = client.get(f"/api/admin/motor-classes/{comprehensive['id']}", headers=admin_headers).json()
    assert comprehensive_after["active"] is True


# ---------------------------------------------------------------------
# Motor class deletion: permanent removal, allowed only when unused
# ---------------------------------------------------------------------
def test_delete_unused_motor_class_succeeds(admin_headers):
    comprehensive = _get_a_banded_motor_class(admin_headers)
    create_resp = client.post(
        "/api/admin/motor-classes",
        json={
            "insurer_id": comprehensive["insurer_id"],
            "code": f"delete_test_{uuid.uuid4().hex[:8]}",
            "label": "Delete Test Class",
            "category": "tpo",
            "flat_only": {"premium": 1000, "rate_on_si": None, "min_premium": None, "note": ""},
        },
        headers=admin_headers,
    )
    new_id = create_resp.json()["id"]

    delete_resp = client.delete(f"/api/admin/motor-classes/{new_id}", headers=admin_headers)
    assert delete_resp.status_code == 200
    assert delete_resp.json()["deleted"] is True

    fetch_resp = client.get(f"/api/admin/motor-classes/{new_id}", headers=admin_headers)
    assert fetch_resp.status_code == 404

    # The comprehensive class used only to source a valid insurer_id above
    # must be completely unaffected.
    comprehensive_after = client.get(f"/api/admin/motor-classes/{comprehensive['id']}", headers=admin_headers).json()
    assert comprehensive_after["active"] is True


def test_delete_motor_class_with_quotations_detaches_them_without_losing_history(admin_headers):
    comprehensive = _get_a_banded_motor_class(admin_headers)
    create_resp = client.post(
        "/api/admin/motor-classes",
        json={
            "insurer_id": comprehensive["insurer_id"],
            "code": f"delete_used_{uuid.uuid4().hex[:8]}",
            "label": "Delete Used Test Class",
            "category": "tpo",
            "flat_only": {"premium": 1000, "rate_on_si": None, "min_premium": None, "note": ""},
        },
        headers=admin_headers,
    )
    new_id = create_resp.json()["id"]

    reg = f"KDU {uuid.uuid4().hex[:3].upper()}Z"
    phone = f"07{uuid.uuid4().int % 10**8:08d}"
    gen_resp = client.post(
        "/api/quotes/generate",
        json={
            "client": {"full_name": "Delete Test Client", "phone": phone, "email": "deletetest@example.com"},
            "vehicle": {"registration_no": reg, "year_of_manufacture": CURRENT_YEAR - 3},
            "insurer_id": comprehensive["insurer_id"],
            "motor_class_id": new_id,
            "sum_insured": 500000,
        },
    )
    assert gen_resp.status_code == 200, gen_resp.text
    quotation_id = gen_resp.json()["id"]
    before = client.get(f"/api/admin/quotations/{quotation_id}", headers=admin_headers).json()

    delete_resp = client.delete(f"/api/admin/motor-classes/{new_id}", headers=admin_headers)
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json()["quotations_detached"] == 1

    # The class itself is really gone now.
    fetch_class_resp = client.get(f"/api/admin/motor-classes/{new_id}", headers=admin_headers)
    assert fetch_class_resp.status_code == 404

    # But the quotation survives with its pricing/label untouched -- it
    # never dereferences the live class, only its own denormalized snapshot.
    after = client.get(f"/api/admin/quotations/{quotation_id}", headers=admin_headers).json()
    assert after["quotation_number"] == before["quotation_number"]
    assert after["vehicle_class_label"] == before["vehicle_class_label"] == "Delete Used Test Class"
    assert after["total_premium"] == before["total_premium"]


def test_delete_missing_motor_class_returns_404(admin_headers):
    resp = client.delete(f"/api/admin/motor-classes/{uuid.uuid4()}", headers=admin_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------
# Motor class Sum-Insured range validation
# ---------------------------------------------------------------------
def test_motor_class_update_rejects_max_si_below_min_si(admin_headers):
    cls = _get_a_banded_motor_class(admin_headers)
    resp = client.patch(f"/api/admin/motor-classes/{cls['id']}", json={"min_si": 1000000, "max_si": 500000}, headers=admin_headers)
    assert resp.status_code == 422


# ---------------------------------------------------------------------
# Insurer logo upload: content-type/size validation, filename sanitization
# ---------------------------------------------------------------------
def test_insurer_logo_rejects_wrong_content_type(admin_headers):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    ins = insurers[0]
    resp = client.post(
        f"/api/admin/insurers/{ins['id']}/logo",
        files={"file": ("logo.exe", b"not an image", "application/x-msdownload")},
        headers=admin_headers,
    )
    assert resp.status_code == 400


def test_insurer_logo_rejects_empty_file(admin_headers):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    ins = insurers[0]
    resp = client.post(
        f"/api/admin/insurers/{ins['id']}/logo",
        files={"file": ("logo.png", b"", "image/png")},
        headers=admin_headers,
    )
    assert resp.status_code == 400


def test_insurer_logo_upload_with_traversal_filename_stays_sandboxed(admin_headers):
    insurers = client.get("/api/admin/insurers", headers=admin_headers).json()
    ins = insurers[0]
    resp = client.post(
        f"/api/admin/insurers/{ins['id']}/logo",
        files={"file": ("../../../../etc/cron.d/evil.png", b"\x89PNG fake logo bytes", "image/png")},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    updated = client.get("/api/admin/insurers", headers=admin_headers).json()
    ins_after = next(i for i in updated if i["id"] == ins["id"])
    assert ".." not in ins_after["logo_path"]
    # The stored path must resolve inside the configured storage root, not
    # escape it via the attacker-supplied filename.
    resolved = storage_service.absolute_path(ins_after["logo_path"]).resolve()
    assert str(resolved).startswith(str(storage_service._root().resolve()))


def test_insurer_create_requires_name_and_code(admin_headers):
    resp = client.post("/api/admin/insurers", json={"code": "  ", "name": "Something"}, headers=admin_headers)
    assert resp.status_code == 422

    resp2 = client.post("/api/admin/insurers", json={"code": "validcode1", "name": "   "}, headers=admin_headers)
    assert resp2.status_code == 422


def test_insurer_create_rejects_duplicate_code(admin_headers):
    code = f"testins{uuid.uuid4().hex[:6]}"
    first = client.post("/api/admin/insurers", json={"code": code, "name": "Test Insurer One"}, headers=admin_headers)
    assert first.status_code == 201
    dup = client.post("/api/admin/insurers", json={"code": code, "name": "Test Insurer Two"}, headers=admin_headers)
    assert dup.status_code == 400


# ---------------------------------------------------------------------
# Settings: numeric validation, Super Admin gate
# ---------------------------------------------------------------------
def test_settings_rejects_out_of_range_levy_rate(admin_headers):
    resp = client.put("/api/admin/settings", json={"values": {"levy.rate": 1.5}}, headers=admin_headers)
    assert resp.status_code == 422


def test_settings_rejects_negative_validity_days(admin_headers):
    resp = client.put("/api/admin/settings", json={"values": {"quotation.validity_days": -5}}, headers=admin_headers)
    assert resp.status_code == 422


def test_settings_write_requires_super_admin(admin_headers):
    create = client.post(
        "/api/admin/users",
        json={"email": _unique_email(), "password": "LongEnough1", "full_name": "Plain Admin 2", "role": "ADMIN"},
        headers=admin_headers,
    )
    plain_admin = create.json()
    login = client.post("/api/auth/login", json={"email": plain_admin["email"], "password": "LongEnough1"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    # Read is allowed for any admin role...
    read_resp = client.get("/api/admin/settings", headers=headers)
    assert read_resp.status_code == 200
    # ...but write is Super-Admin only.
    write_resp = client.put("/api/admin/settings", json={"values": {"levy.rate": 0.005}}, headers=headers)
    assert write_resp.status_code == 403


# ---------------------------------------------------------------------
# storage_service.sanitize_filename: unit-level path traversal coverage
# ---------------------------------------------------------------------
@pytest.mark.parametrize(
    "raw,expected_no_traversal",
    [
        ("../../../etc/passwd", True),
        ("..\\..\\windows\\system32\\evil.exe", True),
        ("normal_file.pdf", True),
        ("a/b/c/d.png", True),
        ("", True),
    ],
)
def test_sanitize_filename_never_contains_path_separators_or_dotdot(raw, expected_no_traversal):
    result = storage_service.sanitize_filename(raw)
    assert "/" not in result
    assert "\\" not in result
    assert ".." not in result
    assert result != ""


def test_save_bytes_with_malicious_filename_stays_inside_storage_root():
    storage_path, _ = storage_service.save_bytes(
        b"test content", subdir="test_subdir", filename="../../../../tmp/evil_escape.txt"
    )
    resolved = storage_service.absolute_path(storage_path).resolve()
    assert str(resolved).startswith(str(storage_service._root().resolve()))
    assert storage_service.read_bytes(storage_path) == b"test content"
