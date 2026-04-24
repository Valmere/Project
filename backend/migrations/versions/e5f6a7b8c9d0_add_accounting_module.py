"""add accounting module (accounts + journal entries + lines)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-23 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Chart of accounts (plan comptable) ────────────────────────────────
    op.create_table(
        "accounts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(length=20), nullable=False, unique=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("parent_id", sa.Uuid(), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("currency", sa.String(length=10), server_default="HTG"),
        sa.Column("is_postable", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "type IN ('asset','liability','equity','revenue','expense')",
            name="ck_accounts_type",
        ),
    )
    op.create_index("ix_accounts_code", "accounts", ["code"])
    op.create_index("ix_accounts_parent_id", "accounts", ["parent_id"])

    # ── Journal entries (headers) ─────────────────────────────────────────
    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("reference", sa.String(length=100), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("posted_by", sa.Uuid(), nullable=True),
        sa.Column("source_type", sa.String(length=50), nullable=True),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft','posted','void')",
            name="ck_journal_entries_status",
        ),
    )
    op.create_foreign_key(
        "fk_journal_entries_posted_by_users",
        "journal_entries", "users", ["posted_by"], ["id"], use_alter=True,
    )
    op.create_foreign_key(
        "fk_journal_entries_created_by_users",
        "journal_entries", "users", ["created_by"], ["id"], use_alter=True,
    )
    op.create_index("ix_journal_entries_entry_date", "journal_entries", ["entry_date"])
    op.create_index("ix_journal_entries_reference", "journal_entries", ["reference"])
    op.create_index("ix_journal_entries_source", "journal_entries", ["source_type", "source_id"])

    # ── Journal lines (debit/credit legs) ─────────────────────────────────
    op.create_table(
        "journal_lines",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "entry_id", sa.Uuid(),
            sa.ForeignKey("journal_entries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "account_id", sa.Uuid(),
            sa.ForeignKey("accounts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("line_number", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("debit", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("credit", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("original_currency", sa.String(length=10), server_default="HTG"),
        sa.Column("original_amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("fx_rate", sa.Numeric(18, 8), nullable=True),
        sa.Column("investor_id", sa.Uuid(), sa.ForeignKey("investors.id"), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "(debit = 0 AND credit > 0) OR (debit > 0 AND credit = 0)",
            name="ck_journal_line_debit_xor_credit",
        ),
    )
    op.create_index("ix_journal_lines_entry_id", "journal_lines", ["entry_id"])
    op.create_index("ix_journal_lines_account_id", "journal_lines", ["account_id"])
    op.create_index("ix_journal_lines_investor_id", "journal_lines", ["investor_id"])


def downgrade() -> None:
    op.drop_index("ix_journal_lines_investor_id", table_name="journal_lines")
    op.drop_index("ix_journal_lines_account_id", table_name="journal_lines")
    op.drop_index("ix_journal_lines_entry_id", table_name="journal_lines")
    op.drop_table("journal_lines")

    op.drop_index("ix_journal_entries_source", table_name="journal_entries")
    op.drop_index("ix_journal_entries_reference", table_name="journal_entries")
    op.drop_index("ix_journal_entries_entry_date", table_name="journal_entries")
    op.drop_constraint("fk_journal_entries_created_by_users", "journal_entries", type_="foreignkey")
    op.drop_constraint("fk_journal_entries_posted_by_users", "journal_entries", type_="foreignkey")
    op.drop_table("journal_entries")

    op.drop_index("ix_accounts_parent_id", table_name="accounts")
    op.drop_index("ix_accounts_code", table_name="accounts")
    op.drop_table("accounts")
