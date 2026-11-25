"""Shared fixtures for the backend test suite.

`admin_token`/`admin_headers` are session-scoped (one login for the whole
test run) rather than each test module logging in separately: the login
endpoint is rate-limited (10/minute) and every TestClient request shares
the same rate-limit key ("testclient"), so a handful of per-module logins
plus the tests that exercise login itself is enough to exceed that limit
within a single fast test run, causing unrelated tests to fail with a 429
instead of the JSON body they expect.
"""
import os

# The emailed login code is covered by tests/test_login_security.py, which
# switches it on itself; the rest of the suite logs in with just a password.
os.environ.setdefault("LOGIN_OTP_ENABLED", "false")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402

client = TestClient(app)


@pytest.fixture(scope="session", autouse=True)
def _bootstrap_admin_ready():
    # A freshly seeded bootstrap admin must change its password first; the
    # suite keeps the known test password, so clear that flag (and any
    # lockout left by an earlier run) directly.
    with SessionLocal() as db:
        admin = db.query(User).filter_by(email=settings.BOOTSTRAP_ADMIN_EMAIL).one_or_none()
        if admin is not None:
            admin.must_change_password = False
            admin.locked_until = None
            admin.failed_login_count = 0
            db.commit()


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    # Every TestClient request shares one rate-limit key, so without this
    # the suite's many logins trip the per-minute login limit.
    from app.core.limiter import limiter

    limiter.reset()


@pytest.fixture(scope="session")
def admin_token():
    login = client.post("/api/auth/login", json={"email": "admin@imoth.co.ke", "password": "ChangeMe123!"})
    return login.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
