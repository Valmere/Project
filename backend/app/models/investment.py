import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Numeric, Text, Uuid, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Investment(Base):
    __tablename__ = "investments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    investor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("investors.id", ondelete="RESTRICT"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="Portefeuille Principal")
    currency: Mapped[str] = mapped_column(String(10), default="HTG")
    initial_capital: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    current_value: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))

    investor: Mapped["Investor"] = relationship(back_populates="investments")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="investment", cascade="all, delete-orphan")
    performances: Mapped[list["Performance"]] = relationship(back_populates="investment", cascade="all, delete-orphan")
