"""add tonnage limits to rate bands

Revision ID: f3b8d1c6a5e9
Revises: e7c1a9f4b2d3
Create Date: 2026-09-03 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3b8d1c6a5e9'
down_revision: Union[str, None] = 'e7c1a9f4b2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('rate_bands', sa.Column('min_tonnage', sa.Numeric(8, 2), nullable=True))
    op.add_column('rate_bands', sa.Column('max_tonnage', sa.Numeric(8, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('rate_bands', 'max_tonnage')
    op.drop_column('rate_bands', 'min_tonnage')
