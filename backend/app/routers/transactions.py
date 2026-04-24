import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.transaction import Transaction
from app.models.investment import Investment
from app.models.user import User
from app.models.currency_rate import CurrencyRate
from app.dependencies.auth import get_current_user, admin_or_analyst, admin_only
from app.services.roi_calculator import apply_transaction_to_value
from app.services.currency import convert_amount, MissingRateError

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

VALID_TYPES = {"deposit", "withdrawal", "gain", "loss", "fee"}


class TransactionCreate(BaseModel):
    investment_id: uuid.UUID
    type: str
    amount: float
    currency: str = "HTG"
    transaction_date: date
    description: str | None = None
    reference: str | None = None


@router.get("")
def list_transactions(
    investor_id: uuid.UUID | None = None,
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)
    if investor_id:
        q = q.filter(Transaction.investor_id == investor_id)
    return q.order_by(Transaction.transaction_date.desc()).all()


@router.get("/my")
def my_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.investor_id:
        return []
    return (
        db.query(Transaction)
        .filter(Transaction.investor_id == current_user.investor_id)
        .order_by(Transaction.transaction_date.desc())
        .all()
    )


@router.post("", status_code=201)
def create_transaction(
    body: TransactionCreate,
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    if body.type not in VALID_TYPES:
        raise HTTPException(400, f"Type invalide. Valeurs acceptées : {', '.join(VALID_TYPES)}")

    investment = db.query(Investment).filter(Investment.id == body.investment_id).first()
    if not investment:
        raise HTTPException(404, "Investissement introuvable")

    tx = Transaction(
        **body.model_dump(),
        investor_id=investment.investor_id,
        created_by=current_user.id,
    )
    db.add(tx)

    inv_currency = getattr(investment, "currency", None) or "HTG"
    try:
        # Cette conversion impacte directement `investment.current_value` —
        # on doit donc échouer bruyamment si le taux n'est pas configuré,
        # sinon la valeur actuelle serait faussée silencieusement.
        amount_in_inv_ccy = convert_amount(db, body.amount, body.currency, inv_currency)
    except MissingRateError as e:
        raise HTTPException(422, str(e))
    new_value = apply_transaction_to_value(float(investment.current_value), body.type, amount_in_inv_ccy)
    investment.current_value = new_value

    db.commit()
    db.refresh(tx)

    # Auto-posting vers la compta (partie double). Best-effort : si le plan
    # comptable n'est pas encore initialisé, on n'échoue pas la création de
    # la transaction — l'admin pourra rattraper via /accounting/backfill/transactions.
    try:
        from app.services.accounting_posting import ensure_posted_for_transaction, PostingError
        ensure_posted_for_transaction(db, tx, posted_by=current_user.id)
    except PostingError:
        # Plan comptable pas prêt : silencieux, sera rattrapé par backfill.
        db.rollback()
    return tx


@router.put("/{tx_id}/confirm")
def confirm_transaction(
    tx_id: uuid.UUID,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Transaction introuvable")
    tx.confirmed = True
    tx.confirmed_by = current_user.id
    tx.confirmed_at = datetime.now(timezone.utc)
    db.commit()
    return tx
