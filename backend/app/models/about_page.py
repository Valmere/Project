import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AboutPage(Base):
    """
    Singleton : une seule ligne dans cette table. Contient le contenu « À propos »
    de l'entreprise que l'admin peut éditer depuis l'interface. Affiché en lecture
    seule aux investisseurs.
    """
    __tablename__ = "about_page"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    mission: Mapped[str | None] = mapped_column(Text)
    vision: Mapped[str | None] = mapped_column(Text)
    history: Mapped[str | None] = mapped_column(Text)
    services: Mapped[str | None] = mapped_column(Text)
    team: Mapped[str | None] = mapped_column(Text)
    contact_info: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
