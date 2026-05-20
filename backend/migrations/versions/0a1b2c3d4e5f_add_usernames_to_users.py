"""add usernames to users

Revision ID: 0a1b2c3d4e5f
Revises: d0e1f2a3b4c5
Create Date: 2026-05-06 09:00:00.000000
"""

from __future__ import annotations

import re
import unicodedata

from alembic import op
import sqlalchemy as sa


revision = "0a1b2c3d4e5f"
down_revision = "d0e1f2a3b4c5"
branch_labels = None
depends_on = None


def _seed_username(email: str | None, full_name: str | None) -> str:
    raw = (email or "").split("@", 1)[0] or full_name or "user"
    normalized = unicodedata.normalize("NFKD", str(raw))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^a-zA-Z0-9._-]+", ".", ascii_text).strip("._-").lower()
    base = re.sub(r"[._-]{2,}", ".", base)[:32].strip("._-")
    if len(base) < 3:
        base = f"user{base}"[:32]
    return base or "user"


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(length=80), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, email, full_name FROM users")).mappings().all()
    used: set[str] = set()
    for row in rows:
        base = _seed_username(row.get("email"), row.get("full_name"))
        candidate = base
        suffix = 2
        while candidate in used:
            tail = f"-{suffix}"
            candidate = f"{base[:40 - len(tail)].rstrip('._-')}{tail}"
            suffix += 1
        used.add(candidate)
        bind.execute(
            sa.text("UPDATE users SET username = :username WHERE id = :id"),
            {"username": candidate, "id": row["id"]},
        )

    op.create_index("ix_users_username", "users", ["username"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_username", table_name="users")
    op.drop_column("users", "username")
