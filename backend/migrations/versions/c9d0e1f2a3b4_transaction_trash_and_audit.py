"""transaction trash and audit metadata

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-04-29 12:00:00.000000

Keep deleted transactions as voided rows so admins/cashiers can restore or
replay them and investors can see deleted/modified activity for transparency.
"""
from alembic import op
import sqlalchemy as sa


revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
    )
    op.add_column("transactions", sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("transactions", sa.Column("voided_by", sa.Uuid(), nullable=True))
    op.add_column("transactions", sa.Column("void_reason", sa.Text(), nullable=True))
    op.add_column("transactions", sa.Column("restored_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("transactions", sa.Column("restored_by", sa.Uuid(), nullable=True))
    op.add_column("transactions", sa.Column("replayed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("transactions", sa.Column("replayed_by", sa.Uuid(), nullable=True))
    op.add_column("transactions", sa.Column("replayed_transaction_id", sa.Uuid(), nullable=True))
    op.add_column(
        "transactions",
        sa.Column("edit_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("transactions", sa.Column("last_modified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("transactions", sa.Column("last_modified_by", sa.Uuid(), nullable=True))
    op.add_column("transactions", sa.Column("last_edit_reason", sa.Text(), nullable=True))
    op.add_column("transactions", sa.Column("last_edit_before", sa.JSON(), nullable=True))

    op.create_index("ix_transactions_status", "transactions", ["status"])
    op.create_foreign_key("fk_transactions_voided_by_users", "transactions", "users", ["voided_by"], ["id"])
    op.create_foreign_key("fk_transactions_restored_by_users", "transactions", "users", ["restored_by"], ["id"])
    op.create_foreign_key("fk_transactions_replayed_by_users", "transactions", "users", ["replayed_by"], ["id"])
    op.create_foreign_key(
        "fk_transactions_replayed_transaction",
        "transactions",
        "transactions",
        ["replayed_transaction_id"],
        ["id"],
    )
    op.create_foreign_key("fk_transactions_last_modified_by_users", "transactions", "users", ["last_modified_by"], ["id"])
    op.create_check_constraint(
        "ck_transactions_status",
        "transactions",
        "status IN ('active','voided')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_transactions_status", "transactions", type_="check")
    op.drop_constraint("fk_transactions_last_modified_by_users", "transactions", type_="foreignkey")
    op.drop_constraint("fk_transactions_replayed_transaction", "transactions", type_="foreignkey")
    op.drop_constraint("fk_transactions_replayed_by_users", "transactions", type_="foreignkey")
    op.drop_constraint("fk_transactions_restored_by_users", "transactions", type_="foreignkey")
    op.drop_constraint("fk_transactions_voided_by_users", "transactions", type_="foreignkey")
    op.drop_index("ix_transactions_status", table_name="transactions")

    op.drop_column("transactions", "last_edit_before")
    op.drop_column("transactions", "last_edit_reason")
    op.drop_column("transactions", "last_modified_by")
    op.drop_column("transactions", "last_modified_at")
    op.drop_column("transactions", "edit_count")
    op.drop_column("transactions", "replayed_transaction_id")
    op.drop_column("transactions", "replayed_by")
    op.drop_column("transactions", "replayed_at")
    op.drop_column("transactions", "restored_by")
    op.drop_column("transactions", "restored_at")
    op.drop_column("transactions", "void_reason")
    op.drop_column("transactions", "voided_by")
    op.drop_column("transactions", "voided_at")
    op.drop_column("transactions", "status")