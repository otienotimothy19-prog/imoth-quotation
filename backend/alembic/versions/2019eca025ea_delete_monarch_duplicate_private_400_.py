"""delete Monarch's duplicate Private Car (max age 20) classes

The admin's Rate Management "Motor Class" dropdown was still listing two
near-identical Monarch products -- "Private Car (Max Age 20yrs, SI 400,000
and above)" (code `private_400_499`) and an older, already-*deactivated*
duplicate "Private Car (Max Age 20yrs, SI 400,000-499,999)" (code
`private_400plus`) -- because that dropdown lists inactive classes too (see
the paired frontend fix). `private_400plus` was deactivated as an "obsolete
duplicate... with unsourced Excess Protector/PVT terms" by the
afb68340b006 rate-correction migration, merged into `private_400_499`.
Confirmed with the business: neither product should exist any more, so
both are deleted outright here rather than left deactivated.

`rate_bands`/`rate_versions` rows for both classes cascade-delete at the
database level (`ON DELETE CASCADE`, same as the existing
`DELETE /api/admin/motor-classes/{id}` admin action). Any historical
`Quotation.motor_class_id` referencing either class is already
`ON DELETE SET NULL`, so previously issued quotations/snapshots/PDFs are
untouched.

Guarded and idempotent: a no-op on any environment where Monarch, or either
class code, doesn't exist (e.g. a fresh seed from the current
insurers_data.py, which never defines `private_400plus` at all -- it only
ever existed as a historical artifact of an earlier seed).

Revision ID: 2019eca025ea
Revises: 9b7c2e4a6d10
Create Date: 2026-10-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import MetaData, Table, delete, select

# revision identifiers, used by Alembic.
revision: str = '2019eca025ea'
down_revision: Union[str, None] = '9b7c2e4a6d10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    meta = MetaData()
    insurers_t = Table("insurers", meta, autoload_with=conn)
    motor_classes_t = Table("motor_classes", meta, autoload_with=conn)

    monarch_id_row = conn.execute(select(insurers_t.c.id).where(insurers_t.c.code == "monarch")).first()
    if monarch_id_row is None:
        return
    monarch_id = monarch_id_row[0]

    for class_code in ("private_400_499", "private_400plus"):
        mc_row = conn.execute(
            select(motor_classes_t.c.id).where(
                motor_classes_t.c.insurer_id == monarch_id, motor_classes_t.c.code == class_code
            )
        ).first()
        if mc_row is None:
            continue
        conn.execute(delete(motor_classes_t).where(motor_classes_t.c.id == mc_row[0]))
        print(f"    - class monarch/{class_code} (deleted)")


def downgrade() -> None:
    # Not reversible -- recreating these classes with their exact original
    # rates would mean reintroducing a product the business has confirmed
    # should no longer exist, same as every other data-correction/removal
    # migration in this history.
    pass
