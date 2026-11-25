"""Add agent accounts: AGENT role, user phone, quotation creator.

Revision ID: b5e9d3a7c1f4
Revises: 2019eca025ea
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'b5e9d3a7c1f4'
down_revision: Union[str, None] = '2019eca025ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A new enum value must be committed before anything can use it.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'AGENT'")

    op.add_column('users', sa.Column('phone', sa.String(length=30), nullable=True))

    op.add_column('quotations', sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index(op.f('ix_quotations_created_by_id'), 'quotations', ['created_by_id'], unique=False)
    op.create_foreign_key(
        'quotations_created_by_id_fkey', 'quotations', 'users', ['created_by_id'], ['id'], ondelete='SET NULL'
    )

    # Backfill the creator of existing admin-panel quotations from the
    # quotation PDF document, which has always recorded who generated it.
    op.execute("""
        UPDATE quotations q SET created_by_id = d.created_by
        FROM documents d
        WHERE d.id = q.pdf_document_id AND d.created_by IS NOT NULL AND q.created_by_id IS NULL
    """)


def downgrade() -> None:
    op.drop_constraint('quotations_created_by_id_fkey', 'quotations', type_='foreignkey')
    op.drop_index(op.f('ix_quotations_created_by_id'), table_name='quotations')
    op.drop_column('quotations', 'created_by_id')
    op.drop_column('users', 'phone')
    # PostgreSQL cannot remove enum values; leave the unused AGENT value in place.
