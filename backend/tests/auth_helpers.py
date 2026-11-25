"""Logging in as a freshly created user in tests. Admin-created accounts
get a temporary password that must be changed before anything else works,
so this changes it (to the same password plus a suffix) and returns the
headers for the resulting session."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def login_headers(email: str, password: str) -> dict:
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    if login.json()["user"]["must_change_password"]:
        changed = client.post(
            "/api/auth/change-password",
            json={"current_password": password, "new_password": password + "Z9"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert changed.status_code == 200, changed.text
        token = changed.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
