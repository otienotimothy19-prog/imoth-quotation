"""Shared fixtures for the backend test suite.

`admin_token`/`admin_headers` are session-scoped (one login for the whole
test run) rather than each test module logging in separately: the login
endpoint is rate-limited (10/minute) and every TestClient request shares
the same rate-limit key ("testclient"), so a handful of per-module logins
plus the tests that exercise login itself is enough to exceed that limit
within a single fast test run, causing unrelated tests to fail with a 429
instead of the JSON body they expect.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(scope="session")
def admin_token():
    login = client.post("/api/auth/login", json={"email": "admin@imoth.co.ke", "password": "ChangeMe123!"})
    return login.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
