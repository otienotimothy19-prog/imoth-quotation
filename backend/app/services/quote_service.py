import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.client_vehicle import Client, Vehicle
from app.models.enums import ActorType, DocumentType, QuotationSource, QuotationStatus, RiskNoteStatus
from app.models.insurer_rate import Insurer, MotorClass, RateVersion
from app.models.quotation import Quotation, QuotationItem, QuotationSnapshot
from app.models.risk_note import RiskNote, RiskNoteStatusHistory
from app.schemas.quotation import ClientIn, QuoteOptionsIn, VehicleIn
from app.services import audit_service, document_service, numbering_service, pdf_service
from app.services.pricing_engine import compute_premium, is_eligible
from app.services.rate_config import motor_class_to_dict
from app.services.settings_service import get_setting


class QuoteServiceError(Exception):
    """Raised for business-rule violations (invalid state transitions, etc.)."""


def _options_to_engine_dict(options: QuoteOptionsIn, age: float | None) -> dict:
    return {
        "ep": options.ep,
        "pvt": options.pvt,
        "pv_terror": options.pv_terror,
        "lr_band": options.lr_band,
        "pll_seats": options.pll_seats,
        "pll_option_key": options.pll_option_key,
        "age": age,
    }


def _company_settings(db: Session) -> dict:
    return {
        "name": get_setting(db, "company.name"),
        "address": get_setting(db, "company.address"),
        "phone": get_setting(db, "company.phone"),
        "email": get_setting(db, "company.email"),
        "paybill": get_setting(db, "company.paybill"),
    }


def list_eligible_options(db: Session, *, category: str, sum_insured: float, options: QuoteOptionsIn, age: float | None) -> list[dict]:
    levy_rate = get_setting(db, "levy.rate")
    stamp_duty = get_setting(db, "levy.stamp_duty")

    motor_classes = (
        db.execute(
            select(MotorClass)
            .join(Insurer)
            .options(joinedload(MotorClass.insurer), joinedload(MotorClass.rate_bands))
            .where(MotorClass.category == category, MotorClass.active == True, Insurer.active == True)  # noqa: E712
        )
        .unique()
        .scalars()
        .all()
    )

    results = []
    for mc in motor_classes:
        class_dict = motor_class_to_dict(mc)
        if not is_eligible(class_dict, sum_insured, age):
            continue
        engine_opts = _options_to_engine_dict(options, age)
        result = compute_premium(class_dict, sum_insured, engine_opts, levy_rate, stamp_duty)
        age_warning = bool(mc.max_age and age is not None and age > mc.max_age)
        results.append(
            {
                "insurer_id": mc.insurer.id,
                "insurer_code": mc.insurer.code,
                "insurer_name": mc.insurer.name,
                "motor_class_id": mc.id,
                "motor_class_code": mc.code,
                "motor_class_label": mc.label,
                "cover_type": "third_party_only" if class_dict.get("flat_only") else "comprehensive",
                "max_age": mc.max_age,
                "age_warning": age_warning,
                "basic_premium": result.lines[0].amount if result.lines else 0,
                "subtotal": result.subtotal,
                "levies": result.levies,
                "stamp_duty": result.stamp_duty,
                "total_premium": result.total,
            }
        )

    results.sort(key=lambda r: r["total_premium"])
    return results


def get_or_create_client(db: Session, client_in: ClientIn) -> Client:
    client = (
        db.execute(select(Client).where(Client.phone == client_in.phone))
        .scalars()
        .first()
    )
    if client is None:
        client = Client(
            full_name=client_in.full_name,
            id_or_passport=client_in.id_or_passport,
            phone=client_in.phone,
            email=client_in.email,
        )
        db.add(client)
        db.flush()
    else:
        client.full_name = client_in.full_name
        client.id_or_passport = client_in.id_or_passport or client.id_or_passport
        client.email = client_in.email or client.email
    return client


def get_or_create_vehicle(db: Session, client: Client, vehicle_in: VehicleIn) -> Vehicle:
    reg = vehicle_in.registration_no.strip().upper()
    vehicle = (
        db.execute(select(Vehicle).where(Vehicle.client_id == client.id, Vehicle.registration_no == reg))
        .scalars()
        .first()
    )
    if vehicle is None:
        vehicle = Vehicle(
            client_id=client.id,
            registration_no=reg,
            year_of_manufacture=vehicle_in.year_of_manufacture,
            age_years=vehicle_in.age_years,
            make=vehicle_in.make,
            model=vehicle_in.model,
        )
        db.add(vehicle)
        db.flush()
    else:
        vehicle.year_of_manufacture = vehicle_in.year_of_manufacture or vehicle.year_of_manufacture
        vehicle.age_years = vehicle_in.age_years if vehicle_in.age_years is not None else vehicle.age_years
        vehicle.make = vehicle_in.make or vehicle.make
        vehicle.model = vehicle_in.model or vehicle.model
    return vehicle


def get_quotation_full(db: Session, quotation_id: uuid.UUID) -> Quotation | None:
    return db.execute(
        select(Quotation)
        .options(
            joinedload(Quotation.client),
            joinedload(Quotation.vehicle),
            joinedload(Quotation.insurer),
            joinedload(Quotation.motor_class),
            joinedload(Quotation.items),
            joinedload(Quotation.snapshot),
            joinedload(Quotation.risk_note),
        )
        .where(Quotation.id == quotation_id)
    ).unique().scalar_one_or_none()


def generate_quotation(
    db: Session,
    *,
    client_in: ClientIn,
    vehicle_in: VehicleIn,
    insurer_id: uuid.UUID,
    motor_class_id: uuid.UUID,
    sum_insured: float,
    options: QuoteOptionsIn,
    amount_paid: float,
    source: QuotationSource,
    created_by: uuid.UUID | None,
    actor_label: str,
) -> Quotation:
    mc = db.execute(
        select(MotorClass)
        .options(joinedload(MotorClass.insurer), joinedload(MotorClass.rate_bands))
        .where(MotorClass.id == motor_class_id, MotorClass.insurer_id == insurer_id)
    ).unique().scalar_one_or_none()
    if mc is None or not mc.active or not mc.insurer.active:
        raise QuoteServiceError("Selected insurer/class is not available")

    class_dict = motor_class_to_dict(mc)
    age = vehicle_in.age_years
    if not is_eligible(class_dict, sum_insured, age):
        raise QuoteServiceError("This vehicle is not eligible for the selected insurer/class at this Sum Insured")

    levy_rate = get_setting(db, "levy.rate")
    stamp_duty = get_setting(db, "levy.stamp_duty")
    engine_opts = _options_to_engine_dict(options, age)
    result = compute_premium(class_dict, sum_insured, engine_opts, levy_rate, stamp_duty)

    client = get_or_create_client(db, client_in)
    vehicle = get_or_create_vehicle(db, client, vehicle_in)

    quotation_number = numbering_service.generate_quotation_number(db)
    validity_days = get_setting(db, "quotation.validity_days", 30)
    now = datetime.now(timezone.utc)
    cover_type = "third_party_only" if class_dict.get("flat_only") else "comprehensive"

    quotation = Quotation(
        quotation_number=quotation_number,
        version=1,
        client_id=client.id,
        vehicle_id=vehicle.id,
        insurer_id=mc.insurer_id,
        motor_class_id=mc.id,
        cover_type=cover_type,
        vehicle_class_label=mc.label,
        sum_insured=sum_insured,
        options=engine_opts,
        basic_premium=result.lines[0].amount if result.lines else 0,
        subtotal=result.subtotal,
        levies=result.levies,
        stamp_duty=result.stamp_duty,
        total_premium=result.total,
        amount_paid=amount_paid,
        balance=result.total - amount_paid,
        status=QuotationStatus.GENERATED,
        source=source,
        generated_at=now,
        expires_at=now + timedelta(days=validity_days),
        locked=False,
    )
    db.add(quotation)
    db.flush()

    for i, line in enumerate(result.lines):
        db.add(QuotationItem(quotation_id=quotation.id, label=line.label, amount=line.amount, sort_order=i))

    latest_rate_version = (
        db.execute(
            select(RateVersion)
            .where(RateVersion.motor_class_id == mc.id)
            .order_by(RateVersion.version_no.desc())
        )
        .scalars()
        .first()
    )
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
            "quotation_number": quotation_number,
            "generated_at": now.isoformat(),
        }
    )
    db.add(
        QuotationSnapshot(
            quotation_id=quotation.id,
            rate_version_id=latest_rate_version.id if latest_rate_version else None,
            data=snapshot_data,
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
        created_by=created_by,
    )
    quotation.pdf_document_id = document.id

    audit_service.record(
        db,
        actor_type=ActorType.ADMIN if source == QuotationSource.ADMIN_PANEL else ActorType.CLIENT,
        actor_label=actor_label,
        actor_id=created_by,
        action="quotation_generated",
        entity_type="quotation",
        entity_id=str(quotation.id),
        new_value={"quotation_number": quotation_number, "total_premium": result.total},
    )
    db.commit()
    return get_quotation_full(db, quotation.id)


def accept_quotation(
    db: Session,
    *,
    quotation_id: uuid.UUID,
    cover_start_date: datetime | None,
    actor_label: str,
    actor_id: uuid.UUID | None,
) -> RiskNote:
    quotation = db.execute(
        select(Quotation).where(Quotation.id == quotation_id).with_for_update()
    ).scalar_one_or_none()
    if quotation is None:
        raise QuoteServiceError("Quotation not found")

    existing_rn = db.execute(select(RiskNote).where(RiskNote.quotation_id == quotation.id)).scalar_one_or_none()
    if existing_rn is not None:
        # Idempotent: accept has already run for this quotation.
        return existing_rn

    if quotation.status not in (QuotationStatus.GENERATED, QuotationStatus.SENT):
        raise QuoteServiceError(
            f"Quotation cannot be accepted from status {quotation.status.value}. "
            "Only a GENERATED or SENT quotation may be accepted."
        )

    now = datetime.now(timezone.utc)
    if quotation.expires_at and now > quotation.expires_at:
        quotation.status = QuotationStatus.EXPIRED
        db.commit()
        raise QuoteServiceError("This quotation has expired and can no longer be accepted")

    quotation.accepted_at = now
    quotation.status = QuotationStatus.ACCEPTED
    quotation.locked = True

    cover_start = cover_start_date or now
    cover_end = cover_start + timedelta(days=365)

    risk_note_number = numbering_service.generate_risk_note_number(db)
    risk_note = RiskNote(
        risk_note_number=risk_note_number,
        quotation_id=quotation.id,
        client_id=quotation.client_id,
        vehicle_id=quotation.vehicle_id,
        insurer_id=quotation.insurer_id,
        cover_type=quotation.cover_type,
        sum_insured=quotation.sum_insured,
        premium=quotation.total_premium,
        cover_start_date=cover_start,
        cover_end_date=cover_end,
        quotation_accepted_at=quotation.accepted_at,
        generated_at=now,
        generated_by=actor_id,
        status=RiskNoteStatus.ACTIVE,
    )
    db.add(risk_note)
    db.flush()

    full_quotation = get_quotation_full(db, quotation.id)
    pdf_bytes = pdf_service.render_risk_note_pdf(
        risk_note=risk_note,
        quotation=full_quotation,
        company=_company_settings(db),
        conditions=get_setting(db, "risk_note.conditions"),
    )
    document = document_service.store_document(
        db,
        doc_type=DocumentType.RISK_NOTE,
        reference_number=risk_note_number,
        content=pdf_bytes,
        risk_note_id=risk_note.id,
        quotation_id=quotation.id,
        created_by=actor_id,
    )
    risk_note.pdf_document_id = document.id

    audit_service.record(
        db,
        actor_type=ActorType.ADMIN if actor_id else ActorType.CLIENT,
        actor_label=actor_label,
        actor_id=actor_id,
        action="quotation_accepted",
        entity_type="quotation",
        entity_id=str(quotation.id),
        new_value={"accepted_at": now.isoformat()},
    )
    audit_service.record(
        db,
        actor_type=ActorType.ADMIN if actor_id else ActorType.CLIENT,
        actor_label=actor_label,
        actor_id=actor_id,
        action="risk_note_generated",
        entity_type="risk_note",
        entity_id=str(risk_note.id),
        new_value={"risk_note_number": risk_note_number},
    )
    db.commit()
    return risk_note


def reject_quotation(
    db: Session,
    *,
    quotation_id: uuid.UUID,
    reason: str | None,
    actor_label: str,
    actor_id: uuid.UUID | None,
) -> Quotation:
    quotation = db.execute(
        select(Quotation).where(Quotation.id == quotation_id).with_for_update()
    ).scalar_one_or_none()
    if quotation is None:
        raise QuoteServiceError("Quotation not found")

    if quotation.status == QuotationStatus.REJECTED:
        return quotation
    if quotation.locked or quotation.status == QuotationStatus.ACCEPTED:
        raise QuoteServiceError("An accepted quotation cannot be rejected")
    if quotation.status not in (QuotationStatus.GENERATED, QuotationStatus.SENT):
        raise QuoteServiceError(f"Quotation cannot be rejected from status {quotation.status.value}")

    quotation.status = QuotationStatus.REJECTED
    quotation.rejected_at = datetime.now(timezone.utc)

    audit_service.record(
        db,
        actor_type=ActorType.ADMIN if actor_id else ActorType.CLIENT,
        actor_label=actor_label,
        actor_id=actor_id,
        action="quotation_rejected",
        entity_type="quotation",
        entity_id=str(quotation.id),
        new_value={"reason": reason},
    )
    db.commit()
    return quotation


def void_risk_note(
    db: Session,
    *,
    risk_note_id: uuid.UUID,
    new_status: RiskNoteStatus,
    reason: str,
    actor_label: str,
    actor_id: uuid.UUID,
) -> RiskNote:
    risk_note = db.execute(select(RiskNote).where(RiskNote.id == risk_note_id).with_for_update()).scalar_one_or_none()
    if risk_note is None:
        raise QuoteServiceError("Risk note not found")
    if not reason or not reason.strip():
        raise QuoteServiceError("A reason is required to void or cancel a risk note")
    if new_status not in (RiskNoteStatus.VOID, RiskNoteStatus.CANCELLED):
        raise QuoteServiceError("new_status must be VOID or CANCELLED")

    previous_status = risk_note.status
    now = datetime.now(timezone.utc)
    db.add(
        RiskNoteStatusHistory(
            risk_note_id=risk_note.id,
            previous_status=previous_status.value,
            new_status=new_status.value,
            reason=reason,
            changed_by=actor_id,
            changed_at=now,
        )
    )
    risk_note.status = new_status

    audit_service.record(
        db,
        actor_type=ActorType.ADMIN,
        actor_label=actor_label,
        actor_id=actor_id,
        action="risk_note_voided",
        entity_type="risk_note",
        entity_id=str(risk_note.id),
        previous_value={"status": previous_status.value},
        new_value={"status": new_status.value, "reason": reason},
    )
    db.commit()
    return risk_note
