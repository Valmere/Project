import json
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.about_page import AboutPage
from app.models.user import User
from app.dependencies.auth import get_current_user, admin_only
from app.services.content_translation import (
    as_translations as content_as_translations,
    lang_code,
    localized as content_localized,
    store_translation as content_store_translation,
)

router = APIRouter(prefix="/api/about", tags=["about"])


class AboutUpdate(BaseModel):
    mission: str | None = None
    vision: str | None = None
    history: str | None = None
    services: str | None = None
    team: str | None = None
    contact_info: str | None = None


SUPPORTED_LANGS = {"fr", "en", "es"}
I18N_FIELDS = ("mission", "vision", "history", "services", "team", "contact_info")


def _lang(lang: str | None) -> str:
    return lang_code(lang)


def _as_translations(value: str | None) -> dict[str, str]:
    return content_as_translations(value)


def _localized(value: str | None, lang: str) -> str | None:
    return content_localized(value, lang)


def _store_translation(current: str | None, lang: str, value: str | None) -> str | None:
    return content_store_translation(current, lang, value)


def _serialize_about(about: AboutPage, lang: str) -> dict:
    data = {
        "id": str(about.id),
        "updated_at": about.updated_at.isoformat() if about.updated_at else None,
        "updated_by": str(about.updated_by) if about.updated_by else None,
    }
    for field in I18N_FIELDS:
        data[field] = _localized(getattr(about, field), lang) or ""
    return data


def _get_or_create(db: Session) -> AboutPage:
    about = db.query(AboutPage).first()
    if not about:
        about = AboutPage()
        db.add(about)
        db.commit()
        db.refresh(about)
    return about


@router.get("")
def get_about(
    lang: str | None = Query(default="fr"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lecture : tout utilisateur authentifié voit la page À propos."""
    return _serialize_about(_get_or_create(db), _lang(lang))


@router.put("")
def update_about(
    body: AboutUpdate,
    lang: str | None = Query(default="fr"),
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """Seul l'admin peut modifier le contenu."""
    about = _get_or_create(db)
    active_lang = _lang(lang)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(about, field, _store_translation(getattr(about, field), active_lang, value))
    about.updated_by = current_user.id
    db.commit()
    db.refresh(about)
    return _serialize_about(about, active_lang)
