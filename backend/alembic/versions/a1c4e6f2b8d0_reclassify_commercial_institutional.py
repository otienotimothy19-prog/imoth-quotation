"""reclassify commercial institutional; add commercial_use/eligibility fields

Adds the columns needed to model Commercial Institutional as a
passenger-carrying sub-use of "commercial" (rather than its own top-level
category), plus admin-configurable eligibility restrictions and flags:

- motor_classes.commercial_use (own_goods / general_cartage /
  commercial_institutional / hybrid / private_hire / online_hailed / tanker)
- motor_classes.eligible_institution_types / eligible_vehicle_types /
  eligible_passenger_categories (JSONB lists; null = no restriction)
- motor_classes.pll_included (bundle PLL into the base rate, don't charge)
- motor_classes.tonnage_required (generate-time hard requirement)

Then reclassifies the 4 existing category="institutional" motor classes in
place to category="commercial", commercial_use="commercial_institutional",
and backfills commercial_use on every pre-existing commercial-category
class so the customer-facing "3 branches" filter (Own Goods / General
Cartage / Commercial Institutional) works for all of them, not just the
newly-reclassified rows.

This only changes each MotorClass row's own classification columns -- no
RateBand, RateVersion, Quotation, QuotationItem or QuotationSnapshot row is
read or written. Historical quotations reference their motor class by a
nullable FK and already carry their own frozen vehicle_class_label and
QuotationSnapshot.data, so they are completely unaffected by this
reclassification and remain fully readable afterward.

Idempotent: every statement here is a fixed-value UPDATE keyed on
insurer.code + motor_classes.code, safe to re-run.

Revision ID: a1c4e6f2b8d0
Revises: f3b8d1c6a5e9
Create Date: 2026-09-06 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import MetaData, Table, select, update
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = 'a1c4e6f2b8d0'
down_revision: Union[str, None] = 'f3b8d1c6a5e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (insurer_code, motor_class_code) -> commercial_use
_COMMERCIAL_USE_BY_CLASS = {
    # Reclassified from category="institutional".
    ("pioneer", "school_bus"): "commercial_institutional",
    ("monarch", "commercial_institutional"): "commercial_institutional",
    ("cic", "institutional"): "commercial_institutional",
    ("definite", "commercial_institutional"): "commercial_institutional",
    # Pre-existing commercial-category classes, backfilled.
    ("pioneer", "commercial_hybrid"): "hybrid",
    ("kenyaorient", "commercial"): "hybrid",
    ("monarch", "commercial_own_goods"): "own_goods",
    ("monarch", "commercial_general_cartage"): "general_cartage",
    ("cic", "hybrid_zero_trucks"): "hybrid",
    ("cic", "hybrid_nonzero_trucks"): "hybrid",
    ("cic", "hybrid_zero_pickups"): "hybrid",
    ("cic", "hybrid_nonzero_pickups"): "hybrid",
    ("definite", "commercial_hybrid"): "hybrid",
    ("apa", "commercial_own_goods"): "own_goods",
    ("apa", "commercial_private_hire"): "private_hire",
    ("apa", "commercial_online_hailed"): "online_hailed",
    ("britam", "commercial_general_cartage"): "general_cartage",
    ("britam", "commercial_own_goods"): "own_goods",
}

# The subset that must also move category "institutional" -> "commercial".
_RECLASSIFY_TO_COMMERCIAL = {
    ("pioneer", "school_bus"),
    ("monarch", "commercial_institutional"),
    ("cic", "institutional"),
    ("definite", "commercial_institutional"),
}

# These 3 of the 4 reclassified institutional classes already had tiered
# Passenger Legal Liability options (a 4th, Definite, uses a single flat
# pll_per_seat and needs no per-tier tagging). Their existing pll_options
# rows predate the `applies_to` tag, so pricing would otherwise fall back
# to always charging the first configured tier -- silently overcharging
# (or undercharging) whichever passenger category isn't listed first. This
# backfills each option with the exact passenger-category tags from the
# insurer's own binder terms (never a hard-coded universal rate), matching
# app.seed.insurers_data verbatim.
_PLL_OPTIONS_BY_CLASS = {
    ("pioneer", "school_bus"): [
        {"key": "student", "label": "Own students (free)", "rate": 0, "applies_to": ["STUDENTS"]},
        {"key": "affiliated", "label": "Affiliated group hire", "rate": 250, "applies_to": ["STAFF", "CHURCH_MEMBERS"]},
        {"key": "nonaffiliated", "label": "Non-affiliated / general hire", "rate": 500, "applies_to": ["GENERAL_INSTITUTIONAL"]},
    ],
    ("monarch", "commercial_institutional"): [
        {"key": "organised", "label": "Organised group / general hire", "rate": 500, "applies_to": ["STAFF", "CHURCH_MEMBERS", "GENERAL_INSTITUTIONAL"]},
        {"key": "student", "label": "Students", "rate": 250, "applies_to": ["STUDENTS"]},
    ],
    ("cic", "institutional"): [
        {"key": "organised", "label": "Organised groups", "rate": 200, "applies_to": ["STAFF", "CHURCH_MEMBERS", "GENERAL_INSTITUTIONAL"]},
        {"key": "student", "label": "Students / school employees", "rate": 0, "applies_to": ["STUDENTS"]},
    ],
}


def upgrade() -> None:
    op.add_column('motor_classes', sa.Column('commercial_use', sa.String(length=30), nullable=True))
    op.add_column('motor_classes', sa.Column('eligible_institution_types', JSONB(), nullable=True))
    op.add_column('motor_classes', sa.Column('eligible_vehicle_types', JSONB(), nullable=True))
    op.add_column('motor_classes', sa.Column('eligible_passenger_categories', JSONB(), nullable=True))
    op.add_column('motor_classes', sa.Column('pll_included', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('motor_classes', sa.Column('tonnage_required', sa.Boolean(), nullable=False, server_default=sa.false()))

    conn = op.get_bind()
    metadata = MetaData()
    insurers_t = Table('insurers', metadata, autoload_with=conn)
    classes_t = Table('motor_classes', metadata, autoload_with=conn)

    for (insurer_code, class_code), commercial_use in _COMMERCIAL_USE_BY_CLASS.items():
        insurer_row = conn.execute(select(insurers_t.c.id).where(insurers_t.c.code == insurer_code)).first()
        if insurer_row is None:
            continue
        values = {"commercial_use": commercial_use}
        if (insurer_code, class_code) in _RECLASSIFY_TO_COMMERCIAL:
            values["category"] = "commercial"
        conn.execute(
            update(classes_t)
            .where(classes_t.c.insurer_id == insurer_row[0], classes_t.c.code == class_code)
            .values(**values)
        )

    for (insurer_code, class_code), pll_options in _PLL_OPTIONS_BY_CLASS.items():
        insurer_row = conn.execute(select(insurers_t.c.id).where(insurers_t.c.code == insurer_code)).first()
        if insurer_row is None:
            continue
        conn.execute(
            update(classes_t)
            .where(classes_t.c.insurer_id == insurer_row[0], classes_t.c.code == class_code)
            .values(pll_options=pll_options)
        )


def downgrade() -> None:
    # The pll_options `applies_to` backfill above is intentionally not
    # reverted -- unwinding it would require guessing what any subsequent
    # admin edit to those rates should be reset to, and historical
    # quotations already reference their own frozen QuotationSnapshot, not
    # these live rows.
    conn = op.get_bind()
    metadata = MetaData()
    insurers_t = Table('insurers', metadata, autoload_with=conn)
    classes_t = Table('motor_classes', metadata, autoload_with=conn)

    for (insurer_code, class_code) in _RECLASSIFY_TO_COMMERCIAL:
        insurer_row = conn.execute(select(insurers_t.c.id).where(insurers_t.c.code == insurer_code)).first()
        if insurer_row is None:
            continue
        conn.execute(
            update(classes_t)
            .where(classes_t.c.insurer_id == insurer_row[0], classes_t.c.code == class_code)
            .values(category="institutional", commercial_use=None)
        )

    op.drop_column('motor_classes', 'tonnage_required')
    op.drop_column('motor_classes', 'pll_included')
    op.drop_column('motor_classes', 'eligible_passenger_categories')
    op.drop_column('motor_classes', 'eligible_vehicle_types')
    op.drop_column('motor_classes', 'eligible_institution_types')
    op.drop_column('motor_classes', 'commercial_use')
