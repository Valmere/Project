"""rename role 'analyst' to 'cashier' and add pending_actions table

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-24 10:00:00.000000

Le rôle « analyste » devient « caissier » : un caissier peut initier des
actions sensibles (suppression d'investisseur, annulation/modification de
transaction, création d'utilisateur) mais celles-ci sont mises en file
d'attente dans `pending_actions` et doivent être validées par un admin.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Migration de données : analyst → cashier
    op.execute("UPDATE users SET role = 'cashier' WHERE role = 'analyst'")

    # 2) File d'attente des actions soumises par les caissiers
    op.create_table(
        "pending_actions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("action_type", sa.String(length=50), nullable=False),
        sa.Column("target_type", sa.String(length=50), nullable=True),
        sa.Column("target_id", sa.Uuid(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "requested_by",
            sa.Uuid(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "reviewed_by",
            sa.Uuid(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewer_notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected','executed','failed')",
            name="ck_pending_actions_status",
        ),
    )
    op.create_index(
        "ix_pending_actions_status", "pending_actions", ["status"]
    )
    op.create_index(
        "ix_pending_actions_requested_by",
        "pending_actions",
        ["requested_by"],
    )


def downgrade() -> None:
    op.drop_index("ix_pending_actions_requested_by", table_name="pending_actions")
    op.drop_index("ix_pending_actions_status", table_name="pending_actions")
    op.drop_table("pending_actions")
    op.execute("UPDATE users SET role = 'analyst' WHERE role = 'cashier'")
