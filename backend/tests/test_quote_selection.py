"""Coverage for the anonymous "Compare Quotes -> Accept This Quote" flow:
personal details are collected only after a quote is selected, via a
QuoteSelection staging record that carries zero personal information and
a short-lived access token that gates everything from that point on.

Mirrors test_api_smoke.py's compare/generate/accept walkthrough, but for
the new /select -> PATCH .../customer -> /complete-acceptance path.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.client_vehicle import Client
from app.models.quote_selection import QuoteSelection
from app.models.quotation import Quotation

client = TestClient(app)

CURRENT_YEAR = datetime.now(timezone.utc).year


def _reg():
    return f"KSE {uuid.uuid4().hex[:3].upper()}A"


def _compare(reg, sum_insured=1_200_000):
    return client.post(
        "/api/quotes/compare",
        json={
            "vehicle": {"registration_no": reg, "year_of_manufacture": CURRENT_YEAR - 4},
            "category": "private",
            "sum_insured": sum_insured,
        },
    )


def _select(reg, cheapest, sum_insured=1_200_000):
    return client.post(
        "/api/quotes/select",
        json={
            "vehicle": {"registration_no": reg, "year_of_manufacture": CURRENT_YEAR - 4},
            "category": "private",
            "insurer_id": cheapest["insurer_id"],
            "motor_class_id": cheapest["motor_class_id"],
            "sum_insured": sum_insured,
        },
    )


def _make_selection():
    reg = _reg()
    cheapest = _compare(reg).json()["options"][0]
    resp = _select(reg, cheapest)
    assert resp.status_code == 200, resp.text
    return resp.json(), cheapest


def _customer_payload(**overrides):
    payload = {
        "full_name": "Selection Test Client",
        "phone": f"07{uuid.uuid4().int % 10**8:08d}",
        "email": "selection-test@example.com",
        "id_or_passport": "A123456",
        "kra_pin": "a123456789b",
    }
    payload.update(overrides)
    return payload


def test_compare_requires_no_client_details_and_creates_no_client():
    db = SessionLocal()
    before = db.query(Client).count()
    db.close()

    resp = _compare(_reg())
    assert resp.status_code == 200
    assert resp.json()["calculated_age_years"] == 4

    db = SessionLocal()
    after = db.query(Client).count()
    db.close()
    assert after == before


def test_select_creates_selection_not_quotation():
    db = SessionLocal()
    selections_before = db.query(QuoteSelection).count()
    quotations_before = db.query(Quotation).count()
    db.close()

    selection, cheapest = _make_selection()
    assert selection["insurer_name"]
    assert selection["access_token"]
    assert selection["total_premium"] == pytest.approx(cheapest["total_premium"], abs=0.01)

    db = SessionLocal()
    assert db.query(QuoteSelection).count() == selections_before + 1
    assert db.query(Quotation).count() == quotations_before
    db.close()


def test_customer_endpoint_requires_a_matching_token():
    selection_a, _ = _make_selection()
    selection_b, _ = _make_selection()

    # No token at all.
    resp = client.patch(
        f"/api/quotes/selections/{selection_a['selection_id']}/customer",
        json=_customer_payload(),
    )
    assert resp.status_code == 401

    # A validly-signed token, but for a different selection.
    resp = client.patch(
        f"/api/quotes/selections/{selection_a['selection_id']}/customer",
        json=_customer_payload(),
        headers={"Authorization": f"Bearer {selection_b['access_token']}"},
    )
    assert resp.status_code == 403


def _run_customer_to_acceptance_flow():
    selection, cheapest = _make_selection()
    headers = {"Authorization": f"Bearer {selection['access_token']}"}

    db = SessionLocal()
    clients_before = db.query(Client).count()
    db.close()

    payload = _customer_payload()
    resp = client.patch(
        f"/api/quotes/selections/{selection['selection_id']}/customer",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    attach = resp.json()
    quotation_id = attach["quotation_id"]
    quote_token = attach["access_token"]

    db = SessionLocal()
    assert db.query(Client).count() == clients_before + 1
    db.close()

    quotation = client.get(f"/api/quotes/{quotation_id}").json()
    assert quotation["status"] == "DOCUMENTS_PENDING"
    # The premium locked at /select time must survive verbatim -- attach
    # never recalculates it.
    assert quotation["total_premium"] == pytest.approx(cheapest["total_premium"], abs=0.01)
    assert quotation["calculated_age_years"] == 4
    assert quotation["year_of_manufacture"] == CURRENT_YEAR - 4

    quote_headers = {"Authorization": f"Bearer {quote_token}"}

    # Acceptance is blocked until all three documents are uploaded.
    blocked = client.post(
        f"/api/quotes/{quotation_id}/complete-acceptance",
        json={"acceptance_confirmed": True},
        headers=quote_headers,
    )
    assert blocked.status_code == 400
    assert "Upload the vehicle logbook" in blocked.json()["detail"]

    for doc_type in ("LOGBOOK", "NATIONAL_ID", "KRA_PIN"):
        upload = client.post(
            f"/api/quotes/{quotation_id}/documents/{doc_type}",
            files={"file": (f"{doc_type.lower()}.pdf", b"%PDF-1.4 test document", "application/pdf")},
        )
        assert upload.status_code == 200, upload.text

    still_unconfirmed = client.post(
        f"/api/quotes/{quotation_id}/complete-acceptance",
        json={"acceptance_confirmed": False},
        headers=quote_headers,
    )
    assert still_unconfirmed.status_code == 400

    # Wrong token for this quotation must not be able to complete it.
    wrong_token_resp = client.post(
        f"/api/quotes/{quotation_id}/complete-acceptance",
        json={"acceptance_confirmed": True},
        headers={"Authorization": f"Bearer {selection['access_token']}"},
    )
    assert wrong_token_resp.status_code == 403

    completed = client.post(
        f"/api/quotes/{quotation_id}/complete-acceptance",
        json={"acceptance_confirmed": True},
        headers=quote_headers,
    )
    assert completed.status_code == 200, completed.text
    risk_note = completed.json()
    assert risk_note["risk_note_number"].startswith("RN-")

    final_quotation = client.get(f"/api/quotes/{quotation_id}").json()
    assert final_quotation["status"] == "ACCEPTED"
    assert final_quotation["accepted_at"] is not None
    assert final_quotation["has_risk_note"] is True

    return quotation_id, payload


def test_customer_attach_creates_client_and_quotation_then_documents_and_acceptance():
    _run_customer_to_acceptance_flow()


def test_admin_masks_id_and_kra_pin(admin_headers):
    quotation_id, payload = _run_customer_to_acceptance_flow()

    detail = client.get(f"/api/admin/quotations/{quotation_id}", headers=admin_headers)
    assert detail.status_code == 200
    body = detail.json()
    masked_id = body["client"]["id_or_passport"]
    masked_kra = body["client"]["kra_pin"]

    assert masked_id != payload["id_or_passport"]
    assert masked_id.endswith(payload["id_or_passport"][-4:])
    assert "*" in masked_id

    normalized_kra = payload["kra_pin"].strip().upper()
    assert masked_kra != normalized_kra
    assert masked_kra.endswith(normalized_kra[-4:])
    assert "*" in masked_kra


def test_expired_selection_rejected_at_customer_step():
    selection, _ = _make_selection()

    db = SessionLocal()
    row = db.get(QuoteSelection, uuid.UUID(selection["selection_id"]))
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    db.close()

    resp = client.patch(
        f"/api/quotes/selections/{selection['selection_id']}/customer",
        json=_customer_payload(),
        headers={"Authorization": f"Bearer {selection['access_token']}"},
    )
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower()


def test_customer_payload_validates_phone_and_kra_pin():
    selection, _ = _make_selection()
    headers = {"Authorization": f"Bearer {selection['access_token']}"}

    bad_phone = client.patch(
        f"/api/quotes/selections/{selection['selection_id']}/customer",
        json=_customer_payload(phone="12345"),
        headers=headers,
    )
    assert bad_phone.status_code == 422

    bad_kra = client.patch(
        f"/api/quotes/selections/{selection['selection_id']}/customer",
        json=_customer_payload(kra_pin="not-a-pin"),
        headers=headers,
    )
    assert bad_kra.status_code == 422
