import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Numeric, Boolean, Uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CompanySettings(Base):
    __tablename__ = "company_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False, default="Valmere & Co")
    company_type: Mapped[str | None] = mapped_column(String(255))
    location: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    logo_url: Mapped[str | None] = mapped_column(String(512))
    primary_color: Mapped[str] = mapped_column(String(7), default="#1A3A5C")
    secondary_color: Mapped[str] = mapped_column(String(7), default="#C9A84C")
    # Politique de distribution des bénéfices/pertes :
    # `profit_share_company` va à la personne morale Valmere & Co,
    # `profit_share_investors` est réparti pro-rata entre les investisseurs
    # actifs (selon leur % VA dans le pool). Doivent sommer à 1.0.
    profit_share_company: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, default=0.80, server_default="0.80")
    profit_share_investors: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, default=0.20, server_default="0.20")
    # Quand activé, l'investisseur voit le taux de change figé au moment de
    # chaque transaction (transparence). Désactivé par défaut pour ne pas
    # surcharger l'écran du relevé.
    show_fx_rate_to_investors: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
