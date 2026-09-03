"""add passenger limits to rate bands

Revision ID: d4a2f8b6c9e1
Revises: afb68340b006
Create Date: 2026-09-03 06:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4a2f8b6c9e1'
down_revision: Union[str, None] = 'afb68340b006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('rate_bands', sa.Column('min_passengers', sa.Integer(), nullable=True))
    op.add_column('rate_bands', sa.Column('max_passengers', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('rate_bands', 'max_passengers')
    op.drop_column('rate_bands', 'min_passengers')
