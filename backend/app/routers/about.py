from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.about_page import AboutPage
from app.models.user import User
from app.dependencies.auth import get_current_user, admin_only

router = APIRouter(prefix="/api/about", tags=["about"])


class AboutUpdate(BaseModel):
    mission: str | None = None
    vision: str | None = None
    history: str | None = None
    services: str | None = None
    team: str | None = None
    contact_info: str | None = None


def _get_or_create(db: Session) -> AboutPage:
    about = db.query(AboutPage).first()
    if not about:
        about = AboutPage()
        db.add(about)
        db.commit()
        db.refresh(about)
    return about


@router.get("")
def get_about(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Lecture : tout utilisateur authentifié voit la page À propos."""
    return _get_or_create(db)


@router.put("")
def update_about(
    body: AboutUpdate,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """Seul l'admin peut modifier le contenu."""
    about = _get_or_create(db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(about, field, value)
    about.updated_by = current_user.id
    db.commit()
    db.refresh(about)
    return about
