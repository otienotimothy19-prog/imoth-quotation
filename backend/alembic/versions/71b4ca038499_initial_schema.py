"""initial schema

Revision ID: 71b4ca038499
Revises:
Create Date: 2026-08-26 17:29:26.389980

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '71b4ca038499'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- tables with no (or already-satisfiable) FK dependencies ----------
    op.create_table('users',
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('full_name', sa.String(length=255), nullable=False),
    sa.Column('role', sa.Enum('SUPER_ADMIN', 'ADMIN', 'STAFF', name='user_role'), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    op.create_table('clients',
    sa.Column('full_name', sa.String(length=255), nullable=False),
    sa.Column('id_or_passport', sa.String(length=50), nullable=True),
    sa.Column('phone', sa.String(length=30), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_clients_email'), 'clients', ['email'], unique=False)
    op.create_index(op.f('ix_clients_id_or_passport'), 'clients', ['id_or_passport'], unique=False)
    op.create_index(op.f('ix_clients_phone'), 'clients', ['phone'], unique=False)

    op.create_table('insurers',
    sa.Column('code', sa.String(length=50), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('logo_path', sa.String(length=500), nullable=True),
    sa.Column('disclaimer', sa.Text(), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_insurers_code'), 'insurers', ['code'], unique=True)

    op.create_table('audit_logs',
    sa.Column('actor_type', sa.Enum('CLIENT', 'ADMIN', 'SYSTEM', name='actor_type'), nullable=False),
    sa.Column('actor_id', sa.UUID(), nullable=True),
    sa.Column('actor_label', sa.String(length=255), nullable=False),
    sa.Column('action', sa.String(length=100), nullable=False),
    sa.Column('entity_type', sa.String(length=50), nullable=False),
    sa.Column('entity_id', sa.String(length=64), nullable=True),
    sa.Column('previous_value', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('new_value', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('ip_address', sa.String(length=64), nullable=True),
    sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_entity_id'), 'audit_logs', ['entity_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_entity_type'), 'audit_logs', ['entity_type'], unique=False)

    op.create_table('system_settings',
    sa.Column('key', sa.String(length=100), nullable=False),
    sa.Column('value', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('updated_by', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_system_settings_key'), 'system_settings', ['key'], unique=True)

    # ---- vehicles (-> clients), motor_classes (-> insurers) ---------------
    op.create_table('vehicles',
    sa.Column('client_id', sa.UUID(), nullable=False),
    sa.Column('registration_no', sa.String(length=30), nullable=False),
    sa.Column('year_of_manufacture', sa.Integer(), nullable=True),
    sa.Column('age_years', sa.Integer(), nullable=True),
    sa.Column('make', sa.String(length=100), nullable=True),
    sa.Column('model', sa.String(length=100), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_vehicles_client_id'), 'vehicles', ['client_id'], unique=False)
    op.create_index(op.f('ix_vehicles_registration_no'), 'vehicles', ['registration_no'], unique=False)

    op.create_table('motor_classes',
    sa.Column('insurer_id', sa.UUID(), nullable=False),
    sa.Column('code', sa.String(length=80), nullable=False),
    sa.Column('label', sa.String(length=255), nullable=False),
    sa.Column('category', sa.String(length=50), nullable=False),
    sa.Column('max_age', sa.Integer(), nullable=True),
    sa.Column('min_si', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('max_si', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('has_lr_toggle', sa.Boolean(), nullable=False),
    sa.Column('pll_per_seat', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('pll_options', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('flat_only', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('excess', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('benefits', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('limits', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['insurer_id'], ['insurers.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('insurer_id', 'code', name='uq_motor_class_insurer_code')
    )
    op.create_index(op.f('ix_motor_classes_category'), 'motor_classes', ['category'], unique=False)
    op.create_index(op.f('ix_motor_classes_insurer_id'), 'motor_classes', ['insurer_id'], unique=False)

    op.create_table('rate_bands',
    sa.Column('motor_class_id', sa.UUID(), nullable=False),
    sa.Column('variant', sa.String(length=20), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('min_si', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('max_si', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('rate', sa.Numeric(precision=8, scale=5), nullable=False),
    sa.Column('min_premium', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('ep_included', sa.Boolean(), nullable=False),
    sa.Column('ep_not_offered', sa.Boolean(), nullable=False),
    sa.Column('ep_rate', sa.Numeric(precision=8, scale=5), nullable=False),
    sa.Column('ep_min', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('pvt_included', sa.Boolean(), nullable=False),
    sa.Column('pvt_not_offered', sa.Boolean(), nullable=False),
    sa.Column('pvt_rate', sa.Numeric(precision=8, scale=5), nullable=False),
    sa.Column('pvt_min', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('effective_date', sa.DateTime(timezone=True), nullable=True),
    sa.Column('expiry_date', sa.DateTime(timezone=True), nullable=True),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['motor_class_id'], ['motor_classes.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_rate_bands_motor_class_id'), 'rate_bands', ['motor_class_id'], unique=False)

    op.create_table('rate_versions',
    sa.Column('motor_class_id', sa.UUID(), nullable=False),
    sa.Column('version_no', sa.Integer(), nullable=False),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('change_reason', sa.Text(), nullable=True),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['motor_class_id'], ['motor_classes.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_rate_versions_motor_class_id'), 'rate_versions', ['motor_class_id'], unique=False)

    # ---- documents created WITHOUT its quotation/risk_note FKs for now ----
    # (those two tables don't exist yet, and each of them in turn wants an FK
    # back to documents.id — the constraints are added with ALTER TABLE below
    # once all three tables exist.)
    op.create_table('documents',
    sa.Column('doc_type', sa.Enum('QUOTATION', 'RISK_NOTE', name='document_type'), nullable=False),
    sa.Column('reference_number', sa.String(length=30), nullable=False),
    sa.Column('quotation_id', sa.UUID(), nullable=True),
    sa.Column('risk_note_id', sa.UUID(), nullable=True),
    sa.Column('filename', sa.String(length=500), nullable=False),
    sa.Column('storage_path', sa.String(length=1000), nullable=False),
    sa.Column('checksum', sa.String(length=128), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_documents_quotation_id'), 'documents', ['quotation_id'], unique=False)
    op.create_index(op.f('ix_documents_reference_number'), 'documents', ['reference_number'], unique=False)
    op.create_index(op.f('ix_documents_risk_note_id'), 'documents', ['risk_note_id'], unique=False)

    op.create_table('quotations',
    sa.Column('quotation_number', sa.String(length=30), nullable=False),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('client_id', sa.UUID(), nullable=False),
    sa.Column('vehicle_id', sa.UUID(), nullable=False),
    sa.Column('insurer_id', sa.UUID(), nullable=False),
    sa.Column('motor_class_id', sa.UUID(), nullable=False),
    sa.Column('cover_type', sa.String(length=50), nullable=False),
    sa.Column('vehicle_class_label', sa.String(length=255), nullable=False),
    sa.Column('sum_insured', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('options', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('basic_premium', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('subtotal', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('levies', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('stamp_duty', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('total_premium', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('amount_paid', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('balance', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('status', sa.Enum('DRAFT', 'GENERATED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', name='quotation_status'), nullable=False),
    sa.Column('source', sa.Enum('CLIENT_PORTAL', 'ADMIN_PANEL', 'API', name='quotation_source'), nullable=False),
    sa.Column('pdf_document_id', sa.UUID(), nullable=True),
    sa.Column('generated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('rejected_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('locked', sa.Boolean(), nullable=False),
    sa.Column('superseded_by_id', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
    sa.ForeignKeyConstraint(['insurer_id'], ['insurers.id'], ),
    sa.ForeignKeyConstraint(['motor_class_id'], ['motor_classes.id'], ),
    sa.ForeignKeyConstraint(['pdf_document_id'], ['documents.id'], ),
    sa.ForeignKeyConstraint(['superseded_by_id'], ['quotations.id'], ),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_quotations_client_id'), 'quotations', ['client_id'], unique=False)
    op.create_index(op.f('ix_quotations_insurer_id'), 'quotations', ['insurer_id'], unique=False)
    op.create_index(op.f('ix_quotations_motor_class_id'), 'quotations', ['motor_class_id'], unique=False)
    op.create_index(op.f('ix_quotations_quotation_number'), 'quotations', ['quotation_number'], unique=True)
    op.create_index(op.f('ix_quotations_status'), 'quotations', ['status'], unique=False)
    op.create_index(op.f('ix_quotations_vehicle_id'), 'quotations', ['vehicle_id'], unique=False)

    op.create_table('risk_notes',
    sa.Column('risk_note_number', sa.String(length=30), nullable=False),
    sa.Column('quotation_id', sa.UUID(), nullable=False),
    sa.Column('client_id', sa.UUID(), nullable=False),
    sa.Column('vehicle_id', sa.UUID(), nullable=False),
    sa.Column('insurer_id', sa.UUID(), nullable=False),
    sa.Column('cover_type', sa.String(length=50), nullable=False),
    sa.Column('sum_insured', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('premium', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('cover_start_date', sa.DateTime(timezone=True), nullable=False),
    sa.Column('cover_end_date', sa.DateTime(timezone=True), nullable=True),
    sa.Column('quotation_accepted_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('generated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('generated_by', sa.UUID(), nullable=True),
    sa.Column('status', sa.Enum('ACTIVE', 'VOID', 'CANCELLED', 'SUPERSEDED', name='risk_note_status'), nullable=False),
    sa.Column('pdf_document_id', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
    sa.ForeignKeyConstraint(['generated_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['insurer_id'], ['insurers.id'], ),
    sa.ForeignKeyConstraint(['pdf_document_id'], ['documents.id'], ),
    sa.ForeignKeyConstraint(['quotation_id'], ['quotations.id'], ),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_risk_notes_quotation_id'), 'risk_notes', ['quotation_id'], unique=True)
    op.create_index(op.f('ix_risk_notes_risk_note_number'), 'risk_notes', ['risk_note_number'], unique=True)
    op.create_index(op.f('ix_risk_notes_status'), 'risk_notes', ['status'], unique=False)

    # ---- now that quotations & risk_notes exist, close the loop on documents
    op.create_foreign_key('fk_documents_quotation_id', 'documents', 'quotations', ['quotation_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_documents_risk_note_id', 'documents', 'risk_notes', ['risk_note_id'], ['id'], ondelete='SET NULL')

    op.create_table('quotation_items',
    sa.Column('quotation_id', sa.UUID(), nullable=False),
    sa.Column('label', sa.String(length=500), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['quotation_id'], ['quotations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_quotation_items_quotation_id'), 'quotation_items', ['quotation_id'], unique=False)

    op.create_table('quotation_snapshots',
    sa.Column('quotation_id', sa.UUID(), nullable=False),
    sa.Column('rate_version_id', sa.UUID(), nullable=True),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['quotation_id'], ['quotations.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['rate_version_id'], ['rate_versions.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_quotation_snapshots_quotation_id'), 'quotation_snapshots', ['quotation_id'], unique=True)

    op.create_table('risk_note_status_history',
    sa.Column('risk_note_id', sa.UUID(), nullable=False),
    sa.Column('previous_status', sa.String(length=30), nullable=False),
    sa.Column('new_status', sa.String(length=30), nullable=False),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('changed_by', sa.UUID(), nullable=True),
    sa.Column('changed_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['changed_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['risk_note_id'], ['risk_notes.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_risk_note_status_history_risk_note_id'), 'risk_note_status_history', ['risk_note_id'], unique=False)

    op.create_table('email_logs',
    sa.Column('recipient', sa.String(length=255), nullable=False),
    sa.Column('quotation_id', sa.UUID(), nullable=True),
    sa.Column('risk_note_id', sa.UUID(), nullable=True),
    sa.Column('document_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('subject', sa.String(length=500), nullable=False),
    sa.Column('initiated_by', sa.String(length=255), nullable=False),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('status', sa.Enum('PENDING', 'SENT', 'FAILED', name='email_status'), nullable=False),
    sa.Column('error_message', sa.Text(), nullable=True),
    sa.Column('retry_count', sa.Integer(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['quotation_id'], ['quotations.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['risk_note_id'], ['risk_notes.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_email_logs_quotation_id'), 'email_logs', ['quotation_id'], unique=False)
    op.create_index(op.f('ix_email_logs_recipient'), 'email_logs', ['recipient'], unique=False)
    op.create_index(op.f('ix_email_logs_risk_note_id'), 'email_logs', ['risk_note_id'], unique=False)
    op.create_index(op.f('ix_email_logs_status'), 'email_logs', ['status'], unique=False)


def downgrade() -> None:
    op.drop_table('email_logs')
    op.drop_table('risk_note_status_history')
    op.drop_table('quotation_snapshots')
    op.drop_table('quotation_items')
    op.drop_constraint('fk_documents_risk_note_id', 'documents', type_='foreignkey')
    op.drop_constraint('fk_documents_quotation_id', 'documents', type_='foreignkey')
    op.drop_table('risk_notes')
    op.drop_table('quotations')
    op.drop_table('documents')
    op.drop_table('rate_versions')
    op.drop_table('rate_bands')
    op.drop_table('motor_classes')
    op.drop_table('vehicles')
    op.drop_table('system_settings')
    op.drop_table('audit_logs')
    op.drop_table('insurers')
    op.drop_table('clients')
    op.drop_table('users')
    for enum_name in (
        'email_status', 'risk_note_status', 'quotation_source', 'quotation_status',
        'document_type', 'actor_type', 'user_role',
    ):
        op.execute(f'DROP TYPE IF EXISTS {enum_name} CASCADE')
