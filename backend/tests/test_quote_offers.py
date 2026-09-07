"""Real database/API regression coverage for anonymous secured offers."""
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.limiter import limiter
from app.core.security import create_quote_access_token
from app.database import SessionLocal
from app.models.client_vehicle import Client
from app.models.quote_selection import QuoteSelection
from app.models.enums import QuoteSelectionStatus
from app.models.documents_email_audit import AuditLog
from app.services import email_service, offer_pdf_service

client = TestClient(app)

@pytest.fixture(autouse=True)
def reset_limits():
    limiter._storage.reset()


def compare():
    result = client.post('/api/quotes/compare', json={
        'category': 'private', 'sum_insured': 1500000,
        'vehicle': {'registration_no': 'KAA 123A', 'year_of_manufacture': datetime.now().year-4,
                    'make': '<b>Toyota & Sons</b>', 'model': 'Test <model>'}})
    assert result.status_code == 200, result.text
    return result.json()['options']


def headers(offer, **extra):
    return {'Authorization': f"Bearer {offer['offer_token']}", **extra}


def test_pdf_and_email_use_locked_insurer_and_total_without_client(monkeypatch):
    with SessionLocal() as db:
        before = db.query(Client).count()
    offers = compare()
    offer = offers[-1]
    path = f"/api/quote-offers/{offer['offer_id']}"
    assert client.get(path, headers=headers(offer)).json()['status'] == 'OFFERED'
    seen = []
    real_render = offer_pdf_service.render_offer_pdf
    def capture(stored, company):
        seen.append((str(stored.id), stored.snapshot_data['insurer_name'], float(stored.total_premium)))
        return real_render(stored, company)
    monkeypatch.setattr(offer_pdf_service, 'render_offer_pdf', capture)
    pdf = client.get(path+'/pdf?total_premium=1&insurer_name=Fake', headers=headers(offer))
    assert pdf.status_code == 200, pdf.text
    assert pdf.content.startswith(b'%PDF')
    assert 'KAA123A' in pdf.headers['content-disposition']
    assert offer['offer_id'] not in pdf.headers['content-disposition']
    assert seen[-1] == (offer['offer_id'], offer['insurer_name'], offer['total_premium'])
    smtp = Mock()
    monkeypatch.setattr(email_service, '_send_smtp', smtp)
    h = headers(offer, **{'Idempotency-Key': str(uuid.uuid4())})
    result = client.post(path+'/email', json={'email': ' client@EXAMPLE.com '}, headers=h)
    assert result.status_code == 200, result.text
    sent = smtp.call_args.kwargs
    assert sent['to_email'] == 'client@example.com'
    assert offer_pdf_service.OFFER_TITLE in sent['body']
    assert offer_pdf_service.OFFER_NOTICE in sent['body']
    assert offer['insurer_name'] in sent['body']
    assert f"KES {offer['total_premium']:,.2f}" in sent['body']
    assert '#token=' in sent['body']
    assert sent['attachments'][0][1].startswith(b'%PDF')
    assert seen[-1][2] == offer['total_premium']
    assert client.post(path+'/email', json={'email': 'client@example.com'}, headers=h).status_code == 200
    assert smtp.call_count == 1
    tampered = client.post(path+'/email', json={'email': 'client@example.com', 'total_premium': 1}, headers=h)
    assert tampered.status_code == 422
    with SessionLocal() as db:
        assert db.query(Client).count() == before
        row = db.get(QuoteSelection, uuid.UUID(offer['offer_id']))
        assert row.status == QuoteSelectionStatus.OFFERED
        assert row.snapshot_data['offer_selected'] is False
        logs = db.query(AuditLog).filter(AuditLog.entity_id == offer['offer_id']).all()
        assert any(log.action == 'pdf_downloaded' and log.new_value['status'] == 'success' for log in logs)
        assert any(log.action == 'email_sent' and log.new_value['status'] == 'sent' for log in logs)


@pytest.mark.parametrize('email', ['invalid', 'a@example.com\r\nBcc: stolen@example.com', 'a\n@example.com'])
def test_invalid_email_rejected(email):
    offer = compare()[0]
    assert client.post(f"/api/quote-offers/{offer['offer_id']}/email", json={'email': email},
        headers=headers(offer, **{'Idempotency-Key': str(uuid.uuid4())})).status_code == 422


def test_authorization_expiry_and_acceptance():
    offers = compare()
    first, other = offers[:2]
    for suffix, method in [('/pdf',client.get), ('/select',client.post), ('/email',client.post)]:
        extra = {'json': {'email':'client@example.com'}} if suffix == '/email' else {}
        path = f"/api/quote-offers/{first['offer_id']}{suffix}"
        assert method(path, **extra).status_code == 401
        assert method(path, headers=headers(other, **{'Idempotency-Key':str(uuid.uuid4())}), **extra).status_code == 403
        expired = create_quote_access_token(first['offer_id'], -1)
        assert method(path, headers={'Authorization':f'Bearer {expired}', 'Idempotency-Key':str(uuid.uuid4())}, **extra).status_code == 401
    selected = client.post(f"/api/quote-offers/{first['offer_id']}/select", json={'total_premium':1}, headers=headers(first))
    assert selected.status_code == 200
    assert selected.json()['status'] == 'SELECTED_PENDING_DETAILS'
    assert selected.json()['total_premium'] == first['total_premium']
    with SessionLocal() as db:
        row = db.get(QuoteSelection, uuid.UUID(first['offer_id']))
        assert row.snapshot_data['offer_selected'] is True
        assert row.status == QuoteSelectionStatus.SELECTED_PENDING_DETAILS
        row.expires_at = datetime.now(timezone.utc)-timedelta(seconds=1)
        db.commit()
    assert client.get(f"/api/quote-offers/{first['offer_id']}/pdf", headers=headers(first)).status_code == 410


def test_offered_quote_cannot_submit_customer_details():
    offer = compare()[0]
    result = client.patch(f"/api/quotes/selections/{offer['offer_id']}/customer", headers=headers(offer), json={
        'full_name': 'Test Customer', 'phone': '0712345678', 'email': 'test@example.com',
        'id_or_passport': '12345678', 'kra_pin': 'A123456789Z',
    })
    assert result.status_code == 400, result.text
    with SessionLocal() as db:
        assert db.get(QuoteSelection, uuid.UUID(offer['offer_id'])).status == QuoteSelectionStatus.OFFERED


def test_plate_retrieval_is_normalized_and_does_not_grant_customer_access():
    offer = compare()[0]
    result = client.post('/api/quote-offers/retrieve', json={'registration_no': 'kaa-123a'})
    assert result.status_code == 200, result.text
    found = next(row for row in result.json()['offers'] if row['selection_id'] == offer['offer_id'])
    auth = {'Authorization': f"Bearer {found['access_token']}"}
    path = f"/api/quote-offers/{offer['offer_id']}"
    detail = client.get(path, headers=auth)
    assert detail.status_code == 200
    from app.core.security import decode_quote_access_token
    assert decode_quote_access_token(detail.json()['access_token']).startswith('offer:')
    assert client.get(path+'/pdf', headers=auth).status_code == 200
    assert client.post(path+'/select', headers=auth).json()['status'] == 'SELECTED_PENDING_DETAILS'
    assert client.post(path+'/select', headers=auth).status_code == 409
    remaining = client.post('/api/quote-offers/retrieve', json={'registration_no': 'KAA 123A'}).json()['offers']
    assert offer['offer_id'] not in [row['selection_id'] for row in remaining]
    assert client.post('/api/quote-offers/retrieve', json={'registration_no': '../'}).status_code == 422


def test_concurrent_email_submission_and_safe_failure(monkeypatch):
    offer = compare()[0]
    path = f"/api/quote-offers/{offer['offer_id']}/email"
    smtp = Mock()
    monkeypatch.setattr(email_service, '_send_smtp', smtp)
    h = headers(offer, **{'Idempotency-Key':str(uuid.uuid4())})
    def send():
        return client.post(path, json={'email':'same@example.com'}, headers=h)
    with ThreadPoolExecutor(max_workers=2) as workers:
        results = list(workers.map(lambda _:send(), range(2)))
    assert all(r.status_code in (200,409) for r in results)
    assert smtp.call_count == 1
    smtp.side_effect = RuntimeError('secret SMTP password must not be logged')
    result = client.post(path, json={'email':'other@example.com'}, headers=headers(offer, **{'Idempotency-Key':str(uuid.uuid4())}))
    assert result.status_code == 503
    with SessionLocal() as db:
        logs = db.query(AuditLog).filter(AuditLog.entity_id == offer['offer_id']).all()
        assert 'secret SMTP' not in str([log.new_value for log in logs])
        assert any(log.new_value.get('status') == 'failed' for log in logs)
