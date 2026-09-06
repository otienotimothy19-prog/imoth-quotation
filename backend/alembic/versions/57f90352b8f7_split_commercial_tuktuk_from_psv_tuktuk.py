"""split Commercial Tuk Tuk from PSV Tuk Tuk

"Tuk Tuk" was a single top-level category (category="tuktuk") mixing two
different products with no way to distinguish them in a live quotation
request: a goods/business-use tuktuk and a fare-paying PSV tuktuk, from
every insurer, shown together in one comparison sorted by cheapest price.

This reclassifies the goods/business-use rows as a 4th customer-facing
Commercial sub-branch (category="commercial", commercial_use=
"commercial_tuktuk"), mirroring how Commercial Institutional was already
moved under Commercial. The PSV tuktuk rows are left completely untouched
(still category="tuktuk") -- since `list_eligible_options` filters by an
exact category match, this alone guarantees a Commercial Tuk Tuk request
can never return a PSV Tuk Tuk row and vice versa, with no new column and
no label matching.

Exact mapping (idempotent, keyed by insurer code + motor class code):
- (pioneer, tuktuk_corporate): category="commercial",
  commercial_use="commercial_tuktuk". Its own label is "Tuk Tuk -
  Corporate & Delivery" -- corporate/delivery is goods/business use, not
  fare-paying passenger transport, so this is the correct side of the
  split even though it wasn't named "tuktuk_commercial".
- (monarch, tuktuk_commercial): same.
- (definite, tuktuk_commercial): same.
- (directline, tpo_tuktuk_commercial): commercial_use="commercial_tuktuk"
  only -- category stays "tpo". Directline is a TPO-only insurer that
  already buckets every vehicle type's TPO product under a single flat
  "tpo" category; that pre-existing bucketing is untouched here, but the
  tag is set for correctness/traceability.
- (monarch, tuktuk_psv), (definite, tuktuk_psv),
  (directline, tpo_psv_tuktuk): left completely untouched.

This only changes each MotorClass row's own classification columns -- no
RateBand, RateVersion, Quotation, QuotationItem or QuotationSnapshot row is
read or written, so historical quotations referencing any of these rows by
ID remain exactly as readable as they were before.

Revision ID: 57f90352b8f7
Revises: 3927fda8beac
Create Date: 2026-09-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import MetaData, Table, select, update

# revision identifiers, used by Alembic.
revision: str = '57f90352b8f7'
down_revision: Union[str, None] = '3927fda8beac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (insurer_code, motor_class_code) -> (new_category_or_None, commercial_use)
# category is None when it should stay whatever it already is (the
# Directline TPO row).
_TUKTUK_RECLASSIFICATION = {
    ("pioneer", "tuktuk_corporate"): ("commercial", "commercial_tuktuk"),
    ("monarch", "tuktuk_commercial"): ("commercial", "commercial_tuktuk"),
    ("definite", "tuktuk_commercial"): ("commercial", "commercial_tuktuk"),
    ("directline", "tpo_tuktuk_commercial"): (None, "commercial_tuktuk"),
}

# Original (category, commercial_use) values, for downgrade.
_ORIGINAL_VALUES = {
    ("pioneer", "tuktuk_corporate"): ("tuktuk", None),
    ("monarch", "tuktuk_commercial"): ("tuktuk", None),
    ("definite", "tuktuk_commercial"): ("tuktuk", None),
    ("directline", "tpo_tuktuk_commercial"): ("tpo", None),
}


def _apply(conn, insurers_t, classes_t, mapping) -> None:
    for (insurer_code, class_code), (category, commercial_use) in mapping.items():
        insurer_row = conn.execute(select(insurers_t.c.id).where(insurers_t.c.code == insurer_code)).first()
        if insurer_row is None:
            continue
        values = {"commercial_use": commercial_use}
        if category is not None:
            values["category"] = category
        conn.execute(
            update(classes_t)
            .where(classes_t.c.insurer_id == insurer_row[0], classes_t.c.code == class_code)
            .values(**values)
        )


def upgrade() -> None:
    conn = op.get_bind()
    metadata = MetaData()
    insurers_t = Table('insurers', metadata, autoload_with=conn)
    classes_t = Table('motor_classes', metadata, autoload_with=conn)
    _apply(conn, insurers_t, classes_t, _TUKTUK_RECLASSIFICATION)


def downgrade() -> None:
    conn = op.get_bind()
    metadata = MetaData()
    insurers_t = Table('insurers', metadata, autoload_with=conn)
    classes_t = Table('motor_classes', metadata, autoload_with=conn)
    _apply(conn, insurers_t, classes_t, _ORIGINAL_VALUES)
