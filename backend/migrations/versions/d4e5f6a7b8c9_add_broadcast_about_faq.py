"""add broadcast messages + about page + faq items

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-23 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Messages : direction + sender_admin_id ─────────────────────────────
    # 'in'  = investor → admin (default — sent by investor)
    # 'out' = admin → investor (broadcast from admin)
    op.add_column(
        "messages",
        sa.Column("direction", sa.String(length=10), nullable=False, server_default="in"),
    )
    op.add_column(
        "messages",
        sa.Column("sender_admin_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_messages_sender_admin_id_users",
        "messages",
        "users",
        ["sender_admin_id"],
        ["id"],
        use_alter=True,
    )

    # ── About page (singleton row, admin-editable content) ─────────────────
    op.create_table(
        "about_page",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("mission", sa.Text(), nullable=True),
        sa.Column("vision", sa.Text(), nullable=True),
        sa.Column("history", sa.Text(), nullable=True),
        sa.Column("services", sa.Text(), nullable=True),
        sa.Column("team", sa.Text(), nullable=True),
        sa.Column("contact_info", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
    )

    # ── FAQ items ──────────────────────────────────────────────────────────
    op.create_table(
        "faq_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("question", sa.String(length=500), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
    )
    op.create_index("ix_faq_items_sort_order", "faq_items", ["sort_order"])


def downgrade() -> None:
    op.drop_index("ix_faq_items_sort_order", table_name="faq_items")
    op.drop_table("faq_items")
    op.drop_table("about_page")
    op.drop_constraint("fk_messages_sender_admin_id_users", "messages", type_="foreignkey")
    op.drop_column("messages", "sender_admin_id")
    op.drop_column("messages", "direction")
