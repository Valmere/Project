"""
Service d'approbation des actions sensibles.

Un caissier ne peut pas directement :
  - supprimer un investisseur
  - annuler / modifier une transaction
  - créer un utilisateur

Il soumet une demande ; l'admin la trouve dans `/api/approvals` et la
valide ou la refuse. Le dispatcher exécute alors l'action réelle.

Convention : pour chaque `action_type`, la fonction `_execute_*`
reçoit la session DB, la ligne PendingAction et l'admin qui approuve,
et effectue la même opération que le caissier aurait exécutée si elle
n'était pas gated.
"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.pending_action import PendingAction
from app.models.user import User
from app.models.investor import Investor
from app.models.transaction import Transaction
from app.models.investment import Investment
from app.services.currency import RateCache
from app.services.portfolio_math import (
    portfolio_totals_by_investor,
    transaction_business_amount_and_currency,
)


# ── Types d'actions supportés ─────────────────────────────────────────────────

ACTION_DELETE_INVESTOR = "delete_investor"
ACTION_VOID_TRANSACTION = "void_transaction"
ACTION_UPDATE_TRANSACTION = "update_transaction"
ACTION_RESTORE_TRANSACTION = "restore_transaction"
ACTION_REPLAY_TRANSACTION = "replay_transaction"
ACTION_CREATE_USER = "create_user"
ACTION_DISTRIBUTE_PNL = "distribute_pnl"

ALL_ACTIONS = {
    ACTION_DELETE_INVESTOR,
    ACTION_VOID_TRANSACTION,
    ACTION_UPDATE_TRANSACTION,
    ACTION_RESTORE_TRANSACTION,
    ACTION_REPLAY_TRANSACTION,
    ACTION_CREATE_USER,
    ACTION_DISTRIBUTE_PNL,
}


# ── Mise en file d'attente ────────────────────────────────────────────────────

def queue_action(
    db: Session,
    *,
    requested_by: User,
    action_type: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
    reason: str | None = None,
) -> PendingAction:
    if action_type not in ALL_ACTIONS:
        raise HTTPException(400, f"Type d'action inconnu : {action_type}")
    pa = PendingAction(
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        payload=payload,
        reason=reason,
        status="pending",
        requested_by=requested_by.id,
    )
    db.add(pa)
    db.commit()
    db.refresh(pa)
    return pa


# ── Exécution ──────────────────────────────────────────────────────────────────

def approve_and_execute(
    db: Session,
    pa: PendingAction,
    *,
    reviewer: User,
    notes: str | None = None,
) -> PendingAction:
    if pa.status != "pending":
        raise HTTPException(400, f"Action déjà traitée (statut : {pa.status})")

    pa.reviewed_by = reviewer.id
    pa.reviewed_at = datetime.now(timezone.utc)
    pa.reviewer_notes = notes
    pa.status = "approved"
    db.flush()

    try:
        _DISPATCH[pa.action_type](db, pa, reviewer)
        pa.status = "executed"
    except HTTPException:
        # Remonté tel quel — la transaction DB reste cohérente (rollback en
        # aval par FastAPI si on relance). On marque d'abord en failed.
        pa.status = "failed"
        db.commit()
        raise
    except Exception as e:  # pragma: no cover — filet de sécurité
        pa.status = "failed"
        pa.reviewer_notes = (notes or "") + f"\n[erreur] {e!s}"
        db.commit()
        raise HTTPException(500, f"Échec de l'exécution : {e}")

    db.commit()
    db.refresh(pa)
    return pa


def reject(
    db: Session,
    pa: PendingAction,
    *,
    reviewer: User,
    notes: str | None = None,
) -> PendingAction:
    if pa.status != "pending":
        raise HTTPException(400, f"Action déjà traitée (statut : {pa.status})")
    pa.reviewed_by = reviewer.id
    pa.reviewed_at = datetime.now(timezone.utc)
    pa.reviewer_notes = notes
    pa.status = "rejected"
    db.commit()
    db.refresh(pa)
    return pa


# ── Dispatchers ────────────────────────────────────────────────────────────────


def _transaction_status(tx: Transaction) -> str:
    return (getattr(tx, "status", None) or "active").lower()


def _recalculate_investment_current_value(db: Session, investment_id: uuid.UUID | None) -> None:
    if not investment_id:
        return
    investment = db.query(Investment).filter(Investment.id == investment_id).first()
    if not investment:
        return
    txs = (
        db.query(Transaction)
        .filter(Transaction.investment_id == investment.id, Transaction.status == "active")
        .all()
    )
    target = (getattr(investment, "currency", None) or "HTG").upper()
    investor = db.query(Investor).filter(Investor.id == investment.investor_id).first()
    totals = portfolio_totals_by_investor(
        [investment],
        txs,
        RateCache(db),
        target,
        company_investor_ids={investment.investor_id} if getattr(investor, "is_company", False) else None,
    )
    investment.current_value = round(
        totals["current_by_investment"].get(investment.id, 0.0),
        4,
    )


_BAILOUT_TARGET_RE = re.compile(
    r"(?:Nouvelle valeur|New current value|New value|Nuevo valor(?: actual)?)\s*:\s*"
    r"([-+]?\d[\d\s.,]*)\s*([A-Z]{3})?",
    re.IGNORECASE,
)


def _parse_amount_text(raw: str | None) -> float | None:
    if not raw:
        return None
    compact = re.sub(r"[\s\u00a0]", "", raw)
    if not compact:
        return None
    comma = compact.rfind(",")
    dot = compact.rfind(".")
    if comma >= 0 and dot >= 0:
        decimal_sep = "," if comma > dot else "."
        thousands_sep = "." if decimal_sep == "," else ","
        compact = compact.replace(thousands_sep, "").replace(decimal_sep, ".")
    elif comma >= 0:
        decimals = len(compact) - comma - 1
        compact = compact.replace(",", "." if decimals in (1, 2, 3, 4) else "")
    elif dot >= 0:
        decimals = len(compact) - dot - 1
        if decimals not in (1, 2, 3, 4):
            compact = compact.replace(".", "")
    try:
        return float(compact)
    except ValueError:
        return None


def _bailout_display_from_tx(tx: Transaction) -> tuple[float | None, str | None]:
    amount = getattr(tx, "display_amount", None)
    currency = getattr(tx, "display_currency", None)
    if amount is not None:
        return float(amount), (currency or tx.currency or "HTG").upper()
    match = _BAILOUT_TARGET_RE.search(tx.description or "")
    if not match:
        return None, None
    parsed = _parse_amount_text(match.group(1))
    if parsed is None:
        return None, None
    return parsed, (match.group(2) or tx.currency or "HTG").upper()


def _is_auto_bailout_description(value: str | None) -> bool:
    return bool(value and _BAILOUT_TARGET_RE.search(value))


def _format_bailout_description(amount: float, currency: str) -> str:
    return f"Renflouement : {amount:.2f} {currency.upper()}"


def _snapshot_transaction(tx: Transaction) -> dict[str, Any]:
    return {
        "type": tx.type,
        "amount": float(tx.amount or 0),
        "currency": tx.currency or "HTG",
        "display_amount": float(tx.display_amount) if tx.display_amount is not None else None,
        "display_currency": tx.display_currency,
        "transaction_date": tx.transaction_date.isoformat() if tx.transaction_date else None,
        "description": tx.description,
        "reference": tx.reference,
    }


def _apply_transaction_effect(db: Session, tx: Transaction, tx_type: str | None = None) -> None:
    from app.services.roi_calculator import apply_transaction_to_value
    from app.services.currency import convert_amount, MissingRateError

    investment = db.query(Investment).filter(Investment.id == tx.investment_id).first()
    if not investment:
        raise HTTPException(404, "Investissement introuvable")
    inv_ccy = getattr(investment, "currency", None) or "HTG"
    amount, currency = transaction_business_amount_and_currency(tx)
    try:
        amount_in_inv_ccy = convert_amount(db, amount, currency, inv_ccy)
    except MissingRateError as e:
        raise HTTPException(422, str(e))
    investment.current_value = apply_transaction_to_value(
        float(investment.current_value or 0), tx_type or tx.type, amount_in_inv_ccy
    )


def _reverse_transaction_effect(db: Session, tx: Transaction) -> None:
    inverse_type = {
        "deposit": "withdrawal",
        "withdrawal": "deposit",
        "gain": "loss",
        "loss": "gain",
        "fee": "deposit",
        "company_withdrawal": "deposit",
        "bailout": "withdrawal",
        "company_bailout": "company_withdrawal",
    }.get(tx.type)
    if inverse_type:
        _apply_transaction_effect(db, tx, inverse_type)


def _set_transaction_journal_status(
    db: Session,
    tx: Transaction,
    status: str,
    reviewer: User,
) -> None:
    from app.models.journal_entry import JournalEntry

    entries = (
        db.query(JournalEntry)
        .filter(JournalEntry.source_type == "transaction", JournalEntry.source_id == tx.id)
        .all()
    )
    for je in entries:
        je.status = status
        je.updated_at = datetime.now(timezone.utc)

    if status == "posted" and not entries:
        try:
            from app.services.accounting_posting import ensure_posted_for_transaction, PostingError
            ensure_posted_for_transaction(db, tx, posted_by=reviewer.id, commit=False)
        except PostingError:
            pass
def _execute_delete_investor(db: Session, pa: PendingAction, reviewer: User) -> None:
    inv = db.query(Investor).filter(Investor.id == pa.target_id).first()
    if not inv:
        raise HTTPException(404, "Investisseur introuvable")
    # Protection : la personne morale Valmere & Co est l'ancrage de la
    # mécanique de distribution P&L (80% société). La supprimer casserait
    # toute future distribution. Désactivez-la plutôt si vraiment besoin.
    if getattr(inv, "is_company", False):
        raise HTTPException(
            400,
            "Le compte société Valmere & Co ne peut pas être supprimé. "
            "Il est requis pour la distribution des bénéfices/pertes.",
        )
    # Supprime d'abord les dépendances (investments, transactions, reports, user lié)
    db.query(Transaction).filter(Transaction.investor_id == inv.id).delete(synchronize_session=False)
    db.query(Investment).filter(Investment.investor_id == inv.id).delete(synchronize_session=False)
    # User lié : on déconnecte plutôt que de supprimer (préserve l'audit).
    linked_users = db.query(User).filter(User.investor_id == inv.id).all()
    for u in linked_users:
        u.investor_id = None
        u.is_active = False
    db.delete(inv)


def _execute_void_transaction(db: Session, pa: PendingAction, reviewer: User) -> None:
    tx = db.query(Transaction).filter(Transaction.id == pa.target_id).first()
    if not tx:
        raise HTTPException(404, "Transaction introuvable")
    if _transaction_status(tx) == "voided":
        raise HTTPException(400, "Cette transaction est deja dans la poubelle.")

    _reverse_transaction_effect(db, tx)
    _set_transaction_journal_status(db, tx, "void", reviewer)

    tx.status = "voided"
    tx.voided_at = datetime.now(timezone.utc)
    tx.voided_by = reviewer.id
    tx.void_reason = pa.reason
    _recalculate_investment_current_value(db, tx.investment_id)

def _execute_update_transaction(db: Session, pa: PendingAction, reviewer: User) -> None:
    tx = db.query(Transaction).filter(Transaction.id == pa.target_id).first()
    if not tx:
        raise HTTPException(404, "Transaction introuvable")
    if _transaction_status(tx) == "voided":
        raise HTTPException(400, "Impossible de modifier une transaction supprimee. Restaurez-la d'abord.")

    payload = pa.payload or {}
    old_snapshot = _snapshot_transaction(tx)
    old_amount, old_currency = transaction_business_amount_and_currency(tx)
    old_type = tx.type
    old_display_amount, old_display_currency = _bailout_display_from_tx(tx)

    new_type = payload.get("type", tx.type)
    new_currency = (payload.get("currency", tx.currency or "HTG") or "HTG").upper()
    if "amount" in payload and payload["amount"] is not None:
        new_input_amount = float(payload["amount"])
    elif old_type == "bailout" and old_display_amount is not None:
        new_input_amount = old_display_amount
        new_currency = old_display_currency or new_currency
    else:
        new_input_amount = float(tx.amount)

    new_date = payload.get("transaction_date", tx.transaction_date)
    if isinstance(new_date, str):
        new_date = date.fromisoformat(new_date)
    new_description = payload.get("description", tx.description)
    new_reference = payload.get("reference", tx.reference)

    # Re-calcule investment.current_value : on retire l'impact de l'ancienne
    # transaction puis on applique la nouvelle. Pour un bailout investisseur,
    # le montant saisi devient la nouvelle valeur actuelle, tout en restant
    # le montant original pour la comptabilite.
    investment = db.query(Investment).filter(Investment.id == tx.investment_id).first()
    if investment:
        inv_ccy = getattr(investment, "currency", None) or "HTG"
        reverse_type = {
            "deposit": "withdrawal",
            "withdrawal": "deposit",
            "gain": "loss",
            "loss": "gain",
            "fee": "deposit",
            "company_withdrawal": "deposit",
            "bailout": "withdrawal",
            "company_bailout": "company_withdrawal",
        }.get(old_type)
        try:
            from app.services.roi_calculator import apply_transaction_to_value
            from app.services.currency import convert_amount, MissingRateError

            if reverse_type:
                old_in_inv = convert_amount(db, old_amount, old_currency, inv_ccy)
                investment.current_value = apply_transaction_to_value(
                    float(investment.current_value), reverse_type, old_in_inv
                )

            new_display_amount = None
            new_display_currency = None
            stored_amount = new_input_amount
            new_bailout_target_in_inv = None
            if new_type == "bailout":
                if new_input_amount <= 0:
                    raise HTTPException(400, "La nouvelle valeur apres renflouement doit etre strictement positive.")
                amount_in_inv = convert_amount(db, new_input_amount, new_currency, inv_ccy)
                new_bailout_target_in_inv = amount_in_inv
                stored_amount = round(new_input_amount, 4)
                new_display_amount = round(new_input_amount, 4)
                new_display_currency = new_currency
                if not new_description or _is_auto_bailout_description(new_description):
                    new_description = _format_bailout_description(new_input_amount, new_currency)

            tx.type = new_type
            tx.amount = stored_amount
            tx.currency = new_currency
            tx.display_amount = new_display_amount
            tx.display_currency = new_display_currency
            tx.transaction_date = new_date
            tx.description = new_description
            tx.reference = new_reference

            if new_type == "bailout" and new_bailout_target_in_inv is not None:
                investment.current_value = round(float(new_bailout_target_in_inv), 4)
            else:
                new_in_inv = convert_amount(db, float(tx.amount), tx.currency or "HTG", inv_ccy)
                investment.current_value = apply_transaction_to_value(
                    float(investment.current_value), tx.type, new_in_inv
                )
        except MissingRateError as e:
            raise HTTPException(422, str(e))
    else:
        tx.type = new_type
        tx.amount = new_input_amount
        tx.currency = new_currency
        tx.transaction_date = new_date
        tx.description = new_description
        tx.reference = new_reference

    tx.edit_count = int(tx.edit_count or 0) + 1
    tx.last_modified_at = datetime.now(timezone.utc)
    tx.last_modified_by = reviewer.id
    tx.last_edit_reason = pa.reason
    tx.last_edit_before = old_snapshot
    _recalculate_investment_current_value(db, tx.investment_id)


def _execute_restore_transaction(db: Session, pa: PendingAction, reviewer: User) -> None:
    tx = db.query(Transaction).filter(Transaction.id == pa.target_id).first()
    if not tx:
        raise HTTPException(404, "Transaction introuvable")
    if _transaction_status(tx) != "voided":
        raise HTTPException(400, "Cette transaction n'est pas dans la poubelle.")

    _apply_transaction_effect(db, tx)
    _set_transaction_journal_status(db, tx, "posted", reviewer)

    tx.status = "active"
    tx.restored_at = datetime.now(timezone.utc)
    tx.restored_by = reviewer.id
    _recalculate_investment_current_value(db, tx.investment_id)


def _execute_replay_transaction(db: Session, pa: PendingAction, reviewer: User) -> None:
    source = db.query(Transaction).filter(Transaction.id == pa.target_id).first()
    if not source:
        raise HTTPException(404, "Transaction introuvable")
    if _transaction_status(source) != "voided":
        raise HTTPException(400, "Seules les transactions dans la poubelle peuvent etre rejouees.")
    if getattr(source, "replayed_transaction_id", None):
        raise HTTPException(400, "Cette transaction a deja ete rejouee.")

    tx = Transaction(
        investment_id=source.investment_id,
        investor_id=source.investor_id,
        type=source.type,
        amount=source.amount,
        currency=source.currency,
        display_amount=source.display_amount,
        display_currency=source.display_currency,
        transaction_date=source.transaction_date,
        description=source.description,
        reference=source.reference,
        distribution_id=source.distribution_id,
        created_by=reviewer.id,
        status="active",
    )
    db.add(tx)
    db.flush()

    _apply_transaction_effect(db, tx)
    _set_transaction_journal_status(db, tx, "posted", reviewer)

    source.replayed_at = datetime.now(timezone.utc)
    source.replayed_by = reviewer.id
    source.replayed_transaction_id = tx.id
    _recalculate_investment_current_value(db, tx.investment_id)

def _execute_create_user(db: Session, pa: PendingAction, reviewer: User) -> None:
    from app.services.auth_service import hash_password
    from app.routers.users import VALID_ROLES
    from app.services.user_identity import make_unique_username

    payload = pa.payload or {}
    email = (payload.get("email") or "").strip().lower()
    username = payload.get("username")
    password = payload.get("password")
    full_name = payload.get("full_name")
    role = payload.get("role", "investor")
    investor_id = payload.get("investor_id")

    if not email or not password or not full_name:
        raise HTTPException(400, "Données du compte incomplètes")
    if role not in VALID_ROLES:
        raise HTTPException(400, f"Rôle invalide : {role}")
    if len(password) < 8:
        raise HTTPException(400, "Mot de passe trop court")
    if db.query(User).filter(func.lower(func.trim(User.email)) == email).first():
        raise HTTPException(409, "Un compte avec cet email existe déjà")

    user = User(
        email=email,
        username=make_unique_username(db, username, email, full_name),
        hashed_password=hash_password(password),
        full_name=full_name,
        role=role,
        investor_id=uuid.UUID(investor_id) if investor_id else None,
    )
    db.add(user)


def _execute_distribute_pnl(db: Session, pa: PendingAction, reviewer: User) -> None:
    """
    Distribution P&L approuvée : on rejoue l'opération avec les paramètres
    soumis par le caissier. La logique métier (split société/investisseurs,
    pro-rata) vit dans `distribution_service.execute_distribution`.
    """
    from app.services import distribution_service

    payload = pa.payload or {}
    amount = payload.get("amount")
    currency = payload.get("currency") or "HTG"
    kind = payload.get("kind")
    tx_date_raw = payload.get("transaction_date")
    notes = payload.get("notes")

    if amount is None or kind not in ("gain", "loss") or not tx_date_raw:
        raise HTTPException(400, "Données de distribution incomplètes")

    tx_date = (
        date.fromisoformat(tx_date_raw) if isinstance(tx_date_raw, str) else tx_date_raw
    )
    distribution_service.execute_distribution(
        db,
        amount=float(amount),
        currency=currency,
        kind=kind,
        transaction_date=tx_date,
        notes=notes,
        created_by=reviewer,
    )


_DISPATCH = {
    ACTION_DELETE_INVESTOR: _execute_delete_investor,
    ACTION_VOID_TRANSACTION: _execute_void_transaction,
    ACTION_UPDATE_TRANSACTION: _execute_update_transaction,
    ACTION_RESTORE_TRANSACTION: _execute_restore_transaction,
    ACTION_REPLAY_TRANSACTION: _execute_replay_transaction,
    ACTION_CREATE_USER: _execute_create_user,
    ACTION_DISTRIBUTE_PNL: _execute_distribute_pnl,
}
