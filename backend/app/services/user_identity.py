import re
import secrets
import string
import unicodedata
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.user import User


USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,40}$")


def normalize_username(value: str | None) -> str | None:
    if value is None:
        return None
    username = value.strip().lower()
    if not username:
        return None
    if not USERNAME_RE.fullmatch(username):
        raise ValueError(
            "L'identifiant doit contenir 3 a 40 caracteres : lettres, chiffres, point, tiret ou underscore."
        )
    return username


def username_seed(*candidates: str | None) -> str:
    raw = next((c for c in candidates if c and str(c).strip()), "user")
    if "@" in raw:
        raw = raw.split("@", 1)[0]
    normalized = unicodedata.normalize("NFKD", str(raw))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^a-zA-Z0-9._-]+", ".", ascii_text).strip("._-").lower()
    base = re.sub(r"[._-]{2,}", ".", base)[:32].strip("._-")
    if len(base) < 3:
        base = f"user{base}"[:32]
    return base or "user"


def make_unique_username(
    db: Session,
    desired: str | None,
    *fallbacks: str | None,
    exclude_user_id: uuid.UUID | None = None,
) -> str:
    base = normalize_username(desired) if desired else username_seed(*fallbacks)
    if len(base) > 40:
        base = base[:40].rstrip("._-") or "user"

    candidate = base
    suffix = 2
    while True:
        query = db.query(User).filter(func.lower(User.username) == candidate.lower())
        if exclude_user_id is not None:
            query = query.filter(User.id != exclude_user_id)
        if not query.first():
            return candidate

        tail = f"-{suffix}"
        candidate = f"{base[:40 - len(tail)].rstrip('._-')}{tail}"
        suffix += 1


def generate_temp_password(length: int = 10) -> str:
    alphabet = "".join(
        c for c in (string.ascii_letters + string.digits) if c not in "Oo0lI1"
    )
    return "".join(secrets.choice(alphabet) for _ in range(length))
