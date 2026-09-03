"""allow motor class deletion, detach quotations instead of blocking

Revision ID: e7c1a9f4b2d3
Revises: d4a2f8b6c9e1
Create Date: 2026-09-03 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'e7c1a9f4b2d3'
down_revision: Union[str, None] = 'd4a2f8b6c9e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('quotations', 'motor_class_id', existing_type=UUID(as_uuid=True), nullable=True)
    op.drop_constraint('quotations_motor_class_id_fkey', 'quotations', type_='foreignkey')
    op.create_foreign_key(
        'quotations_motor_class_id_fkey',
        'quotations', 'motor_classes',
        ['motor_class_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('quotations_motor_class_id_fkey', 'quotations', type_='foreignkey')
    op.create_foreign_key(
        'quotations_motor_class_id_fkey',
        'quotations', 'motor_classes',
        ['motor_class_id'], ['id'],
    )
    op.alter_column('quotations', 'motor_class_id', existing_type=UUID(as_uuid=True), nullable=False)
