"""add currency_rates table

Revision ID: a1b2c3d4e5f6
Revises: 92e35f87fe57
Create Date: 2026-04-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '92e35f87fe57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'currency_rates',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('from_currency', sa.String(length=10), nullable=False),
        sa.Column('to_currency', sa.String(length=10), nullable=False),
        sa.Column('rate', sa.Numeric(18, 8), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_by', sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], use_alter=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('from_currency', 'to_currency', name='uq_currency_pair'),
    )
    op.create_index('ix_currency_rates_from_currency', 'currency_rates', ['from_currency'])
    op.create_index('ix_currency_rates_to_currency', 'currency_rates', ['to_currency'])


def downgrade() -> None:
    op.drop_index('ix_currency_rates_to_currency', table_name='currency_rates')
    op.drop_index('ix_currency_rates_from_currency', table_name='currency_rates')
    op.drop_table('currency_rates')
