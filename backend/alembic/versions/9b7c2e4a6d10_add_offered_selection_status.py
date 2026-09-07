"""Distinguish anonymous offers from explicit acceptance intentions."""
from alembic import op

revision = '9b7c2e4a6d10'
down_revision = '8f2a1d6c4e0b'
branch_labels = None
depends_on = None


def upgrade():
    # Commit the enum addition before using its value in the data correction.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE quote_selection_status ADD VALUE IF NOT EXISTS 'OFFERED'")
    op.execute("""
        UPDATE quote_selections SET status = 'OFFERED'
        WHERE status = 'SELECTED_PENDING_DETAILS'
          AND snapshot_data->>'offer_selected' = 'false'
    """)


def downgrade():
    op.execute("UPDATE quote_selections SET status = 'SELECTED_PENDING_DETAILS' WHERE status = 'OFFERED'")
    # PostgreSQL cannot remove enum values; leave the unused value in place.
