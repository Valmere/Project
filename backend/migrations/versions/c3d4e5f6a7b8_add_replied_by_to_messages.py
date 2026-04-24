"""add replied_by to messages

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-22 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("replied_by", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_messages_replied_by_users",
        "messages",
        "users",
        ["replied_by"],
        ["id"],
        use_alter=True,
    )


def downgrade() -> None:
    op.drop_constraint("fk_messages_replied_by_users", "messages", type_="foreignkey")
    op.drop_column("messages", "replied_by")
