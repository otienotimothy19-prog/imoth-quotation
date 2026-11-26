"""Forgot password: one-time emailed links, no account enumeration, and a
reset that ends existing sessions and clears lockouts."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.database import SessionLocal
from app.main import app
from app.models.password_reset import PasswordResetToken
from app.services import email_service
from auth_helpers import login_headers

client = TestClient(app)


@pytest.fixture
def sent(monkeypatch):
    emails = []
    monkeypatch.setattr(email_service, "send_password_reset", lambda **kw: emails.append(kw))
    return emails


@pytest.fixture
def user(admin_headers):
    email = f"reset-{uuid.uuid4().hex[:10]}@example.com"
    resp = client.post("/api/admin/users",
                       json={"email": email, "password": "TempPass123", "full_name": "Reset User", "role": "STAFF"},
                       headers=admin_headers)
    assert resp.status_code == 201
    login_headers(email, "TempPass123")  # sets the password to TempPass123Z9
    return {"id": resp.json()["id"], "email": email, "password": "TempPass123Z9"}


def _token(link: str) -> str:
    assert "/reset-password#token=" in link
    return link.split("#token=")[1]


def test_unknown_email_gets_the_same_reply_and_no_email(sent):
    resp = client.post("/api/auth/forgot-password", json={"email": "nobody-here@example.com"})
    assert resp.status_code == 200 and "If an account exists" in resp.json()["message"]
    assert sent == []


def test_reset_flow(user, sent):
    old_session = login_headers(user["email"], user["password"])
    resp = client.post("/api/auth/forgot-password", json={"email": user["email"].upper()})
    assert resp.status_code == 200 and "If an account exists" in resp.json()["message"]
    assert len(sent) == 1 and sent[0]["to_email"] == user["email"]
    token = _token(sent[0]["link"])

    weak = client.post("/api/auth/reset-password", json={"token": token, "new_password": "abcdefgh"})
    assert weak.status_code == 400

    ok = client.post("/api/auth/reset-password", json={"token": token, "new_password": "BrandNew2026"})
    assert ok.status_code == 200 and ok.json()["role"] == "STAFF"

    # The link works only once, old sessions end, and only the new password works.
    assert client.post("/api/auth/reset-password", json={"token": token, "new_password": "Another2026"}).status_code == 400
    assert client.get("/api/auth/me", headers=old_session).status_code == 401
    assert client.post("/api/auth/login", json={"email": user["email"], "password": user["password"]}).status_code == 401
    assert client.post("/api/auth/login", json={"email": user["email"], "password": "BrandNew2026"}).status_code == 200


def test_new_link_replaces_old_and_expired_links_fail(user, sent):
    client.post("/api/auth/forgot-password", json={"email": user["email"]})
    client.post("/api/auth/forgot-password", json={"email": user["email"]})
    first, second = _token(sent[0]["link"]), _token(sent[1]["link"])
    assert client.post("/api/auth/reset-password", json={"token": first, "new_password": "BrandNew2026"}).status_code == 400

    with SessionLocal() as db:
        db.query(PasswordResetToken).filter(PasswordResetToken.used_at.is_(None)).update(
            {PasswordResetToken.expires_at: datetime.now(timezone.utc) - timedelta(minutes=1)}, synchronize_session=False)
        db.commit()
    assert client.post("/api/auth/reset-password", json={"token": second, "new_password": "BrandNew2026"}).status_code == 400


def test_reset_clears_lockout(user, sent):
    for _ in range(settings.LOGIN_MAX_FAILED_ATTEMPTS):
        client.post("/api/auth/login", json={"email": user["email"], "password": "WrongPass999"})
    assert client.post("/api/auth/login", json={"email": user["email"], "password": user["password"]}).status_code == 429

    client.post("/api/auth/forgot-password", json={"email": user["email"]})
    token = _token(sent[-1]["link"])
    assert client.post("/api/auth/reset-password", json={"token": token, "new_password": "BrandNew2026"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": user["email"], "password": "BrandNew2026"}).status_code == 200


def test_disabled_account_gets_no_email(user, sent, admin_headers):
    client.patch(f"/api/admin/users/{user['id']}", json={"is_active": False}, headers=admin_headers)
    resp = client.post("/api/auth/forgot-password", json={"email": user["email"]})
    assert resp.status_code == 200 and sent == []


def test_email_failure_shows_an_error_and_leaves_no_live_link(user, monkeypatch):
    import uuid as _uuid

    def smtp_down(**kwargs):
        raise RuntimeError("SMTP unavailable")

    monkeypatch.setattr(email_service, "send_password_reset", smtp_down)
    resp = client.post("/api/auth/forgot-password", json={"email": user["email"]})
    assert resp.status_code == 503 and "couldn't send the reset email" in resp.json()["detail"]

    with SessionLocal() as db:
        live = (
            db.query(PasswordResetToken)
            .filter(PasswordResetToken.user_id == _uuid.UUID(user["id"]), PasswordResetToken.used_at.is_(None))
            .count()
        )
    assert live == 0


def test_production_refuses_to_send_localhost_links(user, sent, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "PUBLIC_APP_URL", "http://localhost:5173")
    resp = client.post("/api/auth/forgot-password", json={"email": user["email"]})
    assert resp.status_code == 503 and sent == []


def test_bad_token_rejected():
    resp = client.post("/api/auth/reset-password", json={"token": "x" * 43, "new_password": "BrandNew2026"})
    assert resp.status_code == 400 and "invalid or has expired" in resp.json()["detail"]
