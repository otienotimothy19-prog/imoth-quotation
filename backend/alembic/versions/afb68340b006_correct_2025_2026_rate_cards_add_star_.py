"""correct 2025/2026 rate cards, add Star Discover, ep/pvt mandatory

Corrects motor rates, minimum premiums, minimum vehicle values and maximum
vehicle ages against the authoritative Monarch (revised rates 2025),
Definite Assurance (binder terms 2026), Britam (approved binder terms 2026)
and the supplied 2025 comprehensive rating card (Pioneer). Adds Star
Discover as a new insurer and the missing Definite motor classes it was
never seeded with. Adds ep_mandatory/pvt_mandatory support so an insurer's
mandatory Excess Protector / PVT charges (e.g. Britam private car) are
always applied rather than depending on customer opt-in.

This migration is idempotent and safe to re-run:
 - New insurers/motor classes are only created if they don't already exist
   (matched by code), exactly like the initial seed.
 - Existing motor classes are only deactivated if still active.
 - Rate-band *corrections* to existing classes are skipped -- and logged --
   for any motor class an administrator has already edited via the Admin >
   Rates screen since the initial seed (detected via rate_versions.
   version_no > 1), so this migration never overwrites a deliberate later
   admin change.
 - A new RateVersion row with a clear change_reason is recorded for every
   motor class actually changed.
 - No Quotation, QuotationItem or QuotationSnapshot row is read or written:
   previously issued quotations keep their own frozen snapshot and are
   never recalculated by this migration.

Revision ID: afb68340b006
Revises: c2eaab00a7ed
Create Date: 2026-09-02 00:00:00.000000

"""
import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import MetaData, Table, func, insert, select, update

# revision identifiers, used by Alembic.
revision: str = 'afb68340b006'
down_revision: Union[str, None] = 'c2eaab00a7ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _get_insurer_id(conn, insurers_t, code):
    row = conn.execute(select(insurers_t.c.id).where(insurers_t.c.code == code)).first()
    return row[0] if row else None


def _create_insurer(conn, insurers_t, code, data, now):
    new_id = uuid.uuid4()
    conn.execute(
        insert(insurers_t).values(
            id=new_id, code=code, name=data["name"], logo_path=None,
            disclaimer=data.get("disclaimer"), note=data.get("note"), active=True,
            created_at=now, updated_at=now,
        )
    )
    return new_id


def _get_motor_class(conn, motor_classes_t, insurer_id, code):
    return conn.execute(
        select(motor_classes_t.c.id, motor_classes_t.c.active).where(
            motor_classes_t.c.insurer_id == insurer_id, motor_classes_t.c.code == code
        )
    ).first()


def _create_motor_class(conn, motor_classes_t, insurer_id, code, class_data, now):
    new_id = uuid.uuid4()
    conn.execute(
        insert(motor_classes_t).values(
            id=new_id, insurer_id=insurer_id, code=code, label=class_data["label"], category=class_data["category"],
            max_age=class_data.get("max_age"), min_si=class_data.get("min_si", 0), max_si=class_data.get("max_si"),
            has_lr_toggle=class_data.get("has_lr_toggle", False), pll_per_seat=class_data.get("pll_per_seat"),
            pll_options=class_data.get("pll_options"), flat_only=class_data.get("flat_only"),
            excess=class_data.get("excess", []), benefits=class_data.get("benefits", []), limits=class_data.get("limits", []),
            active=True, created_at=now, updated_at=now,
        )
    )
    return new_id


def _latest_version_no(conn, rate_versions_t, motor_class_id):
    row = conn.execute(
        select(func.coalesce(func.max(rate_versions_t.c.version_no), 0)).where(
            rate_versions_t.c.motor_class_id == motor_class_id
        )
    ).first()
    return row[0] if row else 0


def _was_customized_since_seed(conn, rate_versions_t, motor_class_id):
    return _latest_version_no(conn, rate_versions_t, motor_class_id) > 1


def _deactivate_bands(conn, rate_bands_t, motor_class_id, now):
    conn.execute(
        update(rate_bands_t)
        .where(rate_bands_t.c.motor_class_id == motor_class_id, rate_bands_t.c.active == True)  # noqa: E712
        .values(active=False, updated_at=now)
    )


def _insert_bands(conn, rate_bands_t, motor_class_id, bands, variant, now):
    for i, b in enumerate(bands):
        conn.execute(
            insert(rate_bands_t).values(
                id=uuid.uuid4(), motor_class_id=motor_class_id, variant=variant, sort_order=i,
                min_si=b["min_si"], max_si=b["max_si"], rate=b["rate"], min_premium=b["min_premium"],
                ep_included=b["ep_included"], ep_not_offered=b["ep_not_offered"], ep_rate=b["ep_rate"], ep_min=b["ep_min"],
                ep_mandatory=b.get("ep_mandatory", False),
                pvt_included=b["pvt_included"], pvt_not_offered=b["pvt_not_offered"], pvt_rate=b["pvt_rate"], pvt_min=b["pvt_min"],
                pvt_mandatory=b.get("pvt_mandatory", False),
                active=True, created_at=now, updated_at=now,
            )
        )


def _rate_band_row_to_dict(row):
    m = row._mapping
    return {
        "min_si": float(m["min_si"]), "max_si": float(m["max_si"]) if m["max_si"] is not None else None,
        "rate": float(m["rate"]), "min_premium": float(m["min_premium"]),
        "ep_included": m["ep_included"], "ep_not_offered": m["ep_not_offered"],
        "ep_rate": float(m["ep_rate"]), "ep_min": float(m["ep_min"]), "ep_mandatory": m["ep_mandatory"],
        "pvt_included": m["pvt_included"], "pvt_not_offered": m["pvt_not_offered"],
        "pvt_rate": float(m["pvt_rate"]), "pvt_min": float(m["pvt_min"]), "pvt_mandatory": m["pvt_mandatory"],
    }


def _snapshot_and_version(
    conn, motor_classes_t, rate_bands_t, rate_versions_t, motor_class_id,
    insurer_code, insurer_name, insurer_disclaimer, insurer_note, reason, now,
):
    mc = conn.execute(select(motor_classes_t).where(motor_classes_t.c.id == motor_class_id)).first()._mapping
    bands = conn.execute(
        select(rate_bands_t)
        .where(rate_bands_t.c.motor_class_id == motor_class_id, rate_bands_t.c.active == True)  # noqa: E712
        .order_by(rate_bands_t.c.variant, rate_bands_t.c.sort_order)
    ).fetchall()
    standard = [_rate_band_row_to_dict(b) for b in bands if b._mapping["variant"] == "standard"]
    alt = [_rate_band_row_to_dict(b) for b in bands if b._mapping["variant"] == "alt"]
    snapshot = {
        "id": str(motor_class_id), "code": mc["code"], "label": mc["label"], "category": mc["category"],
        "max_age": mc["max_age"], "min_si": float(mc["min_si"]), "max_si": float(mc["max_si"]) if mc["max_si"] is not None else None,
        "has_lr_toggle": mc["has_lr_toggle"], "pll_per_seat": float(mc["pll_per_seat"]) if mc["pll_per_seat"] is not None else None,
        "pll_options": mc["pll_options"], "flat_only": mc["flat_only"],
        "excess": mc["excess"] or [], "benefits": mc["benefits"] or [], "limits": mc["limits"] or [],
        "bands": standard, "bands_alt": alt if alt else None,
        "insurer_code": insurer_code, "insurer_name": insurer_name,
        "insurer_disclaimer": insurer_disclaimer, "insurer_note": insurer_note,
    }
    vno = _latest_version_no(conn, rate_versions_t, motor_class_id) + 1
    conn.execute(
        insert(rate_versions_t).values(
            id=uuid.uuid4(), motor_class_id=motor_class_id, version_no=vno, data=snapshot,
            change_reason=reason, created_by=None, created_at=now, updated_at=now,
        )
    )


def upgrade() -> None:
    # Late import: insurers_data.py is a plain data module (no ORM/model
    # imports of its own), used here as the single source of truth for the
    # corrected figures so this migration and app/seed/seed_data.py can
    # never drift apart.
    from app.seed.insurers_data import INSURERS

    op.add_column('rate_bands', sa.Column('ep_mandatory', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('rate_bands', sa.Column('pvt_mandatory', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column('rate_bands', 'ep_mandatory', server_default=None)
    op.alter_column('rate_bands', 'pvt_mandatory', server_default=None)

    conn = op.get_bind()
    meta = MetaData()
    insurers_t = Table("insurers", meta, autoload_with=conn)
    motor_classes_t = Table("motor_classes", meta, autoload_with=conn)
    rate_bands_t = Table("rate_bands", meta, autoload_with=conn)
    rate_versions_t = Table("rate_versions", meta, autoload_with=conn)

    now = datetime.now(timezone.utc)

    def snapshot_and_version(mc_id, insurer_code, reason):
        ins = INSURERS[insurer_code]
        _snapshot_and_version(
            conn, motor_classes_t, rate_bands_t, rate_versions_t, mc_id,
            insurer_code, ins["name"], ins.get("disclaimer"), ins.get("note"), reason, now,
        )

    # --- 1. New insurer: Star Discover ---------------------------------
    star_id = _get_insurer_id(conn, insurers_t, "star_discover")
    if star_id is None:
        star_id = _create_insurer(conn, insurers_t, "star_discover", INSURERS["star_discover"], now)
        print("  + insurer star_discover")
    for class_code, class_data in INSURERS["star_discover"]["classes"].items():
        if _get_motor_class(conn, motor_classes_t, star_id, class_code) is not None:
            continue
        mc_id = _create_motor_class(conn, motor_classes_t, star_id, class_code, class_data, now)
        _insert_bands(conn, rate_bands_t, mc_id, class_data.get("bands", []), "standard", now)
        snapshot_and_version(
            mc_id, "star_discover",
            "Initial add: Star Discover binder terms 2026 (new insurer added by rate-card correction migration).",
        )
        print(f"    + class star_discover/{class_code}")

    # --- 2. Motor classes missing from the original Definite seed ------
    definite_id = _get_insurer_id(conn, insurers_t, "definite")
    if definite_id is not None:
        for class_code in (
            "psv_chauffeur_taxi", "tuktuk_commercial", "tuktuk_psv", "private_hire_tours_tsv",
            "motorcycle_private", "motorcycle_psv", "psv_matatu", "psv_bus",
        ):
            if _get_motor_class(conn, motor_classes_t, definite_id, class_code) is not None:
                continue
            class_data = INSURERS["definite"]["classes"][class_code]
            mc_id = _create_motor_class(conn, motor_classes_t, definite_id, class_code, class_data, now)
            _insert_bands(conn, rate_bands_t, mc_id, class_data.get("bands", []), "standard", now)
            snapshot_and_version(
                mc_id, "definite",
                "Initial add: motor class missing from the original seed, added from the Definite binder terms 2026.",
            )
            print(f"    + class definite/{class_code}")

        # commercial_institutional: add the documented PLL rate (field-only
        # correction; bands are already correct so no band replacement).
        row = _get_motor_class(conn, motor_classes_t, definite_id, "commercial_institutional")
        if row is not None:
            mc_id, _active = row
            current_pll = conn.execute(
                select(motor_classes_t.c.pll_per_seat).where(motor_classes_t.c.id == mc_id)
            ).first()
            if current_pll is not None and current_pll[0] is None:
                conn.execute(
                    update(motor_classes_t).where(motor_classes_t.c.id == mc_id).values(pll_per_seat=250, updated_at=now)
                )
                snapshot_and_version(
                    mc_id, "definite",
                    "Added documented Passenger Legal Liability (Kshs 250/passenger), missing from the original seed.",
                )
                print("    ~ class definite/commercial_institutional (added PLL)")

    # --- 3. Rate-band corrections for existing classes ------------------
    # Guarded: skipped (and logged) for any class an admin has already
    # edited via Admin > Rates since the initial seed, so this migration
    # never overwrites a deliberate later change.
    corrections = [
        ("monarch", "private",
         "Corrected minimum premium from Kshs 25,000 to the documented Kshs 20,000 (2025 Monarch revised rates)."),
        ("monarch", "private_400_499",
         "Corrected to a single unbounded 400,000-and-above product (was incorrectly split into two duplicate "
         "classes, one with unsourced terms); Excess Protector corrected from 'included' to 'not offered' per "
         "the Monarch rate card."),
        ("britam", "private",
         "Corrected Excess Protector rate from 0.25% to the documented 0.5%, and made EP/PVT mandatory "
         "(auto-charged rather than customer opt-in) per the Britam binder terms 2026."),
        ("britam", "commercial_general_cartage",
         "Corrected rate from 4.5%/min Kshs 100,000 to the documented 5%/min Kshs 75,000, and made EP "
         "(0.25% min 5,000) and PVT (0.25% min 3,000) mandatory per the Britam binder terms 2026."),
        ("britam", "commercial_own_goods",
         "Made EP (0.25% min 5,000) and PVT (0.25% min 3,000) mandatory per the Britam binder terms 2026 "
         "(rate and minimum premium were already correct)."),
        ("pioneer", "school_bus",
         "Corrected rate from 3% to the documented 3.5% and minimum premium from Kshs 50,000 to Kshs 37,500 "
         "(2025 comprehensive rating card)."),
    ]
    for insurer_code, class_code, reason in corrections:
        insurer_id = _get_insurer_id(conn, insurers_t, insurer_code)
        if insurer_id is None:
            continue
        row = _get_motor_class(conn, motor_classes_t, insurer_id, class_code)
        if row is None:
            continue
        mc_id, _active = row
        if _was_customized_since_seed(conn, rate_versions_t, mc_id):
            print(f"    ! class {insurer_code}/{class_code} has admin-made rate changes since seeding -- "
                  "skipping automated correction, review manually")
            continue
        class_data = INSURERS[insurer_code]["classes"][class_code]
        conn.execute(
            update(motor_classes_t).where(motor_classes_t.c.id == mc_id).values(
                label=class_data["label"], max_age=class_data.get("max_age"),
                min_si=class_data.get("min_si", 0), max_si=class_data.get("max_si"),
                excess=class_data.get("excess", []), benefits=class_data.get("benefits", []),
                limits=class_data.get("limits", []), updated_at=now,
            )
        )
        _deactivate_bands(conn, rate_bands_t, mc_id, now)
        _insert_bands(conn, rate_bands_t, mc_id, class_data.get("bands", []), "standard", now)
        if class_data.get("bands_alt"):
            _insert_bands(conn, rate_bands_t, mc_id, class_data["bands_alt"], "alt", now)
        snapshot_and_version(mc_id, insurer_code, reason)
        print(f"    ~ class {insurer_code}/{class_code} (corrected)")

    # --- 4. Split Pioneer's combined Special Type class into two -------
    pioneer_id = _get_insurer_id(conn, insurers_t, "pioneer")
    if pioneer_id is not None:
        for new_code in ("special_farm_warehouses", "special_construction"):
            if _get_motor_class(conn, motor_classes_t, pioneer_id, new_code) is not None:
                continue
            class_data = INSURERS["pioneer"]["classes"][new_code]
            mc_id = _create_motor_class(conn, motor_classes_t, pioneer_id, new_code, class_data, now)
            _insert_bands(conn, rate_bands_t, mc_id, class_data.get("bands", []), "standard", now)
            snapshot_and_version(
                mc_id, "pioneer",
                "Split from the combined 'Special Type (Farm & Warehouses / Construction)' class per the 2025 "
                "rating-card correction; corrected max_age 20 -> 15.",
            )
            print(f"    + class pioneer/{new_code}")

        old = _get_motor_class(conn, motor_classes_t, pioneer_id, "special_type")
        if old is not None:
            mc_id, active = old
            if active:
                conn.execute(update(motor_classes_t).where(motor_classes_t.c.id == mc_id).values(active=False, updated_at=now))
                snapshot_and_version(
                    mc_id, "pioneer",
                    "Deactivated: split into separate special_farm_warehouses and special_construction classes "
                    "(this combined class incorrectly merged two distinct products at the wrong max_age of 20 "
                    "instead of 15).",
                )
                print("    - class pioneer/special_type (deactivated)")

    # --- 5. Deactivate Monarch's obsolete duplicate 'private_400plus' --
    monarch_id = _get_insurer_id(conn, insurers_t, "monarch")
    if monarch_id is not None:
        old = _get_motor_class(conn, motor_classes_t, monarch_id, "private_400plus")
        if old is not None:
            mc_id, active = old
            if active:
                conn.execute(update(motor_classes_t).where(motor_classes_t.c.id == mc_id).values(active=False, updated_at=now))
                snapshot_and_version(
                    mc_id, "monarch",
                    "Deactivated: merged into private_400_499 (now unbounded, covers SI 400,000 and above) -- "
                    "this class duplicated that product with Excess Protector/PVT terms not found in the "
                    "Monarch rate card.",
                )
                print("    - class monarch/private_400plus (deactivated)")


def downgrade() -> None:
    # Data corrections made in upgrade() are intentionally not reverted --
    # unwinding rate corrections/deactivations would require guessing what
    # any subsequent admin edits should be reset to, and historical
    # quotations already reference their own frozen QuotationSnapshot, not
    # these live rows. Downgrade only reverses the schema change.
    op.drop_column('rate_bands', 'pvt_mandatory')
    op.drop_column('rate_bands', 'ep_mandatory')
