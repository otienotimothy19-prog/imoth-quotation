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
