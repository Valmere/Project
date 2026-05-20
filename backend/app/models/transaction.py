import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Numeric, Boolean, Text, Uuid, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    investment_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("investments.id", ondelete="RESTRICT"), nullable=False, index=True)
    investor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("investors.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="HTG")
    display_amount: Mapped[float | None] = mapped_column(Numeric(18, 4))
    display_currency: Mapped[str | None] = mapped_column(String(10))
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    reference: Mapped[str | None] = mapped_column(String(100))
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Identifiant de groupe quand cette transaction fait partie d'une
    # distribution P&L (1 ligne société + N lignes investisseurs créées
    # ensemble dans la même opération atomique). NULL pour les transactions
    # individuelles (deposit / withdrawal manuels, etc.).
    distribution_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))
    void_reason: Mapped[str | None] = mapped_column(Text)
    restored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    restored_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))
    replayed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replayed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))
    replayed_transaction_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("transactions.id", use_alter=True))
    edit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_modified_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))
    last_edit_reason: Mapped[str | None] = mapped_column(Text)
    last_edit_before: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))

    investment: Mapped["Investment"] = relationship(back_populates="transactions")
