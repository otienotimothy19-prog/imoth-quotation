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
    disposition = pdf.headers["content-disposition"]
    assert 'filename="Imoth_Quote_' in disposition and vehicle["registration_no"].replace(" ", "_") in disposition

    # The public client journey still requires client details.
    public = client.post("/api/quotes/generate", json=body)
    assert public.status_code == 422


def test_compare_rates_for_staff_and_agents(admin_headers):
    """Staff/agents compare every insurer's price without creating any
    customer offers; customers and anonymous callers can't use it."""
    from app.database import SessionLocal
    from app.models.quote_selection import QuoteSelection

    year = datetime.now(timezone.utc).year
    body = {"vehicle": {"registration_no": "TBA", "year_of_manufacture": year - 3},
            "category": "private", "sum_insured": 1300000}
    with SessionLocal() as db:
        offers_before = db.query(QuoteSelection).count()

    resp = client.post("/api/admin/quotations/compare", json=body, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    options = resp.json()["options"]
    assert len(options) >= 2
    totals = [o["total_premium"] for o in options]
    assert totals == sorted(totals)
    assert len({o["insurer_id"] for o in options}) >= 2

    with SessionLocal() as db:
        assert db.query(QuoteSelection).count() == offers_before

    assert client.post("/api/admin/quotations/compare", json=body).status_code == 401


def test_compare_extras_and_courtesy_car(admin_headers):
    """Each compared option says which extras can be added and what they
    cost; a quotation with a courtesy car period includes it as a line."""
    from app.database import SessionLocal
    from app.models.insurer_rate import MotorClass

    year = datetime.now(timezone.utc).year
    body = {"vehicle": {"registration_no": "TBA", "year_of_manufacture": year - 3},
            "category": "private", "sum_insured": 1300000}
    data = client.post("/api/admin/quotations/compare", json=body, headers=admin_headers).json()
    assert 0 < data["levy_rate"] < 0.01
    for option in data["options"]:
        extras = option["extras"]
        assert extras["ep"]["status"] in {"optional", "included", "mandatory", "not_offered"}
        if extras["ep"]["status"] == "optional":
            assert extras["ep"]["amount"] > 0

    # Pioneer and CIC private classes had courtesy car prices in their wording.
    with_cc = [o for o in data["options"] if o["extras"]["courtesy_car"]]
    assert with_cc, "expected at least one insurer offering a courtesy car"
    option = with_cc[0]
    cc = option["extras"]["courtesy_car"][0]

    quote = client.post(
        "/api/admin/quotations",
        json={"vehicle": {"registration_no": "KCC 101C", "year_of_manufacture": year - 3},
              "insurer_id": option["insurer_id"], "motor_class_id": option["motor_class_id"],
              "sum_insured": 1300000, "options": {"courtesy_days": cc["days"]}},
        headers=admin_headers,
    ).json()
    labels = [i["label"] for i in quote["items"]]
    assert f"Courtesy Car ({cc['days']} days)" in labels
    assert round(quote["subtotal"], 2) == round(option["subtotal"] + cc["amount"], 2)

    # Admins can set courtesy car prices on any class.
    with SessionLocal() as db:
        target = db.query(MotorClass).filter(MotorClass.id == option["motor_class_id"]).one()
        original = target.courtesy_car_options
    resp = client.patch(f"/api/admin/motor-classes/{option['motor_class_id']}",
                        json={"courtesy_car_options": [{"days": 20, "premium": 6500}, {"days": 10, "premium": 3500}]},
                        headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert [o["days"] for o in resp.json()["courtesy_car_options"]] == [10, 20]
    client.patch(f"/api/admin/motor-classes/{option['motor_class_id']}",
                 json={"courtesy_car_options": original or []}, headers=admin_headers)


def test_courtesy_car_wording_parser():
    from app.services.rate_config import courtesy_car_options_from_benefits

    assert courtesy_car_options_from_benefits(["Courtesy Car: 4,500 (10 days) / 7,500 (20 days)"]) == [
        {"days": 10, "premium": 4500.0}, {"days": 20, "premium": 7500.0}]
    assert courtesy_car_options_from_benefits(["Medical Expenses Kshs 30,000"]) == []
