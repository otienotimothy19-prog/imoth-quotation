"""quotation_snapshots.rate_version_id ON DELETE SET NULL

Deleting a motor class permanently (Admin > Motor Classes > Delete) cascades
at the database level to delete that class's RateVersion rows (their FK
already has ON DELETE CASCADE). But quotation_snapshots.rate_version_id
pointed at those rows with no ON DELETE action, so deleting a class that
ever had both a versioned rate change *and* a quotation generated against
it -- the normal case -- failed the whole DELETE with a foreign-key
violation, contradicting the "deletion always succeeds, quotations keep
their own history" guarantee already built for Quotation.motor_class_id.

QuotationSnapshot.data already carries the complete frozen pricing
snapshot (rates, bands, benefits, everything), so rate_version_id is only
a traceability pointer to the RateVersion audit-history row -- losing it
when that row is gone is exactly as harmless as losing motor_class_id
already is.

Revision ID: 3927fda8beac
Revises: a1c4e6f2b8d0
Create Date: 2026-09-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '3927fda8beac'
down_revision: Union[str, None] = 'a1c4e6f2b8d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('quotation_snapshots_rate_version_id_fkey', 'quotation_snapshots', type_='foreignkey')
    op.create_foreign_key(
        'quotation_snapshots_rate_version_id_fkey',
        'quotation_snapshots', 'rate_versions',
        ['rate_version_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('quotation_snapshots_rate_version_id_fkey', 'quotation_snapshots', type_='foreignkey')
    op.create_foreign_key(
        'quotation_snapshots_rate_version_id_fkey',
        'quotation_snapshots', 'rate_versions',
        ['rate_version_id'], ['id'],
    )
