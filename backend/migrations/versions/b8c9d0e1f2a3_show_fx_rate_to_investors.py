"""show_fx_rate_to_investors flag on company_settings

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-04-27 14:00:00.000000

Toggle administrateur : permet aux investisseurs de voir, sur leurs relevés,
le taux de change figé au moment de chaque transaction. Utile pour la
transparence quand l'investisseur filtre dans une autre devise et veut
comprendre l'origine des conversions.
"""
from alembic import op
import sqlalchemy as sa


revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "company_settings",
        sa.Column(
            "show_fx_rate_to_investors",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("company_settings", "show_fx_rate_to_investors")
