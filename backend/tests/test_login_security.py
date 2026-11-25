"""Login security: emailed one-time codes, account lockout, forced and
voluntary password changes, signing out everywhere, the customer-email
lock on document emails, and upload content checks."""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import email_service
from auth_helpers import login_headers

client = TestClient(app)
CURRENT_YEAR = datetime.now(timezone.utc).year


def _email():
    return f"sec-{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture
def staff_user(admin_headers):
    """An active STAFF user who has already replaced their temporary password."""
    email = _email()
    resp = client.post(
        "/api/admin/users",
        json={"email": email, "password": "TempPass123", "full_name": "Sec Staff", "role": "STAFF"},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["must_change_password"] is True
    login_headers(email, "TempPass123")  # changes it to TempPass123Z9
    return {"id": resp.json()["id"], "email": email, "password": "TempPass123Z9"}


@pytest.fixture
def otp_on(monkeypatch):
    sent = []
    monkeypatch.setattr(settings, "LOGIN_OTP_ENABLED", True)
    monkeypatch.setattr(settings, "LOGIN_OTP_RESEND_COOLDOWN_SECONDS", 0)
    monkeypatch.setattr(email_service, "send_login_code", lambda **kw: sent.append(kw))
    return sent


def test_login_requires_emailed_code(staff_user, otp_on):
    resp = client.post("/api/auth/login", json={"email": staff_user["email"], "password": staff_user["password"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["otp_required"] is True and body["access_token"] is None
    assert body["email_hint"].endswith("@example.com") and "***" in body["email_hint"]
    assert otp_on[-1]["to_email"] == staff_user["email"]
    code = otp_on[-1]["code"]

    wrong = "000000" if code != "000000" else "111111"
    bad = client.post("/api/auth/verify-otp", json={"challenge_id": body["challenge_id"], "code": wrong})
    assert bad.status_code == 400 and "attempts left" in bad.json()["detail"]

    ok = client.post("/api/auth/verify-otp", json={"challenge_id": body["challenge_id"], "code": code})
    assert ok.status_code == 200
    token = ok.json()["access_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200

    # A code can only be used once.
    again = client.post("/api/auth/verify-otp", json={"challenge_id": body["challenge_id"], "code": code})
    assert again.status_code == 400


def test_resend_replaces_the_code(staff_user, otp_on):
    body = client.post("/api/auth/login", json={"email": staff_user["email"], "password": staff_user["password"]}).json()
    first = otp_on[-1]["code"]
    assert client.post("/api/auth/resend-otp", json={"challenge_id": body["challenge_id"]}).status_code == 200
    second = otp_on[-1]["code"]
    if first != second:
        old = client.post("/api/auth/verify-otp", json={"challenge_id": body["challenge_id"], "code": first})
        assert old.status_code == 400
    ok = client.post("/api/auth/verify-otp", json={"challenge_id": body["challenge_id"], "code": second})
    assert ok.status_code == 200


def test_account_locks_after_repeated_wrong_passwords(staff_user, admin_headers):
    for _ in range(settings.LOGIN_MAX_FAILED_ATTEMPTS):
        resp = client.post("/api/auth/login", json={"email": staff_user["email"], "password": "WrongPass999"})
        assert resp.status_code == 401
    # Locked: even the right password is refused for now.
    locked = client.post("/api/auth/login", json={"email": staff_user["email"], "password": staff_user["password"]})
    assert locked.status_code == 429 and "locked" in locked.json()["detail"]

    # An admin can lift the lock.
    assert client.post(f"/api/admin/users/{staff_user['id']}/unlock", headers=admin_headers).status_code == 200
    ok = client.post("/api/auth/login", json={"email": staff_user["email"], "password": staff_user["password"]})
    assert ok.status_code == 200


def test_temporary_password_must_be_changed_first(admin_headers):
    email = _email()
    client.post(
        "/api/admin/users",
        json={"email": email, "password": "TempPass123", "full_name": "New Staff", "role": "ADMIN"},
        headers=admin_headers,
    )
    login = client.post("/api/auth/login", json={"email": email, "password": "TempPass123"}).json()
    headers = {"Authorization": f"Bearer {login['access_token']}"}
    blocked = client.get("/api/admin/quotations", headers=headers)
    assert blocked.status_code == 403 and blocked.json()["detail"] == "PASSWORD_CHANGE_REQUIRED"

    weak = client.post(
        "/api/auth/change-password", json={"current_password": "TempPass123", "new_password": "abcdefgh"}, headers=headers
    )
    assert weak.status_code == 400

    changed = client.post(
        "/api/auth/change-password", json={"current_password": "TempPass123", "new_password": "MyOwnPass456"}, headers=headers
    )
    assert changed.status_code == 200
    new_headers = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert client.get("/api/admin/quotations", headers=new_headers).status_code == 200
    # The old token (issued before the change) no longer works.
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_sign_out_everywhere(staff_user, admin_headers):
    headers = login_headers(staff_user["email"], staff_user["password"])
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.post("/api/auth/logout-all", headers=headers).status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401

    headers = login_headers(staff_user["email"], staff_user["password"])
    assert client.post(f"/api/admin/users/{staff_user['id']}/revoke-sessions", headers=admin_headers).status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_api_responses_carry_security_headers():
    resp = client.get("/api/health")
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert resp.headers["Cache-Control"] == "no-store"


def _quotation(email):
    reg = f"KSE {uuid.uuid4().hex[:3].upper()}Q"
    phone = f"07{uuid.uuid4().int % 10**8:08d}"
    client_in = {"full_name": "Security Test", "phone": phone, "email": email}
    vehicle = {"registration_no": reg, "year_of_manufacture": CURRENT_YEAR - 3}
    option = client.post(
        "/api/quotes/compare", json={"client": client_in, "vehicle": vehicle, "category": "private", "sum_insured": 1000000}
    ).json()["options"][0]
    gen = client.post(
        "/api/quotes/generate",
        json={"client": client_in, "vehicle": vehicle, "insurer_id": option["insurer_id"],
              "motor_class_id": option["motor_class_id"], "sum_insured": 1000000},
    )
    return gen.json()["id"]


def test_documents_only_emailed_to_customer_address(monkeypatch):
    sent = []
    monkeypatch.setattr(email_service, "_send_smtp", lambda **kw: sent.append(kw))
    qid = _quotation("owner@example.com")
    resp = client.post(f"/api/documents/{qid}/email", json={"to_email": "attacker@evil.example", "include_quotation": True})
    assert resp.status_code == 200
    assert sent and sent[-1]["to_email"] == "owner@example.com"
    assert resp.json()["recipient"] == "ow***@example.com"

    listing = client.get(f"/api/documents/{qid}").json()
    assert "client_email" not in listing and listing["client_email_masked"] == "ow***@example.com"


def test_upload_rejects_file_whose_contents_dont_match_its_type():
    qid = _quotation(None)
    fake = client.post(
        f"/api/quotes/{qid}/documents/LOGBOOK",
        files={"file": ("logbook.pdf", b"MZ\x90\x00 this is really an exe", "application/pdf")},
    )
    assert fake.status_code == 400 and "valid PDF or image" in fake.json()["detail"]
    real = client.post(
        f"/api/quotes/{qid}/documents/LOGBOOK", files={"file": ("logbook.pdf", b"%PDF-1.4 real", "application/pdf")}
    )
    assert real.status_code == 200
