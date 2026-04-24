import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Numeric, Boolean, Text, Uuid, ForeignKey, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class JournalEntry(Base):
    """
    En-tête d'écriture comptable. Chaque écriture regroupe au moins 2 lignes
    dont la somme des débits doit égaler la somme des crédits.

    `source_type` / `source_id` permettent de lier l'écriture à sa pièce
    justificative (ex: source_type='transaction', source_id=<tx.id>), pour
    éviter les doublons quand une transaction Valmere est re-postée.
    """
    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reference: Mapped[str | None] = mapped_column(String(100), index=True)
    description: Mapped[str | None] = mapped_column(Text)

    # État : `draft` (modifiable) → `posted` (figé, n'apparaît que dans les états financiers)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    posted_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))

    # Lien vers la pièce justificative d'origine (transaction, dépôt, etc.)
    source_type: Mapped[str | None] = mapped_column(String(50), index=True)
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    lines: Mapped[list["JournalLine"]] = relationship(
        back_populates="entry",
        cascade="all, delete-orphan",
        order_by="JournalLine.line_number",
    )


class JournalLine(Base):
    """
    Ligne d'écriture. Une ligne a soit un débit, soit un crédit — jamais les deux.
    Les montants sont toujours stockés dans la devise de base (HTG) pour faciliter
    les états financiers, plus le montant original + le taux utilisé pour audit.
    """
    __tablename__ = "journal_lines"
    __table_args__ = (
        # Une ligne a soit un débit soit un crédit, pas les deux, pas zéro.
        CheckConstraint("(debit = 0 AND credit > 0) OR (debit > 0 AND credit = 0)",
                        name="ck_journal_line_debit_xor_credit"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    entry_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False, index=True)
    line_number: Mapped[int] = mapped_column(default=0)

    # Montants en devise de base (HTG). Contrainte: exactement un des deux > 0.
    debit: Mapped[float] = mapped_column(Numeric(18, 4), default=0, nullable=False)
    credit: Mapped[float] = mapped_column(Numeric(18, 4), default=0, nullable=False)

    # Trace de conversion (audit) — si l'opération d'origine était en CAD/USD/etc.
    original_currency: Mapped[str] = mapped_column(String(10), default="HTG")
    original_amount: Mapped[float | None] = mapped_column(Numeric(18, 4))
    fx_rate: Mapped[float | None] = mapped_column(Numeric(18, 8))

    # Tiers (investisseur) rattaché à la ligne — facultatif, utile pour les sous-comptes investisseurs.
    investor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("investors.id"), nullable=True, index=True)

    description: Mapped[str | None] = mapped_column(Text)

    entry: Mapped["JournalEntry"] = relationship(back_populates="lines")
    account: Mapped["Account"] = relationship(back_populates="lines")
