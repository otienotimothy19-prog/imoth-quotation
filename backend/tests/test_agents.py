"""Agent accounts: self-signup, admin approval, long-lived login with
silent renewal, and agents only ever seeing their own quotations."""
import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.main import app

client = TestClient(app)


def _agent_payload():
    return {
        "email": f"agent-{uuid.uuid4().hex[:10]}@example.com",
        "password": "AgentPass123",
        "full_name": "Test Agent",
        "phone": "0712345678",
    }


def test_agent_signup_approval_and_persistent_login(admin_headers):
    payload = _agent_payload()
    resp = client.post("/api/auth/agent-signup", json=payload)
    assert resp.status_code == 201

    # Duplicate email is rejected.
    assert client.post("/api/auth/agent-signup", json=payload).status_code == 400

    # Not approved yet -> cannot log in, with a clear message.
    resp = client.post("/api/auth/login", json={"email": payload["email"], "password": payload["password"]})
    assert resp.status_code == 403
    assert "awaiting approval" in resp.json()["detail"]

    users = client.get("/api/admin/users", headers=admin_headers).json()
    agent = next(u for u in users if u["email"] == payload["email"])
    assert agent["role"] == "AGENT" and agent["is_active"] is False and agent["phone"] == "0712345678"

    resp = client.post(f"/api/admin/users/{agent['id']}/approve", headers=admin_headers)
    assert resp.status_code == 200 and resp.json()["is_active"] is True

    resp = client.post("/api/auth/login", json={"email": payload["email"], "password": payload["password"]})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    claims = jwt.get_unverified_claims(token)
    days_valid = (claims["exp"] - datetime.now(timezone.utc).timestamp()) / 86400
    assert days_valid > settings.AGENT_TOKEN_EXPIRE_DAYS - 1

    headers = {"Authorization": f"Bearer {token}"}
    refreshed = client.post("/api/auth/refresh", headers=headers)
    assert refreshed.status_code == 200 and refreshed.json()["user"]["role"] == "AGENT"

    # Agent sees only their own (currently zero) quotations and none of the admin area.
    mine = client.get("/api/agent/quotations", headers=headers)
    assert mine.status_code == 200 and mine.json()["total"] == 0
    assert client.get("/api/admin/quotations", headers=headers).status_code == 403
    assert client.get("/api/admin/users", headers=headers).status_code == 403
    assert client.get("/api/admin/insurers", headers=headers).status_code == 200

    # Someone else's quotation PDF is hidden from the agent.
    others = client.get("/api/admin/quotations", headers=admin_headers).json()["items"]
    if others:
        resp = client.get(f"/api/admin/quotations/{others[0]['id']}/pdf", headers=headers)
        assert resp.status_code == 404

    # Disabling the agent ends their session immediately despite the long-lived token.
    client.patch(f"/api/admin/users/{agent['id']}", json={"is_active": False}, headers=admin_headers)
    assert client.post("/api/auth/refresh", headers=headers).status_code == 401


def test_approve_only_applies_to_agents(admin_headers):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    assert client.post(f"/api/admin/users/{me['id']}/approve", headers=admin_headers).status_code == 404


def test_staff_quotation_without_client_details(admin_headers):
    """The New Quotation form no longer asks for client details: the quote
    is issued to "To be confirmed", and each such quote gets its own
    placeholder client rather than merging into one."""
    year = datetime.now(timezone.utc).year
    vehicle = {"registration_no": f"KNC {uuid.uuid4().hex[:3].upper()}A", "year_of_manufacture": year - 3}
    option = client.post(
        "/api/quotes/compare",
        json={"client": {"full_name": "Compare Only", "phone": "0700000000"}, "vehicle": vehicle,
              "category": "private", "sum_insured": 1000000},
    ).json()["options"][0]
    body = {"vehicle": vehicle, "insurer_id": option["insurer_id"], "motor_class_id": option["motor_class_id"],
            "sum_insured": 1000000}

    first = client.post("/api/admin/quotations", json=body, headers=admin_headers)
    assert first.status_code == 200, first.text
    assert first.json()["client_name"] == "To be confirmed"
    second = client.post("/api/admin/quotations", json=body, headers=admin_headers)
    assert second.status_code == 200
    assert first.json()["quotation_number"] != second.json()["quotation_number"]

    pdf = client.get(f"/api/admin/quotations/{first.json()['id']}/pdf", headers=admin_headers)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    # The public client journey still requires client details.
    public = client.post("/api/quotes/generate", json=body)
    assert public.status_code == 422
