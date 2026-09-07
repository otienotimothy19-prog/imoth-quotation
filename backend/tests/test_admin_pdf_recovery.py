"""Missing generated files can be rebuilt without accepting or repricing a quote."""
from types import SimpleNamespace
from unittest.mock import Mock
import uuid

import pytest
from fastapi import HTTPException
from app.api.routers import admin_quotations as router


@pytest.mark.parametrize('missing_record', [False, True])
def test_missing_pdf_rebuilt_from_saved_quote(monkeypatch, missing_record):
    quote = SimpleNamespace(id=uuid.uuid4(), pdf_document_id=None if missing_record else uuid.uuid4(),
        snapshot=object(), vehicle=SimpleNamespace(registration_no='KAA123A'),
        quotation_number='QT-2026-00007', status='GENERATED', total_premium=3355)
    db = Mock()
    db.get.return_value = SimpleNamespace(storage_path='quotations/missing.pdf')
    monkeypatch.setattr(router, '_get_full', lambda *_: quote)
    monkeypatch.setattr(router.storage_service, 'read_bytes', Mock(side_effect=FileNotFoundError))
    render = Mock(return_value=b'%PDF-rebuilt')
    monkeypatch.setattr(router.pdf_service, 'render_quotation_pdf', render)
    monkeypatch.setattr(router, '_company_settings', lambda _: {})
    monkeypatch.setattr(router, 'get_setting', lambda *_: [])
    monkeypatch.setattr(router.audit_service, 'record', Mock())
    response = router.download_pdf(quote.id, db, SimpleNamespace(id=uuid.uuid4(), email='admin@example.com'))
    assert response.body == b'%PDF-rebuilt'
    assert 'KAA123A' in response.headers['content-disposition']
    assert render.call_args.kwargs['quotation'] is quote
    assert quote.status == 'GENERATED'
    assert quote.total_premium == 3355


def test_no_snapshot_returns_clear_not_found(monkeypatch):
    quote = SimpleNamespace(pdf_document_id=None, snapshot=None)
    monkeypatch.setattr(router, '_get_full', lambda *_: quote)
    with pytest.raises(HTTPException) as error:
        router.download_pdf(uuid.uuid4(), Mock(), Mock())
    assert error.value.status_code == 404
