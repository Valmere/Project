"""add report publication fields

Revision ID: 1b2c3d4e5f6a
Revises: 0a1b2c3d4e5f
Create Date: 2026-05-07 10:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "1b2c3d4e5f6a"
down_revision = "0a1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("reports", sa.Column("available_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("reports", sa.Column("signature_name", sa.String(length=255), nullable=True))
    op.create_index("ix_reports_available_at", "reports", ["available_at"], unique=False)

    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE reports
            SET published_at = COALESCE(generated_at, created_at),
                available_at = COALESCE(generated_at, created_at)
            WHERE status = 'ready'
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_reports_available_at", table_name="reports")
    op.drop_column("reports", "signature_name")
    op.drop_column("reports", "available_at")
    op.drop_column("reports", "published_at")
