import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Integer, Text, Uuid, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    investor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("investors.id"), nullable=False, index=True)
    investment_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("investments.id", use_alter=True))
    report_type: Mapped[str] = mapped_column(String(30), nullable=False, default="statement")
    format: Mapped[str] = mapped_column(String(10), nullable=False, default="pdf")
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    storage_path: Mapped[str | None] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error_message: Mapped[str | None] = mapped_column(Text)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    generated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    available_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signature_name: Mapped[str | None] = mapped_column(String(255))
    download_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    investor: Mapped["Investor"] = relationship(back_populates="reports")
