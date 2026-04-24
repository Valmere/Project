import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Uuid, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class FaqItem(Base):
    """
    Questions fréquentes gérées par l'admin, visibles par les investisseurs.
    Tri via `sort_order`, masquable via `is_published`.
    """
    __tablename__ = "faq_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    question: Mapped[str] = mapped_column(String(500), nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0", index=True)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
