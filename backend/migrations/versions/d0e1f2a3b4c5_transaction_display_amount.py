"""store user-facing transaction amount

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-04-29 13:00:00.000000

For investor bailouts the stored `amount` is the accounting delta needed to
move the account from its previous value to the requested target. These
columns preserve the amount the user actually entered so transaction screens
can show the target value instead of the internal delta.
"""
from alembic import op
import sqlalchemy as sa


revision = "d0e1f2a3b4c5"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("display_amount", sa.Numeric(18, 4), nullable=True))
    op.add_column("transactions", sa.Column("display_currency", sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "display_currency")
    op.drop_column("transactions", "display_amount")
