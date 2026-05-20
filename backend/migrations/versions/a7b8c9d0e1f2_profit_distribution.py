"""profit/loss distribution model — company entity, distribution_id, ratios

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-04-27 10:00:00.000000

Met en place la mécanique de distribution P&L :
  - `investors.is_company` : exactement UN row marqué True (Valmere & Co)
    représente la personne morale, exclu du pool des investisseurs.
  - `transactions.distribution_id` : groupe les N+1 transactions issues d'un
    même bénéfice/perte (1 société + N investisseurs au pro-rata).
  - `company_settings.profit_share_company / profit_share_investors` :
    politique configurable (par défaut 80% société / 20% investisseurs).
  - Seed : crée la ligne « Valmere & Co » dans `investors` si absente, plus
    son investment associé pour suivre son solde.
"""
from datetime import date
import uuid

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a7b8c9d0e1f2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Investor.is_company
    op.add_column(
        "investors",
        sa.Column("is_company", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # 2) Transaction.distribution_id (indexé pour grouper les lignes d'une distribution)
    op.add_column(
        "transactions",
        sa.Column("distribution_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_transactions_distribution_id",
        "transactions",
        ["distribution_id"],
    )

    # 3) CompanySettings : ratios de distribution (somme = 1.0)
    op.add_column(
        "company_settings",
        sa.Column("profit_share_company", sa.Numeric(5, 4), nullable=False, server_default="0.80"),
    )
    op.add_column(
        "company_settings",
        sa.Column("profit_share_investors", sa.Numeric(5, 4), nullable=False, server_default="0.20"),
    )

    # 4) Seed : compte société Valmere & Co + investment associé
    # ──────────────────────────────────────────────────────────────────
    # On utilise la connexion de la migration pour faire un upsert idempotent :
    # si une ligne avec is_company=True existe déjà, on ne crée rien.
    bind = op.get_bind()
    existing = bind.execute(
        sa.text("SELECT id FROM investors WHERE is_company = true LIMIT 1")
    ).first()

    if not existing:
        company_id = uuid.uuid4()
        investment_id = uuid.uuid4()
        today = date.today().isoformat()

        # Code dédié `COMPANY` — ne suit pas la séquence INV-XXXX (réservée aux
        # vrais investisseurs). La contrainte unique sur `code` est respectée.
        bind.execute(
            sa.text(
                """
                INSERT INTO investors (
                    id, code, full_name, email, status, entry_date,
                    is_company, created_at, updated_at
                ) VALUES (
                    :id, 'COMPANY', 'Valmere & Co', NULL, 'active', :entry_date,
                    true, NOW(), NOW()
                )
                """
            ),
            {"id": str(company_id), "entry_date": today},
        )
        bind.execute(
            sa.text(
                """
                INSERT INTO investments (
                    id, investor_id, name, currency, initial_capital, current_value,
                    start_date, status, created_at, updated_at
                ) VALUES (
                    :id, :investor_id, 'Compte société', 'HTG', 0, 0,
                    :start_date, 'active', NOW(), NOW()
                )
                """
            ),
            {
                "id": str(investment_id),
                "investor_id": str(company_id),
                "start_date": today,
            },
        )


def downgrade() -> None:
    # Note : on ne supprime PAS le row société Valmere & Co — il peut avoir
    # accumulé des transactions et son retrait casserait l'historique. Les
    # ratios reviennent par défaut côté code si les colonnes disparaissent.
    op.drop_column("company_settings", "profit_share_investors")
    op.drop_column("company_settings", "profit_share_company")

    op.drop_index("ix_transactions_distribution_id", table_name="transactions")
    op.drop_column("transactions", "distribution_id")

    op.drop_column("investors", "is_company")
