"""Focused coverage for the required-documents-before-acceptance feature:
upload/replace/remove semantics, validation, and admin-side visibility
(list, authenticated download, verify).
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CURRENT_YEAR = datetime.now(timezone.utc).year


@pytest.fixture()
def quotation_id():
    reg = f"KDA {uuid.uuid4().hex[:3].upper()}B"
    phone = f"07{uuid.uuid4().int % 10**8:08d}"
    compare_resp = client.post(
        "/api/quotes/compare",
        json={
            "client": {"full_name": "Doc Test Client", "phone": phone, "email": "doctest@example.com"},
            "vehicle": {"registration_no": reg, "year_of_manufacture": CURRENT_YEAR - 4},
            "category": "private",
            "sum_insured": 1200000,
        },
    )
    cheapest = compare_resp.json()["options"][0]
    gen_resp = client.post(
        "/api/quotes/generate",
        json={
            "client": {"full_name": "Doc Test Client", "phone": phone, "email": "doctest@example.com"},
            "vehicle": {"registration_no": reg, "year_of_manufacture": CURRENT_YEAR - 4},
            "insurer_id": cheapest["insurer_id"],
            "motor_class_id": cheapest["motor_class_id"],
            "sum_insured": 1200000,
        },
    )
    return gen_resp.json()["id"]


@pytest.fixture()
def admin_token():
    login = client.post("/api/auth/login", json={"email": "admin@imoth.co.ke", "password": "ChangeMe123!"})
    return login.json()["access_token"]


def test_rejects_unsupported_file_type(quotation_id):
    resp = client.post(
        f"/api/quotes/{quotation_id}/documents/LOGBOOK",
        files={"file": ("logbook.exe", b"not a real document", "application/x-msdownload")},
    )
    assert resp.status_code == 400
    assert "Unsupported file type" in resp.json()["detail"]


def test_rejects_oversized_file(quotation_id):
    oversized = b"0" * (6 * 1024 * 1024)  # default max is 5MB
    resp = client.post(
        f"/api/quotes/{quotation_id}/documents/LOGBOOK",
        files={"file": ("logbook.pdf", oversized, "application/pdf")},
    )
    assert resp.status_code == 400
    assert "too large" in resp.json()["detail"]


def test_replace_supersedes_prior_upload_without_double_counting(quotation_id):
    first = client.post(
        f"/api/quotes/{quotation_id}/documents/NATIONAL_ID",
        files={"file": ("id_v1.pdf", b"%PDF-1.4 id v1", "application/pdf")},
    )
    assert first.status_code == 200
    assert first.json()["uploaded_count"] == 1

    second = client.post(
        f"/api/quotes/{quotation_id}/documents/NATIONAL_ID",
        files={"file": ("id_v2.pdf", b"%PDF-1.4 id v2", "application/pdf")},
    )
    assert second.status_code == 200
    # Replacing the same document_type must not increase the count.
    assert second.json()["uploaded_count"] == 1
    slot = next(s for s in second.json()["slots"] if s["document_type"] == "NATIONAL_ID")
    assert slot["document"]["original_filename"] == "id_v2.pdf"


def test_remove_document(quotation_id):
    client.post(
        f"/api/quotes/{quotation_id}/documents/KRA_PIN",
        files={"file": ("kra.pdf", b"%PDF-1.4 kra", "application/pdf")},
    )
    status_after_upload = client.get(f"/api/quotes/{quotation_id}/documents/status").json()
    assert status_after_upload["uploaded_count"] == 1

    remove_resp = client.delete(f"/api/quotes/{quotation_id}/documents/KRA_PIN")
    assert remove_resp.status_code == 200
    assert remove_resp.json()["uploaded_count"] == 0


def test_admin_can_list_download_and_verify_documents(quotation_id, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}

    client.post(
        f"/api/quotes/{quotation_id}/documents/LOGBOOK",
        files={"file": ("logbook.pdf", b"%PDF-1.4 logbook", "application/pdf")},
    )

    listing = client.get(f"/api/admin/quotations/{quotation_id}/documents", headers=headers)
    assert listing.status_code == 200
    docs = listing.json()["documents"]
    assert len(docs) == 1
    upload_id = docs[0]["id"]
    assert docs[0]["verification_status"] == "PENDING"

    download = client.get(
        f"/api/admin/quotations/{quotation_id}/documents/{upload_id}/download", headers=headers
    )
    assert download.status_code == 200
    assert download.content == b"%PDF-1.4 logbook"

    verify = client.post(
        f"/api/admin/quotations/{quotation_id}/documents/{upload_id}/verify",
        json={"verification_status": "VERIFIED"},
        headers=headers,
    )
    assert verify.status_code == 200
    assert verify.json()["verification_status"] == "VERIFIED"

    # Client-facing endpoints must never require admin auth.
    unauth_listing = client.get(f"/api/admin/quotations/{quotation_id}/documents")
    assert unauth_listing.status_code == 401
