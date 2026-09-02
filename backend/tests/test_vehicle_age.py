"""Automatic vehicle-age calculation: the backend, not the client, is the
source of truth. Age is always derived from year_of_manufacture and the
current calendar year, and a client-supplied age can never change pricing
or eligibility.
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import vehicle_age

client = TestClient(app)

CURRENT_YEAR = datetime.now(timezone.utc).year


def _client(phone=None):
    return {
        "full_name": "Age Test Client",
        "phone": phone or f"07{uuid.uuid4().int % 10**8:08d}",
        "email": "agetest@example.com",
    }


def _vehicle(reg=None, year_of_manufacture=None, **extra):
    v = {"registration_no": reg or f"KAG {uuid.uuid4().hex[:3].upper()}A", **extra}
    if year_of_manufacture is not None:
        v["year_of_manufacture"] = year_of_manufacture
    return v


def compare(vehicle, category="private", sum_insured=1200000):
    return client.post(
        "/api/quotes/compare",
        json={"client": _client(), "vehicle": vehicle, "category": category, "sum_insured": sum_insured},
    )


# 1. Current year minus manufacture year produces the correct age.
def test_age_calculated_correctly():
    resp = compare(_vehicle(year_of_manufacture=CURRENT_YEAR - 7))
    assert resp.status_code == 200
    assert resp.json()["calculated_age_years"] == 7


# 2. A current-year vehicle produces age zero.
def test_current_year_vehicle_is_age_zero():
    resp = compare(_vehicle(year_of_manufacture=CURRENT_YEAR))
    assert resp.status_code == 200
    assert resp.json()["calculated_age_years"] == 0


# 3. A future manufacture year is rejected.
def test_future_year_rejected():
    resp = compare(_vehicle(year_of_manufacture=CURRENT_YEAR + 1))
    assert resp.status_code == 422
    detail = str(resp.json())
    assert str(CURRENT_YEAR) in detail


# 4. A missing manufacture year is rejected.
def test_missing_year_rejected():
    resp = compare(_vehicle())  # no year_of_manufacture at all
    assert resp.status_code == 422


def test_year_below_minimum_rejected():
    resp = compare(_vehicle(year_of_manufacture=1899))
    assert resp.status_code == 422
    assert "1960" in str(resp.json())


# 5 & 6. A customer-supplied age is ignored and can't manipulate pricing or
# eligibility -- a manipulated age_years must produce an identical result to
# the same request with no age_years at all (in-range values are silently
# ignored; wildly out-of-range ones are rejected outright at the schema
# layer -- the spec sanctions either as "ignore or reject").
def test_supplied_age_years_is_ignored():
    year = CURRENT_YEAR - 5
    honest = compare(_vehicle(year_of_manufacture=year))
    manipulated_young = compare(_vehicle(year_of_manufacture=year, age_years=0))
    manipulated_old = compare(_vehicle(year_of_manufacture=year, age_years=80))

    assert honest.status_code == manipulated_young.status_code == manipulated_old.status_code == 200
    honest_body, young_body, old_body = honest.json(), manipulated_young.json(), manipulated_old.json()

    assert honest_body["calculated_age_years"] == 5
    assert young_body["calculated_age_years"] == 5
    assert old_body["calculated_age_years"] == 5

    honest_totals = sorted(o["total_premium"] for o in honest_body["options"])
    young_totals = sorted(o["total_premium"] for o in young_body["options"])
    old_totals = sorted(o["total_premium"] for o in old_body["options"])
    assert honest_totals == young_totals == old_totals
    assert len(honest_body["options"]) == len(young_body["options"]) == len(old_body["options"])


def test_wildly_out_of_range_supplied_age_is_rejected():
    resp = compare(_vehicle(year_of_manufacture=CURRENT_YEAR - 5, age_years=99))
    assert resp.status_code == 422


def test_supplied_age_cannot_change_generated_quotation():
    year = CURRENT_YEAR - 5
    reg = f"KAG {uuid.uuid4().hex[:3].upper()}B"
    opts = compare(_vehicle(reg=reg, year_of_manufacture=year)).json()["options"]
    cheapest = opts[0]

    honest_gen = client.post(
        "/api/quotes/generate",
        json={
            "client": _client(),
            "vehicle": _vehicle(reg=f"{reg}1", year_of_manufacture=year),
            "insurer_id": cheapest["insurer_id"],
            "motor_class_id": cheapest["motor_class_id"],
            "sum_insured": 1200000,
        },
    )
    manipulated_gen = client.post(
        "/api/quotes/generate",
        json={
            "client": _client(),
            "vehicle": _vehicle(reg=f"{reg}2", year_of_manufacture=year, age_years=0),
            "insurer_id": cheapest["insurer_id"],
            "motor_class_id": cheapest["motor_class_id"],
            "sum_insured": 1200000,
        },
    )
    assert honest_gen.status_code == manipulated_gen.status_code == 200
    assert honest_gen.json()["total_premium"] == manipulated_gen.json()["total_premium"]
    assert honest_gen.json()["calculated_age_years"] == manipulated_gen.json()["calculated_age_years"] == 5


# 7 & 8. Boundary behaviour at an insurer/class's configured maximum age.
def _narrowest_max_age():
    """Find the smallest configured max_age among eligible private-class
    options for a brand-new vehicle, so the boundary test isn't tied to a
    specific insurer's seed data."""
    resp = compare(_vehicle(year_of_manufacture=CURRENT_YEAR))
    finite = [o["max_age"] for o in resp.json()["options"] if o["max_age"] is not None]
    assert finite, "expected at least one private motor class with a configured max_age"
    return min(finite)


def test_vehicle_at_max_age_remains_eligible():
    max_age = _narrowest_max_age()
    resp = compare(_vehicle(year_of_manufacture=CURRENT_YEAR - max_age))
    assert resp.status_code == 200
    ages_seen = [o["max_age"] for o in resp.json()["options"]]
    assert max_age in ages_seen, "a class whose max_age equals the vehicle age should still be offered"


def test_vehicle_above_max_age_excluded():
    max_age = _narrowest_max_age()
    resp = compare(_vehicle(year_of_manufacture=CURRENT_YEAR - max_age - 1))
    if resp.status_code == 404:
        # every private class had this exact max_age -- correctly excluded all of them
        return
    assert resp.status_code == 200
    for opt in resp.json()["options"]:
        assert opt["max_age"] is None or opt["max_age"] >= max_age + 1


# 10 & 11. Historical quotations keep the age used at generation time, even
# after the calendar year changes; a fresh quotation uses the current year.
def test_historical_quotation_keeps_original_age_after_year_changes():
    reg = f"KAG {uuid.uuid4().hex[:3].upper()}H"
    with patch.object(vehicle_age, "current_year", return_value=2026):
        opts = compare(_vehicle(reg=reg, year_of_manufacture=2019)).json()["options"]
        cheapest = opts[0]
        gen = client.post(
            "/api/quotes/generate",
            json={
                "client": _client(),
                "vehicle": _vehicle(reg=reg, year_of_manufacture=2019),
                "insurer_id": cheapest["insurer_id"],
                "motor_class_id": cheapest["motor_class_id"],
                "sum_insured": 1200000,
            },
        )
        assert gen.status_code == 200
        body = gen.json()
        assert body["calculated_age_years"] == 7
        qid = body["id"]

    # Move the simulated "current year" forward and re-fetch: the stored
    # quotation must still show age 7, not a recalculated 8.
    with patch.object(vehicle_age, "current_year", return_value=2027):
        refetched = client.get(f"/api/quotes/{qid}")
        assert refetched.status_code == 200
        assert refetched.json()["calculated_age_years"] == 7
        assert refetched.json()["year_of_manufacture"] == 2019

        # A brand new quotation generated "in 2027" for the same
        # manufacture year must use the new current year (age 8).
        opts_2027 = compare(_vehicle(reg=f"{reg}-2027", year_of_manufacture=2019)).json()
        assert opts_2027["calculated_age_years"] == 8


# 12. Third-party journeys (age-independent max_age=None classes) keep working.
def test_third_party_only_journey_unaffected():
    resp = compare(_vehicle(year_of_manufacture=CURRENT_YEAR - 30), category="tpo", sum_insured=0)
    assert resp.status_code == 200
    assert len(resp.json()["options"]) > 0


def test_admin_quotation_detail_shows_snapshot_age_not_recalculated():
    reg = f"KAG {uuid.uuid4().hex[:3].upper()}D"
    with patch.object(vehicle_age, "current_year", return_value=2026):
        opts = compare(_vehicle(reg=reg, year_of_manufacture=2019)).json()["options"]
        cheapest = opts[0]
        gen = client.post(
            "/api/quotes/generate",
            json={
                "client": _client(),
                "vehicle": _vehicle(reg=reg, year_of_manufacture=2019),
                "insurer_id": cheapest["insurer_id"],
                "motor_class_id": cheapest["motor_class_id"],
                "sum_insured": 1200000,
            },
        )
        qid = gen.json()["id"]

    login = client.post("/api/auth/login", json={"email": "admin@imoth.co.ke", "password": "ChangeMe123!"})
    token = login.json()["access_token"]
    with patch.object(vehicle_age, "current_year", return_value=2030):
        detail = client.get(f"/api/admin/quotations/{qid}", headers={"Authorization": f"Bearer {token}"})
    assert detail.status_code == 200
    vehicle = detail.json()["vehicle"]
    assert vehicle["year_of_manufacture"] == 2019
    assert vehicle["age_years"] == 7
