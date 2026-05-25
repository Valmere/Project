import uuid
from collections import defaultdict
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.investment import Investment
from app.models.investor import Investor
from app.models.transaction import Transaction
from app.models.user import User
from app.dependencies.auth import get_current_user, admin_or_cashier, admin_only
from app.services.portfolio_math import portfolio_totals_by_investor
from app.services.currency import RateCache

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


def _recalc_current_values(investments: list[Investment], db: Session) -> dict:
    """Retourne {investment.id: current_value recalculé depuis les transactions}."""
    if not investments:
        return {}
    inv_ids = {inv.id for inv in investments}
    txs = (
        db.query(Transaction)
        .filter(Transaction.investment_id.in_(inv_ids), Transaction.status == "active")
        .all()
    )
    rates = RateCache(db)
    by_currency: dict[str, list] = defaultdict(list)
    for inv in investments:
        by_currency[(getattr(inv, "currency", None) or "HTG").upper()].append(inv)
    recalc: dict = {}
    for ccy, group in by_currency.items():
        group_ids = {inv.id for inv in group}
        group_txs = [tx for tx in txs if tx.investment_id in group_ids]
        totals = portfolio_totals_by_investor(group, group_txs, rates, ccy)
        for inv in group:
            recalc[inv.id] = totals["current_by_investment"].get(inv.id, float(inv.current_value or 0))
    return recalc


def _serialize(inv: Investment, current_value: float) -> dict:
    return {
        "id": str(inv.id),
        "investor_id": str(inv.investor_id),
        "name": inv.name,
        "currency": inv.currency,
        "initial_capital": float(inv.initial_capital or 0),
        "current_value": round(current_value, 4),
        "start_date": inv.start_date.isoformat() if inv.start_date else None,
        "end_date": inv.end_date.isoformat() if inv.end_date else None,
        "status": inv.status,
        "notes": inv.notes,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "updated_at": inv.updated_at.isoformat() if inv.updated_at else None,
        "created_by": str(inv.created_by) if inv.created_by else None,
    }


@router.get("")
def list_investments(
    investor_id: uuid.UUID | None = None,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    q = db.query(Investment)
    if investor_id:
        q = q.filter(Investment.investor_id == investor_id)
    investments = q.order_by(Investment.created_at.desc()).all()
    recalc = _recalc_current_values(investments, db)
    return [_serialize(inv, recalc.get(inv.id, float(inv.current_value or 0))) for inv in investments]


@router.get("/my")
def my_investments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.investor_id:
        return []
    investments = (
        db.query(Investment)
        .filter(Investment.investor_id == current_user.investor_id)
        .order_by(Investment.created_at.desc())
        .all()
    )
    recalc = _recalc_current_values(investments, db)
    return [_serialize(inv, recalc.get(inv.id, float(inv.current_value or 0))) for inv in investments]


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
    recalc = _recalc_current_values([inv], db)
    return _serialize(inv, recalc.get(inv.id, float(inv.current_value or 0)))


@router.post("", status_code=201)
def create_investment(
    body: InvestmentCreate,
    current_user: User = Depends(admin_or_cashier),
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
    current_user: User = Depends(admin_or_cashier),
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
