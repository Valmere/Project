import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, Text, Uuid, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


# Types comptables normalisés (catégories racines d'un plan comptable).
# Ordre classique: actif / passif / capitaux propres / produits / charges.
ACCOUNT_TYPES = ("asset", "liability", "equity", "revenue", "expense")

# Sens normal d'un compte = côté où il augmente.
# Actifs + Charges → débit | Passifs + Capitaux + Produits → crédit
NORMAL_BALANCE = {
    "asset":     "debit",
    "expense":   "debit",
    "liability": "credit",
    "equity":    "credit",
    "revenue":   "credit",
}


class Account(Base):
    """
    Plan comptable hiérarchique. Un compte peut avoir un parent (headers / sous-totaux)
    et des enfants. Seuls les comptes-feuilles (`is_postable=True`) peuvent recevoir
    des écritures.
    """
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # asset/liability/equity/revenue/expense
    parent_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("accounts.id"), nullable=True, index=True)
    currency: Mapped[str] = mapped_column(String(10), default="HTG")
    is_postable: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    parent: Mapped["Account | None"] = relationship("Account", remote_side="Account.id", backref="children")
    lines: Mapped[list["JournalLine"]] = relationship(back_populates="account")
