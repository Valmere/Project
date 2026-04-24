import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.investment import Investment
from app.models.investor import Investor
from app.models.user import User
from app.dependencies.auth import get_current_user, admin_or_analyst, admin_only

router = APIRouter(prefix="/api/investments", tags=["investments"])


class InvestmentCreate(BaseModel):
    investor_id: uuid.UUID
    name: str = "Portefeuille Principal"
    currency: str = "HTG"
    initial_capital: float
    start_date: date
    end_date: date | None = None
    notes: str | None = None


class InvestmentUpdate(BaseModel):
    name: str | None = None
    current_value: float | None = None
    end_date: date | None = None
    status: str | None = None
    notes: str | None = None


@router.get("")
def list_investments(
    investor_id: uuid.UUID | None = None,
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    q = db.query(Investment)
    if investor_id:
        q = q.filter(Investment.investor_id == investor_id)
    return q.order_by(Investment.created_at.desc()).all()


@router.get("/my")
def my_investments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.investor_id:
        return []
    return (
        db.query(Investment)
        .filter(Investment.investor_id == current_user.investor_id)
        .order_by(Investment.created_at.desc())
        .all()
    )


@router.get("/{inv_id}")
def get_investment(
    inv_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inv = db.query(Investment).filter(Investment.id == inv_id).first()
    if not inv:
        raise HTTPException(404, "Investissement introuvable")
    if current_user.role == "investor" and str(inv.investor_id) != str(current_user.investor_id):
        raise HTTPException(403, "Accès refusé")
    return inv


@router.post("", status_code=201)
def create_investment(
    body: InvestmentCreate,
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    investor = db.query(Investor).filter(Investor.id == body.investor_id).first()
    if not investor:
        raise HTTPException(404, "Investisseur introuvable")
    inv = Investment(**body.model_dump(), current_value=body.initial_capital, created_by=current_user.id)
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


@router.put("/{inv_id}")
def update_investment(
    inv_id: uuid.UUID,
    body: InvestmentUpdate,
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    inv = db.query(Investment).filter(Investment.id == inv_id).first()
    if not inv:
        raise HTTPException(404, "Investissement introuvable")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(inv, field, val)
    inv.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(inv)
    return inv


@router.delete("/{inv_id}", status_code=204)
def delete_investment(
    inv_id: uuid.UUID,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    inv = db.query(Investment).filter(Investment.id == inv_id).first()
    if not inv:
        raise HTTPException(404, "Investissement introuvable")
    db.delete(inv)
    db.commit()
