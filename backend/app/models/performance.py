import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Numeric, Uuid, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Performance(Base):
    __tablename__ = "performances"
    __table_args__ = (UniqueConstraint("investment_id", "period_type", "period_label"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    investment_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("investments.id", ondelete="RESTRICT"), nullable=False, index=True)
    investor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("investors.id"), nullable=False, index=True)
    period_type: Mapped[str] = mapped_column(String(10), nullable=False)
    period_label: Mapped[str] = mapped_column(String(20), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    opening_value: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    closing_value: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    net_deposits: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    gross_gain: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    fees: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    roi_pct: Mapped[float | None] = mapped_column(Numeric(10, 6))
    max_drawdown_pct: Mapped[float | None] = mapped_column(Numeric(10, 6))
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    calculated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))

    investment: Mapped["Investment"] = relationship(back_populates="performances")
