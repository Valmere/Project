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
from app.dependencies.auth import get_current_user, admin_or_cashier, admin_only
from app.services.roi_calculator import apply_transaction_to_value
from app.services.currency import RateCache, convert_amount, MissingRateError
from app.services.portfolio_math import portfolio_totals_by_investor
from app.services import approvals_service

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

# Types de transactions acceptés par l'API.
#   - deposit / withdrawal : flux de cash investisseur
#   - gain / loss          : créés UNIQUEMENT par la mécanique de distribution
#                            P&L (POST /distribute). On les garde dans l'enum
#                            pour que les écritures historiques restent
#                            modifiables, mais le formulaire UI ne les propose
#                            plus pour la création manuelle.
#   - fee                  : frais (saisie manuelle possible)
#   - company_withdrawal   : prélèvement sur le compte société Valmere & Co.
#                            Diminue son solde, refusé si solde insuffisant,
#                            n'a aucun impact sur les investisseurs.
#   - bailout              : reset de valeur actuelle. L'input représente la
#                            NOUVELLE valeur actuelle visée (pas le montant
#                            ajouté). Le backend calcule le delta = target -
#                            current pour l'audit, mais les calculs repartent
#                            toujours du dernier reset. Obligatoire pour les
#                            investisseurs dont la VA est négative; utilisable
#                            aussi pour Valmere & Co.
#   - company_bailout      : renflouement SOCIÉTÉ. L'input est un montant
#                            qui AUGMENTE le solde de Valmere & Co. Aucune
#                            validation de solde suffisant n'est nécessaire :
#                            l'opération crédite le compte société.
#                            Refusé pour les investisseurs.
VALID_TYPES = {"deposit", "withdrawal", "gain", "loss", "fee", "company_withdrawal", "bailout", "company_bailout"}


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
    include_voided: bool = False,
    deleted_only: bool = False,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)
    if investor_id:
        q = q.filter(Transaction.investor_id == investor_id)
    if deleted_only:
        q = q.filter(Transaction.status == "voided")
    elif not include_voided:
        q = q.filter(Transaction.status == "active")
    return q.order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc()).all()


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
        .order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc())
        .all()
    )


@router.get("/trash")
def transaction_trash(
    investor_id: uuid.UUID | None = None,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction).filter(Transaction.status == "voided")
    if investor_id:
        q = q.filter(Transaction.investor_id == investor_id)
    return q.order_by(Transaction.voided_at.desc().nullslast(), Transaction.transaction_date.desc()).all()

@router.post("", status_code=201)
def create_transaction(
    body: TransactionCreate,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    if body.type not in VALID_TYPES:
        raise HTTPException(400, f"Type invalide. Valeurs acceptées : {', '.join(VALID_TYPES)}")

    # On bloque les créations manuelles de gain/loss : ces lignes ne peuvent
    # naître que via la mécanique de distribution P&L (POST /distribute), qui
    # garantit que la part société + parts pro-rata investisseurs sont créées
    # ensemble dans la même transaction DB. Les laisser créables ici casserait
    # l'invariant 80/20.
    if body.type in ("gain", "loss"):
        raise HTTPException(
            400,
            "Les bénéfices et pertes ne se saisissent pas manuellement — "
            "utilisez la fonction « Distribuer un P&L » qui répartit "
            "automatiquement entre la société et les investisseurs.",
        )

    investment = db.query(Investment).filter(Investment.id == body.investment_id).first()
    if not investment:
        raise HTTPException(404, "Investissement introuvable")

    from app.models.investor import Investor
    target_investor = db.query(Investor).filter(Investor.id == investment.investor_id).first()
    is_company = bool(target_investor and target_investor.is_company)
    inv_currency = getattr(investment, "currency", None) or "HTG"
    current_balance = float(investment.current_value or 0)
    display_amount = None
    display_currency = None
    bailout_target_in_inv = None

    # ─── Verrou « VA négative » sur les comptes investisseurs ─────────
    # Quand un investisseur a une valeur actuelle négative (suite à une
    # perte distribuée plus grande que son apport), aucune transaction
    # classique ne peut passer tant qu'un renflouement n'a pas remis le
    # compte à flot. Empêche les dépôts post-perte de masquer visuellement
    # la perte sur la valeur actuelle.
    if not is_company and current_balance < 0 and body.type != "bailout":
        raise HTTPException(
            400,
            "Cet investisseur a une valeur actuelle négative. "
            "Vous devez d'abord renflouer son compte avec une transaction "
            "de type « Renflouement » avant d'enregistrer toute autre opération.",
        )

    # Type spécial « Prélèvement » : strictement réservé au compte société
    # Valmere & Co. On valide que la cible est bien la société, et que son
    # solde courant couvre le montant demandé (pas de découvert autorisé).
    if body.type == "company_withdrawal":
        if not is_company:
            raise HTTPException(
                400,
                "Le prélèvement n'est autorisé que sur le compte société Valmere & Co.",
            )
        try:
            amt_in_inv = convert_amount(db, body.amount, body.currency, inv_currency)
        except MissingRateError as e:
            raise HTTPException(422, str(e))
        if current_balance < amt_in_inv:
            raise HTTPException(
                400,
                f"Solde société insuffisant. Disponible : {current_balance:.2f} {inv_currency}, "
                f"demandé : {amt_in_inv:.2f} {inv_currency}.",
            )

    # ─── Reset de valeur actuelle (bailout) ───────────────────────────
    # L'utilisateur saisit la NOUVELLE valeur actuelle souhaitée (le target).
    # Le backend calcule en interne le delta à ajouter pour atteindre cette
    # cible et le stocke comme `amount`. Ainsi la somme des transactions
    # reste égale à la valeur actuelle, et l'historique reste cohérent.
    if body.type == "bailout":
        if body.amount is None or body.amount <= 0:
            raise HTTPException(400, "La nouvelle valeur après renflouement doit être strictement positive.")
        try:
            amount_in_inv = convert_amount(db, body.amount, body.currency, inv_currency)
            target_in_inv = amount_in_inv
            bailout_target_in_inv = target_in_inv
        except MissingRateError as e:
            raise HTTPException(422, str(e))
        display_amount = round(float(body.amount), 4)
        display_currency = (body.currency or inv_currency).upper()
        delta_in_inv = target_in_inv - current_balance
        if delta_in_inv <= 0 and not is_company:
            raise HTTPException(
                400,
                f"La cible saisie ({body.amount:.2f} {body.currency}) est inférieure ou égale "
                f"à la valeur actuelle ({current_balance:.2f} {inv_currency}). "
                "Un renflouement doit augmenter la valeur du compte. " \
                "Veuillez faire un dépot à la place si vous souhaitez ajouter des fonds sur ce compte.",
            )
        # On stocke le delta exprimé dans la devise de saisie. Quand on
        # convertit ensuite delta → investment.currency pour l'appliquer,
        # on retombe sur le delta_in_inv (modulo la précision float).
        try:
            delta_in_body_ccy = convert_amount(db, delta_in_inv, inv_currency, body.currency)
        except MissingRateError as e:
            raise HTTPException(422, str(e))
        body = body.model_copy(update={
            "amount": round(delta_in_body_ccy, 4),
            "description": (
                body.description
                or f"Reset bailout : {body.amount:.2f} {body.currency.upper()}"
            ),
        })

    # ─── Renflouement SOCIÉTÉ (company_bailout) ───────────────────────
    # L'input est un MONTANT qui sera ADDITIONNÉ au solde Valmere & Co.
    # Contrairement à un prélèvement, il ne dépend pas du solde disponible :
    # l'opération crédite le compte société.
    if body.type == "company_bailout":
        if not is_company:
            raise HTTPException(
                400,
                "Le renflouement société est réservé au compte Valmere & Co. "
                "Pour un investisseur, utilisez « Renflouement » qui ajoute un montant au compte.",
            )
        if body.amount is None or body.amount <= 0:
            raise HTTPException(400, "Le montant doit être strictement positif.")


    tx = Transaction(
        **body.model_dump(),
        investor_id=investment.investor_id,
        created_by=current_user.id,
        display_amount=display_amount,
        display_currency=display_currency,
    )
    db.add(tx)

    try:
        # Cette conversion impacte directement `investment.current_value` —
        # on doit donc échouer bruyamment si le taux n'est pas configuré,
        # sinon la valeur actuelle serait faussée silencieusement.
        amount_in_inv_ccy = convert_amount(db, body.amount, body.currency, inv_currency)
    except MissingRateError as e:
        raise HTTPException(422, str(e))
    if body.type == "bailout" and bailout_target_in_inv is not None:
        investment.current_value = round(float(bailout_target_in_inv), 4)
    else:
        new_value = apply_transaction_to_value(float(investment.current_value), body.type, amount_in_inv_ccy)
        investment.current_value = new_value

    # Source de verite finale : capital investi + P&L depuis les transactions
    # actives, avec le capital initial compte une seule fois.
    db.flush()
    active_txs = (
        db.query(Transaction)
        .filter(Transaction.investment_id == investment.id, Transaction.status == "active")
        .all()
    )
    totals = portfolio_totals_by_investor(
        [investment],
        active_txs,
        RateCache(db),
        (getattr(investment, "currency", None) or "HTG").upper(),
        company_investor_ids={investment.investor_id} if is_company else None,
    )
    investment.current_value = round(
        totals["current_by_investment"].get(investment.id, 0.0),
        4,
    )

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
    if (getattr(tx, "status", None) or "active") == "voided":
        raise HTTPException(400, "Impossible de confirmer une transaction supprimee.")
    tx.confirmed = True
    tx.confirmed_by = current_user.id
    tx.confirmed_at = datetime.now(timezone.utc)
    db.commit()
    return tx


class TransactionUpdateRequest(BaseModel):
    type: str | None = None
    amount: float | None = None
    currency: str | None = None
    transaction_date: date | None = None
    description: str | None = None
    reference: str | None = None
    reason: str | None = None  # motif de la modification


class TransactionVoidRequest(BaseModel):
    reason: str | None = None


@router.post("/{tx_id}/restore")
def restore_transaction(
    tx_id: uuid.UUID,
    body: TransactionVoidRequest | None = None,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Transaction introuvable")
    if (getattr(tx, "status", None) or "active") != "voided":
        raise HTTPException(400, "Cette transaction n'est pas dans la poubelle.")

    reason = body.reason if body else None
    if current_user.role == "admin":
        from app.models.pending_action import PendingAction as _PA
        fake = _PA(
            action_type=approvals_service.ACTION_RESTORE_TRANSACTION,
            target_type="transaction",
            target_id=tx_id,
            reason=reason,
            requested_by=current_user.id,
            status="executed",
        )
        approvals_service._execute_restore_transaction(db, fake, current_user)  # type: ignore[attr-defined]
        db.commit()
        db.refresh(tx)
        return {"restored": True, "transaction_id": str(tx_id)}

    pa = approvals_service.queue_action(
        db,
        requested_by=current_user,
        action_type=approvals_service.ACTION_RESTORE_TRANSACTION,
        target_type="transaction",
        target_id=tx_id,
        reason=reason,
    )
    return {
        "queued": True,
        "pending_action_id": str(pa.id),
        "message": "Demande de restauration envoyee a l'administrateur.",
    }


@router.post("/{tx_id}/replay")
def replay_transaction(
    tx_id: uuid.UUID,
    body: TransactionVoidRequest | None = None,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Transaction introuvable")
    if (getattr(tx, "status", None) or "active") != "voided":
        raise HTTPException(400, "Seules les transactions dans la poubelle peuvent etre rejouees.")

    reason = body.reason if body else None
    if current_user.role == "admin":
        from app.models.pending_action import PendingAction as _PA
        fake = _PA(
            action_type=approvals_service.ACTION_REPLAY_TRANSACTION,
            target_type="transaction",
            target_id=tx_id,
            reason=reason,
            requested_by=current_user.id,
            status="executed",
        )
        approvals_service._execute_replay_transaction(db, fake, current_user)  # type: ignore[attr-defined]
        db.commit()
        db.refresh(tx)
        return {
            "replayed": True,
            "source_transaction_id": str(tx_id),
            "new_transaction_id": str(tx.replayed_transaction_id) if tx.replayed_transaction_id else None,
        }

    pa = approvals_service.queue_action(
        db,
        requested_by=current_user,
        action_type=approvals_service.ACTION_REPLAY_TRANSACTION,
        target_type="transaction",
        target_id=tx_id,
        reason=reason,
    )
    return {
        "queued": True,
        "pending_action_id": str(pa.id),
        "message": "Demande de rejeu envoyee a l'administrateur.",
    }

@router.post("/{tx_id}/void")
def void_transaction(
    tx_id: uuid.UUID,
    body: TransactionVoidRequest | None = None,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    """
    Annule (supprime) une transaction et reverse son impact sur la valeur
    actuelle de l'investissement + void l'écriture comptable liée.
    Admin : exécution immédiate. Caissier : mise en file d'attente.
    """
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Transaction introuvable")
    if (getattr(tx, "status", None) or "active") == "voided":
        raise HTTPException(400, "Cette transaction est deja dans la poubelle.")

    reason = body.reason if body else None

    if current_user.role == "admin":
        from app.models.pending_action import PendingAction as _PA
        fake = _PA(
            action_type="void_transaction",
            target_type="transaction",
            target_id=tx_id,
            reason=reason,
            requested_by=current_user.id,
            status="executed",
        )
        approvals_service._execute_void_transaction(db, fake, current_user)  # type: ignore[attr-defined]
        db.commit()
        return {"voided": True, "transaction_id": str(tx_id)}

    pa = approvals_service.queue_action(
        db,
        requested_by=current_user,
        action_type=approvals_service.ACTION_VOID_TRANSACTION,
        target_type="transaction",
        target_id=tx_id,
        reason=reason,
    )
    return {
        "queued": True,
        "pending_action_id": str(pa.id),
        "message": "Demande d'annulation envoyée à l'administrateur.",
    }


@router.put("/{tx_id}")
def update_transaction(
    tx_id: uuid.UUID,
    body: TransactionUpdateRequest,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    """
    Modifie une transaction. Admin : exécution immédiate. Caissier : file d'attente.
    """
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Transaction introuvable")
    if (getattr(tx, "status", None) or "active") == "voided":
        raise HTTPException(400, "Impossible de modifier une transaction supprimee. Restaurez-la d'abord.")

    payload_full = body.model_dump(exclude_unset=True)
    reason = payload_full.pop("reason", None)
    if payload_full.get("type") and payload_full["type"] not in VALID_TYPES:
        raise HTTPException(400, f"Type invalide. Valeurs acceptées : {', '.join(VALID_TYPES)}")
    # Dates → ISO string pour JSON payload
    if payload_full.get("transaction_date"):
        payload_full["transaction_date"] = payload_full["transaction_date"].isoformat()

    if current_user.role == "admin":
        from app.models.pending_action import PendingAction as _PA
        fake = _PA(
            action_type="update_transaction",
            target_type="transaction",
            target_id=tx_id,
            payload=payload_full,
            reason=reason,
            requested_by=current_user.id,
            status="executed",
        )
        approvals_service._execute_update_transaction(db, fake, current_user)  # type: ignore[attr-defined]
        db.commit()
        db.refresh(tx)
        return tx

    pa = approvals_service.queue_action(
        db,
        requested_by=current_user,
        action_type=approvals_service.ACTION_UPDATE_TRANSACTION,
        target_type="transaction",
        target_id=tx_id,
        payload=payload_full,
        reason=reason,
    )
    return {
        "queued": True,
        "pending_action_id": str(pa.id),
        "message": "Demande de modification envoyée à l'administrateur.",
    }


# ─── Distribution de bénéfices / pertes ───────────────────────────────────────


class DistributionPreviewRequest(BaseModel):
    amount: float
    currency: str = "HTG"
    kind: str  # 'gain' | 'loss'


class DistributionExecuteRequest(BaseModel):
    amount: float
    currency: str = "HTG"
    kind: str
    transaction_date: date
    notes: str | None = None


@router.post("/distribute/preview")
def distribute_preview(
    body: DistributionPreviewRequest,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    """
    Calcule l'allocation prévue (société + ligne par investisseur) sans rien
    écrire en base. Le front l'utilise pour afficher l'aperçu avant validation.
    """
    from app.services import distribution_service

    preview = distribution_service.preview_distribution(
        db, amount=body.amount, currency=body.currency, kind=body.kind
    )
    return {
        "kind": preview.kind,
        "total_amount": preview.total_amount,
        "currency": preview.currency,
        "company_amount": preview.company_amount,
        "investors_pool_amount": preview.investors_pool_amount,
        "company_share_ratio": preview.company_share_ratio,
        "investors_share_ratio": preview.investors_share_ratio,
        "pool_va_total": round(preview.pool_va_total_in_base, 4),
        "investors": preview.investors,
    }


@router.post("/distribute")
def distribute_pnl(
    body: DistributionExecuteRequest,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    """
    Distribue un bénéfice (`kind='gain'`) ou une perte (`kind='loss'`) :
      - Admin : exécution immédiate, N+1 transactions créées atomiquement.
      - Caissier : la demande est mise en file d'attente pour validation admin.
    """
    if body.kind not in ("gain", "loss"):
        raise HTTPException(400, "Type invalide. Attendu : 'gain' ou 'loss'.")
    if body.amount is None or body.amount <= 0:
        raise HTTPException(400, "Le montant doit être strictement positif.")

    if current_user.role == "admin":
        from app.services import distribution_service

        result = distribution_service.execute_distribution(
            db,
            amount=body.amount,
            currency=body.currency,
            kind=body.kind,
            transaction_date=body.transaction_date,
            notes=body.notes,
            created_by=current_user,
        )
        return result

    # Caissier : passe par approbation admin (action sensible : touche tous
    # les investisseurs et la trésorerie société).
    payload = {
        "amount": body.amount,
        "currency": body.currency,
        "kind": body.kind,
        "transaction_date": body.transaction_date.isoformat(),
        "notes": body.notes,
    }
    pa = approvals_service.queue_action(
        db,
        requested_by=current_user,
        action_type=approvals_service.ACTION_DISTRIBUTE_PNL,
        target_type="distribution",
        target_id=None,
        payload=payload,
        reason=body.notes or f"Distribution {body.kind} de {body.amount} {body.currency}",
    )
    return {
        "queued": True,
        "pending_action_id": str(pa.id),
        "message": "Demande de distribution envoyée à l'administrateur.",
    }
