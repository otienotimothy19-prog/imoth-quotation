"""Add courtesy car as a priced extension on motor classes.

Fills in courtesy_car_options for classes whose benefits already state a
courtesy car price, e.g. "Courtesy Car: 3,000 (10 days) / 6,000 (20 days)".

Revision ID: d9a3c5e7f1b2
Revises: c8f1e2d4a6b9
"""
import json
import re
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'd9a3c5e7f1b2'
down_revision: Union[str, None] = 'c8f1e2d4a6b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PRICE = re.compile(r"([\d,]+(?:\.\d+)?)\s*\(\s*(\d+)\s*days?\s*\)", re.IGNORECASE)


def _parse(benefits) -> list[dict]:
    for line in benefits or []:
        if "courtesy car" not in str(line).lower():
            continue
        found = _PRICE.findall(str(line))
        if found:
            return sorted(
                ({"days": int(days), "premium": float(amount.replace(",", ""))} for amount, days in found),
                key=lambda o: o["days"],
            )
    return []


def upgrade() -> None:
    op.add_column('motor_classes', sa.Column('courtesy_car_options', postgresql.JSONB(), nullable=True))
    conn = op.get_bind()
    for class_id, benefits in conn.execute(sa.text("SELECT id, benefits FROM motor_classes")).fetchall():
        options = _parse(benefits)
        if options:
            conn.execute(
                sa.text("UPDATE motor_classes SET courtesy_car_options = CAST(:opts AS JSONB) WHERE id = :id"),
                {"opts": json.dumps(options), "id": class_id},
            )


def downgrade() -> None:
    op.drop_column('motor_classes', 'courtesy_car_options')
