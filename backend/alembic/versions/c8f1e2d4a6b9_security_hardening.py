"""Security hardening: account lockout, forced password change, session
revocation (token_version) and emailed login codes (login_challenges).

Revision ID: c8f1e2d4a6b9
Revises: b5e9d3a7c1f4
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'c8f1e2d4a6b9'
down_revision: Union[str, None] = 'b5e9d3a7c1f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('users', sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('failed_login_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('token_version', sa.Integer(), nullable=False, server_default='0'))

    op.create_table(
        'login_challenges',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code_hash', sa.String(length=128), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('resend_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_sent_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ip_address', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(op.f('ix_login_challenges_user_id'), 'login_challenges', ['user_id'], unique=False)

    # Anyone still using the well-known default bootstrap password must pick
    # a new one at their next login.
    import bcrypt

    conn = op.get_bind()
    for user_id, password_hash in conn.execute(sa.text("SELECT id, password_hash FROM users")).fetchall():
        try:
            is_default = bcrypt.checkpw(b"ChangeMe123!", password_hash.encode("utf-8"))
        except ValueError:
            is_default = False
        if is_default:
            conn.execute(sa.text("UPDATE users SET must_change_password = true WHERE id = :id"), {"id": user_id})


def downgrade() -> None:
    op.drop_index(op.f('ix_login_challenges_user_id'), table_name='login_challenges')
    op.drop_table('login_challenges')
    op.drop_column('users', 'token_version')
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_login_count')
    op.drop_column('users', 'password_changed_at')
    op.drop_column('users', 'must_change_password')
