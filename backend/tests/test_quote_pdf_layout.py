"""Pure helpers behind the quote sheet layout."""
from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.pdf_service import _condition_lines, _cover_lines, _split_address, quotation_pdf_filename


def test_conditions_listed_once_with_actual_validity():
    footer = ("Premiums quoted are inclusive of levies and stamp duty. Subject to the terms and conditions of the "
              "insurer's standard policy wording and satisfactory underwriting/loss-ratio review.")
    conditions = [
        "Valid for the validity period stated from the date of this quotation.",
        "Subject to the terms and conditions of the insurer's standard policy wording and satisfactory underwriting/loss-ratio review.",
        "Final premium confirmed on receipt of full KYC.",
    ]
    lines = _condition_lines(footer, conditions, 30)
    assert lines == [
        "<b>** Premiums quoted are inclusive of levies and stamp duty.</b>",
        "** Valid for 30 days from the date of this quotation.",
        "** Subject to the terms and conditions of the insurer's standard policy wording and satisfactory underwriting/loss-ratio review.",
        "** Final premium confirmed on receipt of full KYC.",
    ]


def test_cover_and_rate_lines_from_snapshot():
    snapshot = {"calculation": {"band_used": {"rate": 0.045, "min_premium": 40000, "ep_included": True,
                                              "ep_not_offered": False, "pvt_included": True, "pvt_not_offered": False}},
                "options_used": {}}
    basis, rates = _cover_lines(snapshot, 1300000)
    assert "Excess Protector (Own Damage):</b> Included in the rate" in basis
    assert "Basic Rate: <b>4.50%</b> of SI (Min Kshs 40,000)" in rates
    tpo_basis, tpo_rates = _cover_lines({"flat_only": {"premium": 7500}}, 0)
    assert "Third Party Only" in tpo_basis and "Kshs 7,500" in tpo_rates


def test_address_split_and_filename():
    assert _split_address("P.O. Box 23280 – 00100, Nairobi, Wabera Street, Salama House, Suite 305") == (
        "P.O. Box 23280 – 00100, Nairobi", "Wabera Street, Salama House, Suite 305, Nairobi")
    q = SimpleNamespace(insurer=SimpleNamespace(name="CIC General Insurance Ltd"),
                        vehicle=SimpleNamespace(registration_no="KDW534A"),
                        generated_at=datetime(2026, 11, 25, tzinfo=timezone.utc), created_at=None)
    assert quotation_pdf_filename(q) == "Imoth_Quote_CIC_General_Insurance_Ltd_KDW534A_25_November_2026.pdf"
