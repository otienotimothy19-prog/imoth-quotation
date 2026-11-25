"""Read-only reporting fields used by the redesigned admin pages."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_dashboard_reporting_fields(admin_headers):
    data = client.get("/api/admin/dashboard", headers=admin_headers).json()
    for key in ("total_quotations", "total_risk_notes", "active_insurers", "registered_users", "by_category", "trend"):
        assert key in data
    assert len(data["trend"]) == 30
    assert sum(p["count"] for p in data["trend"]) <= data["total_quotations"]
    assert all(set(c) == {"category", "count"} for c in data["by_category"])

    ranged = client.get(
        "/api/admin/dashboard",
        params={"date_from": "2026-01-01T00:00:00", "date_to": "2026-01-07T23:59:59"},
        headers=admin_headers,
    ).json()
    assert [p["date"] for p in ranged["trend"]][:2] == ["2026-01-01", "2026-01-02"]
    assert len(ranged["trend"]) == 7


def test_quotation_list_fields_and_category_filter(admin_headers):
    page = client.get("/api/admin/quotations", params={"page_size": 5}, headers=admin_headers).json()
    for item in page["items"]:
        assert {"sum_insured", "amount_paid", "balance", "vehicle_category"} <= set(item)
    private = client.get("/api/admin/quotations", params={"vehicle_category": "private", "page_size": 50}, headers=admin_headers).json()
    assert all(i["vehicle_category"] == "private" for i in private["items"])


def test_risk_note_list_summary(admin_headers):
    data = client.get("/api/admin/risk-notes", headers=admin_headers).json()
    assert "status_counts" in data and "premium_total" in data
    assert sum(data["status_counts"].values()) == data["total"]
    for item in data["items"]:
        assert "cover_type" in item
