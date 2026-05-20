import uuid
from datetime import date, datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.performance import Performance
from app.models.investment import Investment
from app.models.investor import Investor
from app.models.transaction import Transaction
from app.models.user import User
from app.dependencies.auth import get_current_user, admin_or_cashier
from app.services.roi_calculator import compute_max_drawdown, compute_roi_from_pnl
from app.services.currency import RateCache
from app.services.portfolio_math import (
    CASH_FLOW_TYPES,
    TX_SIGNS,
    is_effective_pnl_tx,
    latest_bailout_key_by_investment,
    portfolio_totals_by_investor,
    transaction_business_amount,
)

router = APIRouter(prefix="/api/performances", tags=["performances"])

PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}


class CalculateRequest(BaseModel):
    investment_id: uuid.UUID
    period_type: str  # "7d" | "30d" | "90d" | "365d" | "custom"
    period_label: str | None = None
    period_start: date | None = None
    period_end: date | None = None


def _resolve_period(period_type: str, period_label: str | None, period_start, period_end):
    today = date.today()
    if period_type in PERIOD_DAYS:
        end = today
        start = today - timedelta(days=PERIOD_DAYS[period_type])
        label = period_label or f"{period_type}-{today.isoformat()}"
    elif period_type == "custom" and period_start and period_end:
        start, end = period_start, period_end
        label = period_label or f"custom-{start}-{end}"
    else:
        raise ValueError("Période invalide")
    return start, end, label


@router.get("")
def list_performances(
    investment_id: uuid.UUID | None = None,
    investor_id: uuid.UUID | None = None,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    q = db.query(Performance)
    if investment_id:
        q = q.filter(Performance.investment_id == investment_id)
    elif investor_id:
        q = q.join(Investment).filter(Investment.investor_id == investor_id)
    return q.order_by(Performance.period_end.desc()).all()


@router.get("/my")
def my_performances(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.investor_id:
        return []
    return (
        db.query(Performance)
        .join(Investment)
        .filter(Investment.investor_id == current_user.investor_id)
        .order_by(Performance.period_end.desc())
        .all()
    )


@router.post("/calculate")
def calculate_performance(
    body: CalculateRequest,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    investment = db.query(Investment).filter(Investment.id == body.investment_id).first()
    if not investment:
        raise HTTPException(404, "Investissement introuvable")

    try:
        period_start, period_end, period_label = _resolve_period(
            body.period_type, body.period_label, body.period_start, body.period_end
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    txs = (
        db.query(Transaction)
        .filter(
            Transaction.investment_id == body.investment_id,
            Transaction.status == "active",
            Transaction.transaction_date >= period_start,
            Transaction.transaction_date <= period_end,
        )
        .order_by(Transaction.transaction_date.asc())
        .all()
    )

    rates = RateCache(db)
    inv_ccy = (getattr(investment, "currency", None) or "HTG").upper()
    txs_before = (
        db.query(Transaction)
        .filter(
            Transaction.investment_id == body.investment_id,
            Transaction.status == "active",
            Transaction.transaction_date < period_start,
        )
        .order_by(Transaction.transaction_date.asc())
        .all()
    )
    txs_to_close = txs_before + txs
    owner = db.query(Investor).filter(Investor.id == investment.investor_id).first()
    company_ids = {investment.investor_id} if getattr(owner, "is_company", False) else None
    opening_totals = portfolio_totals_by_investor(
        [investment],
        txs_before,
        rates,
        inv_ccy,
        company_investor_ids=company_ids,
    )
    closing_totals = portfolio_totals_by_investor(
        [investment],
        txs_to_close,
        rates,
        inv_ccy,
        company_investor_ids=company_ids,
    )
    opening_value = opening_totals["current_by_investor"].get(investment.investor_id, 0.0)
    closing_value = closing_totals["current_by_investor"].get(investment.investor_id, 0.0)

    net_deposits = sum(
        TX_SIGNS.get(tx.type, 0) * transaction_business_amount(tx, rates, inv_ccy)
        if tx.type in CASH_FLOW_TYPES else 0
        for tx in txs
    )
    latest_bailouts = latest_bailout_key_by_investment(txs_to_close)
    gross_gain = sum(
        TX_SIGNS.get(tx.type, 0) * transaction_business_amount(tx, rates, inv_ccy)
        for tx in txs
        if is_effective_pnl_tx(tx, latest_bailouts)
    )
    fees = sum(transaction_business_amount(tx, rates, inv_ccy) for tx in txs if tx.type == "fee")

    roi = compute_roi_from_pnl(gross_gain, closing_value)
    value_series = [opening_value] + [closing_value]
    max_dd = compute_max_drawdown(value_series) if len(value_series) > 1 else 0.0

    existing = (
        db.query(Performance)
        .filter(
            Performance.investment_id == body.investment_id,
            Performance.period_type == body.period_type,
            Performance.period_label == period_label,
        )
        .first()
    )

    if existing:
        existing.period_start = period_start
        existing.period_end = period_end
        existing.opening_value = opening_value
        existing.closing_value = closing_value
        existing.net_deposits = net_deposits
        existing.gross_gain = gross_gain
        existing.fees = fees
        existing.roi_pct = roi
        existing.max_drawdown_pct = max_dd
        existing.calculated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing

    perf = Performance(
        investment_id=body.investment_id,
        investor_id=investment.investor_id,
        period_type=body.period_type,
        period_label=period_label,
        period_start=period_start,
        period_end=period_end,
        opening_value=opening_value,
        closing_value=closing_value,
        net_deposits=net_deposits,
        gross_gain=gross_gain,
        fees=fees,
        roi_pct=roi,
        max_drawdown_pct=max_dd,
        calculated_at=datetime.now(timezone.utc),
        calculated_by=current_user.id,
    )
    db.add(perf)
    db.commit()
    db.refresh(perf)
    return perf
