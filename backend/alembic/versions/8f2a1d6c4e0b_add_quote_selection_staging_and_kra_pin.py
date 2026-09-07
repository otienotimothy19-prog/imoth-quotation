"""add quote_selections staging table, DOCUMENTS_PENDING status, kra_pin

Supports moving personal-information collection to after quote selection:
customers now pick a vehicle/cover, compare anonymously, and lock in a
choice (a new `quote_selections` row, holding zero personal information)
before "About You" is ever asked for. Only once personal details are
submitted does a real `Quotation` row get created -- starting life in the
new `DOCUMENTS_PENDING` status instead of `GENERATED`, so the existing
accept/reject/document machinery keeps working unchanged.

`kra_pin` is a new free-text column on `clients`: KRA PIN previously only
existed as an uploaded document type, never as a validated text value.

Revision ID: 8f2a1d6c4e0b
Revises: 57f90352b8f7
Create Date: 2026-09-07 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = '8f2a1d6c4e0b'
down_revision: Union[str, None] = '57f90352b8f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('clients', sa.Column('kra_pin', sa.String(length=20), nullable=True))

    # New enum value on an already-live, in-use type. Postgres (12+)
    # supports this inside a transaction; the new value just can't be used
    # by a row written within this same migration, which we don't need to.
    op.execute("ALTER TYPE quotation_status ADD VALUE IF NOT EXISTS 'DOCUMENTS_PENDING'")

    op.create_table(
        'quote_selections',
        sa.Column('registration_no', sa.String(length=30), nullable=False),
        sa.Column('year_of_manufacture', sa.Integer(), nullable=False),
        sa.Column('make', sa.String(length=100), nullable=True),
        sa.Column('model', sa.String(length=100), nullable=True),
        sa.Column('cover_type', sa.String(length=50), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('commercial_use', sa.String(length=30), nullable=True),
        sa.Column('institution_type', sa.String(length=30), nullable=True),
        sa.Column('institutional_vehicle_type', sa.String(length=30), nullable=True),
        sa.Column('passenger_category', sa.String(length=30), nullable=True),
        sa.Column('sum_insured', sa.Numeric(14, 2), nullable=False),
        sa.Column('options', JSONB(), nullable=False),
        sa.Column('insurer_id', sa.UUID(), nullable=False),
        sa.Column('motor_class_id', sa.UUID(), nullable=True),
        sa.Column('vehicle_class_label', sa.String(length=255), nullable=False),
        sa.Column('rate_version_id', sa.UUID(), nullable=True),
        sa.Column('basic_premium', sa.Numeric(14, 2), nullable=False),
        sa.Column('subtotal', sa.Numeric(14, 2), nullable=False),
        sa.Column('levies', sa.Numeric(14, 2), nullable=False),
        sa.Column('stamp_duty', sa.Numeric(14, 2), nullable=False),
        sa.Column('total_premium', sa.Numeric(14, 2), nullable=False),
        sa.Column('items', JSONB(), nullable=False),
        sa.Column('snapshot_data', JSONB(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('SELECTED_PENDING_DETAILS', 'CONVERTED', 'EXPIRED', 'ABANDONED', name='quote_selection_status'),
            nullable=False,
        ),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('converted_quotation_id', sa.UUID(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['insurer_id'], ['insurers.id']),
        sa.ForeignKeyConstraint(['motor_class_id'], ['motor_classes.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['rate_version_id'], ['rate_versions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['converted_quotation_id'], ['quotations.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_quote_selections_insurer_id'), 'quote_selections', ['insurer_id'], unique=False)
    op.create_index(op.f('ix_quote_selections_status'), 'quote_selections', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_quote_selections_status'), table_name='quote_selections')
    op.drop_index(op.f('ix_quote_selections_insurer_id'), table_name='quote_selections')
    op.drop_table('quote_selections')
    sa.Enum(name='quote_selection_status').drop(op.get_bind(), checkfirst=True)

    # Postgres has no ALTER TYPE ... DROP VALUE -- the DOCUMENTS_PENDING
    # value on quotation_status is intentionally left in place, same as
    # every other irreversible data/schema correction in this migration
    # history. It's inert for any code that no longer writes it.

    op.drop_column('clients', 'kra_pin')
