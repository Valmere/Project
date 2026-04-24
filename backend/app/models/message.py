import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Uuid, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # The investor side of the conversation (always the investor this thread is with).
    investor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("investors.id"), nullable=False, index=True)

    # Direction of the *initial* message on this record :
    #   "in"  → investor sent to admin (default, legacy behaviour)
    #   "out" → admin sent to investor (broadcast or direct)
    direction: Mapped[str] = mapped_column(String(10), nullable=False, default="in", server_default="in")
    # Admin user who sent the message when direction == "out".
    sender_admin_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))

    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))

    # Reply on this same record (one back-and-forth). For direction="in", reply_body
    # is the admin's response. For direction="out", reply_body is the investor's response.
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reply_body: Mapped[str | None] = mapped_column(Text)
    replied_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", use_alter=True))

    investor: Mapped["Investor"] = relationship(back_populates="messages")
