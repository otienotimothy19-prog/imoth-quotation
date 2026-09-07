"""The anonymous "Compare Quotes -> Accept This Quote" phase of the client
journey. `select_quote` locks in a comparison result (insurer/class/
premium/rate-version) into a QuoteSelection row that carries zero personal
information. `attach_customer` is the only place a real Client/Vehicle/
Quotation gets created -- once "About You" is known -- reusing the exact
same get_or_create_client/get_or_create_vehicle helpers `quote_service.py`
already uses for the (still-supported) admin-panel generate path, so both
paths always create identically-shaped Client/Vehicle rows.

The premium/eligibility computed here at selection time is carried forward
verbatim into the eventual Quotation -- attach_customer never recalculates
it, matching "do not recalculate or silently change the selected premium
during the acceptance stage."
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.enums import ActorType, DocumentType, QuotationSource, QuotationStatus, QuoteSelectionStatus
from app.models.insurer_rate import Insurer, MotorClass, RateVersion
from app.models.quotation import Quotation, QuotationItem, QuotationSnapshot
from app.models.quote_selection import QuoteSelection
from app.schemas.quotation import ClientIn, CustomerIn, QuoteOptionsIn, VehicleIn
from app.services import audit_service, document_service, numbering_service, pdf_service
from app.services.pricing_engine import compute_premium, is_eligible
from app.services.quote_service import _company_settings, _options_to_engine_dict, get_or_create_client, get_or_create_vehicle, get_quotation_full
from app.services.rate_config import motor_class_to_dict
from app.services.settings_service import get_setting
from app.services.vehicle_age import calculate_vehicle_age


class QuoteSelectionError(Exception):
    """Raised for business-rule violations in the selection/acceptance flow."""


def select_quote(
    db: Session,
    *,
    category: str,
    vehicle_in: VehicleIn,
    insurer_id: uuid.UUID,
    motor_class_id: uuid.UUID,
    sum_insured: float,
    options: QuoteOptionsIn,
    commercial_use: str | None = None,
    institution_type=None,
    institutional_vehicle_type=None,
    passenger_category=None,
) -> QuoteSelection:
    """Re-validates eligibility and recomputes the premium server-side --
    never trusts a premium/eligibility result the browser might send back
    from an earlier /compare call -- then persists the locked choice as a
    QuoteSelection. No Client/Vehicle/Quotation row is touched."""
    mc = db.execute(
        select(MotorClass)
        .options(joinedload(MotorClass.insurer), joinedload(MotorClass.rate_bands))
        .where(MotorClass.id == motor_class_id, MotorClass.insurer_id == insurer_id)
    ).unique().scalar_one_or_none()
    if mc is None or not mc.active or not mc.insurer.active:
        raise QuoteSelectionError("Selected insurer/class is not available")

    class_dict = motor_class_to_dict(mc)
    # Authoritative age calculation: derived from year_of_manufacture only,
    # exactly like generate_quotation() -- never trust a client-sent age.
    age = calculate_vehicle_age(vehicle_in.year_of_manufacture)
    institution_type_value = institution_type.value if institution_type else None
    institutional_vehicle_type_value = institutional_vehicle_type.value if institutional_vehicle_type else None
    passenger_category_value = passenger_category.value if passenger_category else None
    if not is_eligible(
        class_dict, sum_insured, age,
        institution_type=institution_type_value, vehicle_type=institutional_vehicle_type_value,
        passenger_category=passenger_category_value,
    ):
        raise QuoteSelectionError("This vehicle is not eligible for the selected insurer/class at this Sum Insured")
    if class_dict.get("tonnage_required") and not options.tonnage:
        raise QuoteSelectionError("This insurer's product requires a tonnage (carrying capacity) figure to be quoted")

    levy_rate = get_setting(db, "levy.rate")
    stamp_duty = get_setting(db, "levy.stamp_duty")
    engine_opts = _options_to_engine_dict(
        options, age,
        commercial_use=commercial_use, institution_type=institution_type,
        institutional_vehicle_type=institutional_vehicle_type, passenger_category=passenger_category,
    )
    result = compute_premium(class_dict, sum_insured, engine_opts, levy_rate, stamp_duty)

    latest_rate_version = (
        db.execute(
            select(RateVersion)
            .where(RateVersion.motor_class_id == mc.id)
            .order_by(RateVersion.version_no.desc())
        )
        .scalars()
        .first()
    )
    cover_type = "third_party_only" if class_dict.get("flat_only") else "comprehensive"
    now = datetime.now(timezone.utc)
    # Same snapshot shape generate_quotation() builds -- carried forward
    # verbatim into the real QuotationSnapshot at conversion time.
    snapshot_data = dict(class_dict)
    snapshot_data.update(
        {
            "insurer_code": mc.insurer.code,
            "insurer_name": mc.insurer.name,
            "insurer_disclaimer": mc.insurer.disclaimer,
            "insurer_note": mc.insurer.note,
            "options_used": engine_opts,
            "calculation": result.as_dict(),
            "levy_rate": levy_rate,
            "stamp_duty": stamp_duty,
            "year_of_manufacture": vehicle_in.year_of_manufacture,
            "calculated_age_years": age,
        }
    )

    validity_minutes = get_setting(db, "quote_selection.validity_minutes", 60)
    selection = QuoteSelection(
        registration_no=vehicle_in.registration_no.strip().upper(),
        year_of_manufacture=vehicle_in.year_of_manufacture,
        make=vehicle_in.make,
        model=vehicle_in.model,
        cover_type=cover_type,
        category=category,
        commercial_use=commercial_use,
        institution_type=institution_type_value,
        institutional_vehicle_type=institutional_vehicle_type_value,
        passenger_category=passenger_category_value,
        sum_insured=sum_insured,
        options=engine_opts,
        insurer_id=mc.insurer_id,
        motor_class_id=mc.id,
        vehicle_class_label=mc.label,
        rate_version_id=latest_rate_version.id if latest_rate_version else None,
        basic_premium=result.lines[0].amount if result.lines else 0,
        subtotal=result.subtotal,
        levies=result.levies,
        stamp_duty=result.stamp_duty,
        total_premium=result.total,
        items=[{"label": line.label, "amount": line.amount} for line in result.lines],
        snapshot_data=snapshot_data,
        status=QuoteSelectionStatus.SELECTED_PENDING_DETAILS,
        expires_at=now + timedelta(minutes=validity_minutes),
    )
    db.add(selection)
    db.flush()

    # No personal information exists yet at this point -- label the event
    # by vehicle registration only, matching "record all acceptance and
    # document events in the audit trail" without logging anything personal.
    audit_service.record(
        db,
        actor_type=ActorType.CLIENT,
        actor_label=selection.registration_no,
        action="quote_selected",
        entity_type="quote_selection",
        entity_id=str(selection.id),
        new_value={
            "insurer_name": mc.insurer.name,
            "vehicle_class_label": mc.label,
            "total_premium": result.total,
        },
    )
    db.commit()
    db.refresh(selection)
    return selection


def get_selection(db: Session, selection_id: uuid.UUID) -> QuoteSelection | None:
    return db.get(QuoteSelection, selection_id)


def _expire_if_stale(selection: QuoteSelection) -> None:
    if (
        selection.status == QuoteSelectionStatus.SELECTED_PENDING_DETAILS
        and datetime.now(timezone.utc) > selection.expires_at
    ):
        selection.status = QuoteSelectionStatus.EXPIRED


def attach_customer(
    db: Session,
    *,
    selection: QuoteSelection,
    customer_in: CustomerIn,
    actor_label: str,
) -> Quotation:
    """The only place a real Client/Vehicle/Quotation row is created for
    this flow -- reuses quote_service's own get_or_create_client/
    get_or_create_vehicle so both paths produce identically-shaped rows."""
    _expire_if_stale(selection)
    if selection.status == QuoteSelectionStatus.EXPIRED:
        db.commit()
        raise QuoteSelectionError("This quotation selection has expired. Please compare quotes again.")
    if selection.status != QuoteSelectionStatus.SELECTED_PENDING_DETAILS:
        raise QuoteSelectionError(f"This selection cannot accept customer details from status {selection.status.value}")

    insurer = db.get(Insurer, selection.insurer_id)
    if insurer is None or not insurer.active:
        raise QuoteSelectionError("Selected insurer is no longer available")

    client_in = ClientIn(
        full_name=customer_in.full_name,
        id_or_passport=customer_in.id_or_passport,
        phone=customer_in.phone,
        email=customer_in.email,
    )
    vehicle_in = VehicleIn(
        registration_no=selection.registration_no,
        year_of_manufacture=selection.year_of_manufacture,
        make=selection.make,
        model=selection.model,
    )
    client = get_or_create_client(db, client_in)
    client.kra_pin = customer_in.kra_pin or client.kra_pin
    vehicle = get_or_create_vehicle(db, client, vehicle_in)

    quotation_number = numbering_service.generate_quotation_number(db)
    validity_days = get_setting(db, "quotation.validity_days", 30)
    now = datetime.now(timezone.utc)

    quotation = Quotation(
        quotation_number=quotation_number,
        version=1,
        client_id=client.id,
        vehicle_id=vehicle.id,
        insurer_id=selection.insurer_id,
        motor_class_id=selection.motor_class_id,
        cover_type=selection.cover_type,
        vehicle_class_label=selection.vehicle_class_label,
        sum_insured=selection.sum_insured,
        options=selection.options,
        basic_premium=selection.basic_premium,
        subtotal=selection.subtotal,
        levies=selection.levies,
        stamp_duty=selection.stamp_duty,
        total_premium=selection.total_premium,
        amount_paid=0,
        balance=selection.total_premium,
        status=QuotationStatus.DOCUMENTS_PENDING,
        source=QuotationSource.CLIENT_PORTAL,
        generated_at=now,
        expires_at=now + timedelta(days=validity_days),
        locked=False,
    )
    db.add(quotation)
    db.flush()

    for i, item in enumerate(selection.items):
        db.add(QuotationItem(quotation_id=quotation.id, label=item["label"], amount=item["amount"], sort_order=i))

    db.add(
        QuotationSnapshot(
            quotation_id=quotation.id,
            rate_version_id=selection.rate_version_id,
            data=dict(selection.snapshot_data, quotation_number=quotation_number, generated_at=now.isoformat()),
        )
    )
    db.flush()

    full = get_quotation_full(db, quotation.id)
    pdf_bytes = pdf_service.render_quotation_pdf(
        quotation=full,
        company=_company_settings(db),
        footer_text=get_setting(db, "pdf.footer_text"),
        conditions=get_setting(db, "quotation.conditions"),
    )
    document = document_service.store_document(
        db,
        doc_type=DocumentType.QUOTATION,
        reference_number=quotation_number,
        content=pdf_bytes,
        quotation_id=quotation.id,
        created_by=None,
    )
    quotation.pdf_document_id = document.id

    selection.status = QuoteSelectionStatus.CONVERTED
    selection.converted_quotation_id = quotation.id

    # Never log the ID/passport or KRA PIN values themselves -- only that
    # they were supplied.
    audit_service.record(
        db,
        actor_type=ActorType.CLIENT,
        actor_label=actor_label,
        action="customer_details_submitted",
        entity_type="quotation",
        entity_id=str(quotation.id),
        new_value={
            "quotation_number": quotation_number,
            "has_id_or_passport": bool(customer_in.id_or_passport),
            "has_kra_pin": bool(customer_in.kra_pin),
        },
    )
    db.commit()
    return get_quotation_full(db, quotation.id)
