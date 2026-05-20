import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Text, Uuid, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Investor(Base):
    __tablename__ = "investors"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="active")
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    investment_duration_months: Mapped[int | None]
    notes: Mapped[str | None] = mapped_column(Text)
    # Société (personne morale) qui reçoit la part « entreprise » des
    # distributions de bénéfices/pertes. Exactement UNE ligne avec
    # `is_company=True` doit exister (Valmere & Co), seed via migration.
    # Cette ligne est exclue du calcul `% pool investisseurs`.
    is_company: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))

    investments: Mapped[list["Investment"]] = relationship(back_populates="investor", cascade="all, delete-orphan")
    messages: Mapped[list["Message"]] = relationship(back_populates="investor", cascade="all, delete-orphan")
    reports: Mapped[list["Report"]] = relationship(back_populates="investor", cascade="all, delete-orphan")
