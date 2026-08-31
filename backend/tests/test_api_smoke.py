"""End-to-end smoke test for the core client + admin flows, run against a
real (test) PostgreSQL database via FastAPI's TestClient. Mirrors the manual
curl walkthrough used during development: compare -> generate -> accept
(idempotent) -> documents -> admin login -> admin dashboard/list.

Requires DATABASE_URL to point at a reachable Postgres with the schema
migrated and insurer data seeded (see README "Running tests").
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module")
def unique_reg():
    return f"KTS {uuid.uuid4().hex[:3].upper()}A"


def test_compare_generate_accept_flow(unique_reg):
    compare_resp = client.post(
        "/api/quotes/compare",
        json={
            "client": {"full_name": "Test Client", "phone": f"07{uuid.uuid4().int % 10**8:08d}", "email": "test@example.com"},
            "vehicle": {"registration_no": unique_reg, "age_years": 4},
            "category": "private",
            "sum_insured": 1200000,
        },
    )
    assert compare_resp.status_code == 200
    options = compare_resp.json()["options"]
    assert len(options) > 0
    cheapest = options[0]
    assert cheapest["total_premium"] == min(o["total_premium"] for o in options)

    phone = f"07{uuid.uuid4().int % 10**8:08d}"
    gen_resp = client.post(
        "/api/quotes/generate",
        json={
            "client": {"full_name": "Test Client", "phone": phone, "email": "test@example.com"},
            "vehicle": {"registration_no": unique_reg, "age_years": 4},
            "insurer_id": cheapest["insurer_id"],
            "motor_class_id": cheapest["motor_class_id"],
            "sum_insured": 1200000,
        },
    )
    assert gen_resp.status_code == 200, gen_resp.text
    quotation = gen_resp.json()
    assert quotation["quotation_number"].startswith("QT-")
    assert quotation["status"] == "GENERATED"
    assert quotation["total_premium"] == pytest.approx(cheapest["total_premium"], abs=0.01)
    qid = quotation["id"]

    pdf_resp = client.get(f"/api/quotes/{qid}/pdf")
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"

    # Acceptance must be blocked until all required documents are uploaded
    # and the accuracy statement is confirmed.
    blocked = client.post(f"/api/quotes/{qid}/accept", json={"acceptance_confirmed": True})
    assert blocked.status_code == 400
    assert "Upload the vehicle logbook" in blocked.json()["detail"]

    blocked_confirm = client.post(f"/api/quotes/{qid}/accept", json={"acceptance_confirmed": False})
    assert blocked_confirm.status_code == 400

    for doc_type in ("LOGBOOK", "NATIONAL_ID", "KRA_PIN"):
        upload_resp = client.post(
            f"/api/quotes/{qid}/documents/{doc_type}",
            files={"file": (f"{doc_type.lower()}.pdf", b"%PDF-1.4 test document", "application/pdf")},
        )
        assert upload_resp.status_code == 200, upload_resp.text

    status_resp = client.get(f"/api/quotes/{qid}/documents/status")
    assert status_resp.status_code == 200
    status_body = status_resp.json()
    assert status_body["all_uploaded"] is True
    assert status_body["uploaded_count"] == 3

    still_blocked = client.post(f"/api/quotes/{qid}/accept", json={"acceptance_confirmed": False})
    assert still_blocked.status_code == 400

    accept1 = client.post(f"/api/quotes/{qid}/accept", json={"acceptance_confirmed": True})
    assert accept1.status_code == 200, accept1.text
    rn1 = accept1.json()
    assert rn1["risk_note_number"].startswith("RN-")

    accept2 = client.post(f"/api/quotes/{qid}/accept", json={"acceptance_confirmed": True})
    assert accept2.status_code == 200
    rn2 = accept2.json()
    assert rn2["id"] == rn1["id"], "accept must be idempotent -- no duplicate risk note"

    docs = client.get(f"/api/documents/{qid}")
    assert docs.status_code == 200
    body = docs.json()
    assert body["quotation"]["status"] == "ACCEPTED"
    assert body["risk_note"]["status"] == "ACTIVE"

    # A locked/accepted quotation must refuse reject.
    reject_resp = client.post(f"/api/quotes/{qid}/reject", json={"reason": "changed mind"})
    assert reject_resp.status_code == 400


def test_admin_requires_auth():
    resp = client.get("/api/admin/dashboard")
    assert resp.status_code == 401


def test_admin_login_and_dashboard():
    login = client.post("/api/auth/login", json={"email": "admin@imoth.co.ke", "password": "ChangeMe123!"})
    assert login.status_code == 200
    token = login.json()["access_token"]

    dash = client.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert dash.status_code == 200
    assert "quotations_today" in dash.json()

    bad_login = client.post("/api/auth/login", json={"email": "admin@imoth.co.ke", "password": "wrong"})
    assert bad_login.status_code == 401
