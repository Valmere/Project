import uuid
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.faq_item import FaqItem
from app.models.user import User
from app.dependencies.auth import get_current_user, admin_only
from app.services.content_translation import (
    as_translations as content_as_translations,
    lang_code,
    localized as content_localized,
    store_translation as content_store_translation,
)

router = APIRouter(prefix="/api/faq", tags=["faq"])


class FaqCreate(BaseModel):
    question: str
    answer: str
    category: str | None = None
    sort_order: int = 0
    is_published: bool = True


class FaqUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None
    category: str | None = None
    sort_order: int | None = None
    is_published: bool | None = None


SUPPORTED_LANGS = {"fr", "en", "es"}


def _lang(lang: str | None) -> str:
    return lang_code(lang)


def _as_translations(value: str | None) -> dict[str, str]:
    return content_as_translations(value)


def _localized(value: str | None, lang: str) -> str | None:
    return content_localized(value, lang)


def _store_translation(current: str | None, lang: str, value: str | None) -> str | None:
    if value is None:
        return None
    return content_store_translation(current, lang, value) or ""


def _serialize_item(item: FaqItem, lang: str) -> dict:
    return {
        "id": str(item.id),
        "question": _localized(item.question, lang) or "",
        "answer": _localized(item.answer, lang) or "",
        "category": _localized(item.category, lang) if item.category else None,
        "sort_order": item.sort_order,
        "is_published": item.is_published,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        "updated_by": str(item.updated_by) if item.updated_by else None,
    }


@router.get("")
def list_faq(
    lang: str | None = Query(default="fr"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Renvoie la FAQ triée par `sort_order`. L'admin voit tout ; les investisseurs
    ne voient que les entrées publiées (`is_published=True`).
    """
    q = db.query(FaqItem)
    if current_user.role not in ("admin", "cashier"):
        q = q.filter(FaqItem.is_published == True)
    active_lang = _lang(lang)
    return [
        _serialize_item(item, active_lang)
        for item in q.order_by(FaqItem.sort_order.asc(), FaqItem.created_at.asc()).all()
    ]


@router.post("", status_code=201)
def create_faq(
    body: FaqCreate,
    lang: str | None = Query(default="fr"),
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    active_lang = _lang(lang)
    item = FaqItem(
        question=_store_translation(None, active_lang, body.question) or "",
        answer=_store_translation(None, active_lang, body.answer) or "",
        category=_store_translation(None, active_lang, body.category) if body.category is not None else None,
        sort_order=body.sort_order,
        is_published=body.is_published,
        updated_by=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_item(item, active_lang)


@router.put("/{item_id}")
def update_faq(
    item_id: uuid.UUID,
    body: FaqUpdate,
    lang: str | None = Query(default="fr"),
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    item = db.query(FaqItem).filter(FaqItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Entrée FAQ introuvable")
    active_lang = _lang(lang)
    for field, value in body.model_dump(exclude_unset=True).items():
        if field in {"question", "answer", "category"}:
            setattr(item, field, _store_translation(getattr(item, field), active_lang, value))
        else:
            setattr(item, field, value)
    item.updated_by = current_user.id
    db.commit()
    db.refresh(item)
    return _serialize_item(item, active_lang)


@router.delete("/{item_id}", status_code=204)
def delete_faq(
    item_id: uuid.UUID,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    item = db.query(FaqItem).filter(FaqItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Entrée FAQ introuvable")
    db.delete(item)
    db.commit()
    return None
