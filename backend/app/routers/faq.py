import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.faq_item import FaqItem
from app.models.user import User
from app.dependencies.auth import get_current_user, admin_only

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


@router.get("")
def list_faq(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Renvoie la FAQ triée par `sort_order`. L'admin voit tout ; les investisseurs
    ne voient que les entrées publiées (`is_published=True`).
    """
    q = db.query(FaqItem)
    if current_user.role not in ("admin", "analyst"):
        q = q.filter(FaqItem.is_published == True)
    return q.order_by(FaqItem.sort_order.asc(), FaqItem.created_at.asc()).all()


@router.post("", status_code=201)
def create_faq(
    body: FaqCreate,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    item = FaqItem(**body.model_dump(), updated_by=current_user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}")
def update_faq(
    item_id: uuid.UUID,
    body: FaqUpdate,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    item = db.query(FaqItem).filter(FaqItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Entrée FAQ introuvable")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    item.updated_by = current_user.id
    db.commit()
    db.refresh(item)
    return item


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
