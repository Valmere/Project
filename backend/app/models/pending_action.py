import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Uuid, ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class PendingAction(Base):
    """
    File d'attente des actions initiées par un caissier et nécessitant
    l'approbation d'un admin avant exécution (suppression d'investisseur,
    annulation/modification de transaction, création d'utilisateur…).

    Workflow :
      - caissier soumet  →  status = 'pending'
      - admin approuve   →  status = 'approved' puis dispatch ; si OK
                            → 'executed', sinon → 'failed' avec reviewer_notes
      - admin rejette    →  status = 'rejected'
    """

    __tablename__ = "pending_actions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")

    requested_by: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
