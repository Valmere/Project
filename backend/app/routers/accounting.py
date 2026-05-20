"""
Module comptable — réservé aux rôles admin / cashier.
Aucune route ici n'est accessible aux investisseurs.

Endpoints :
  /api/accounting/accounts ............ CRUD plan comptable
  /api/accounting/accounts/seed ....... Initialiser le plan par défaut
  /api/accounting/journal ............. Lister / créer des écritures
  /api/accounting/journal/{id}/post ... Valider une écriture
  /api/accounting/journal/{id}/void ... Annuler une écriture
  /api/accounting/statements/trial-balance
  /api/accounting/statements/income-statement
  /api/accounting/statements/balance-sheet
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.user import User
from app.models.account import Account, ACCOUNT_TYPES
from app.models.journal_entry import JournalEntry, JournalLine
from app.dependencies.auth import admin_or_cashier, admin_only
from app.services import ledger_service
from app.services.accounting_seed import seed_default_coa
from app.services.accounting_posting import backfill_all_transactions, PostingError
from app.services.currency import RateCache


router = APIRouter(
    prefix="/api/accounting",
    tags=["accounting"],
    # Garde globale : aucune route n'est accessible aux investisseurs.
    dependencies=[Depends(admin_or_cashier)],
)


# ── Schemas ──────────────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    code: str = Field(..., max_length=20)
    name: str = Field(..., max_length=200)
    type: str
    parent_id: uuid.UUID | None = None
    currency: str = "HTG"
    is_postable: bool = True
    description: str | None = None
    sort_order: int = 0


class AccountUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    parent_id: uuid.UUID | None = None
    currency: str | None = None
    is_postable: bool | None = None
    is_active: bool | None = None
    description: str | None = None
    sort_order: int | None = None


class JournalLineIn(BaseModel):
    account_id: uuid.UUID
    debit: float = 0
    credit: float = 0
    original_currency: str = "HTG"
    original_amount: float | None = None
    fx_rate: float | None = None
    investor_id: uuid.UUID | None = None
    description: str | None = None


class JournalEntryCreate(BaseModel):
    entry_date: date
    reference: str | None = None
    description: str | None = None
    lines: list[JournalLineIn]
    # Optional : si la comptabilisation est dérivée d'une transaction existante
    source_type: str | None = None
    source_id: uuid.UUID | None = None


# ── Chart of Accounts (plan comptable) ───────────────────────────────────────

@router.get("/accounts")
def list_accounts(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Account)
    if not include_inactive:
        q = q.filter(Account.is_active == True)  # noqa: E712
    accounts = q.order_by(Account.code).all()
    return [
        {
            "id": str(a.id),
            "code": a.code,
            "name": a.name,
            "type": a.type,
            "parent_id": str(a.parent_id) if a.parent_id else None,
            "currency": a.currency,
            "is_postable": a.is_postable,
            "is_active": a.is_active,
            "description": a.description,
            "sort_order": a.sort_order,
        }
        for a in accounts
    ]


@router.post("/accounts", status_code=201)
def create_account(
    body: AccountCreate,
    db: Session = Depends(get_db),
):
    if body.type not in ACCOUNT_TYPES:
        raise HTTPException(400, f"Type invalide. Autorisés : {', '.join(ACCOUNT_TYPES)}")
    if db.query(Account).filter(Account.code == body.code).first():
        raise HTTPException(409, f"Un compte avec le code {body.code} existe déjà")

    acc = Account(**body.model_dump())
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return {"id": str(acc.id), "code": acc.code, "name": acc.name}


@router.put("/accounts/{account_id}")
def update_account(
    account_id: uuid.UUID,
    body: AccountUpdate,
    db: Session = Depends(get_db),
):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(404, "Compte introuvable")
    if body.type and body.type not in ACCOUNT_TYPES:
        raise HTTPException(400, f"Type invalide. Autorisés : {', '.join(ACCOUNT_TYPES)}")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(acc, field, value)
    db.commit()
    return {"ok": True}


@router.delete("/accounts/{account_id}")
def delete_account(
    account_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(404, "Compte introuvable")
    # On ne supprime pas — on désactive. Préserve l'intégrité des écritures.
    if db.query(JournalLine).filter(JournalLine.account_id == account_id).first():
        acc.is_active = False
        db.commit()
        return {"ok": True, "deactivated": True}
    db.delete(acc)
    db.commit()
    return {"ok": True, "deleted": True}


@router.post("/accounts/seed")
def seed_accounts(
    overwrite: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    """Initialise le plan comptable par défaut (idempotent)."""
    result = seed_default_coa(db, overwrite=overwrite)
    return result


@router.post("/backfill/transactions")
def backfill_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    """
    Génère une écriture en partie double pour chaque transaction existante
    qui n'en a pas encore. Rejouable à volonté (idempotent via `source_id`).

    Prérequis : plan comptable initialisé. Sinon la réponse contient la
    liste des transactions en échec avec le code de compte manquant.
    """
    try:
        return backfill_all_transactions(db, posted_by=current_user.id)
    except PostingError as e:
        raise HTTPException(422, str(e))


# ── Journal ──────────────────────────────────────────────────────────────────

def _serialize_entry(e: JournalEntry, *, rates: "RateCache | None" = None, display_currency: str | None = None) -> dict:
    """
    Renvoie une écriture sérialisée.

    Règle d'affichage (intégrité comptable) :

      - Si `display_currency` == devise d'ORIGINE de la ligne, on renvoie
        directement `original_amount`. Le chiffre vu correspond EXACTEMENT
        à ce qui a été saisi le jour J — aucune dépendance au taux courant.

      - Si `display_currency` == HTG (devise de stockage comptable), on
        renvoie `debit` / `credit` tels qu'ils sont en base : la valeur
        figée par le `fx_rate` historique au moment du posting.

      - Sinon (devise tierce, ex : original=USD et affichage=EUR), on doit
        forcément triangulé via le taux COURANT HTG→devise. Le résultat
        est marqué `is_approximate=True` pour que l'UI puisse en avertir.

    Le champ `fx_rate` (taux figé au moment de la transaction) est toujours
    renvoyé pour que l'admin voie le taux appliqué — un changement de cours
    le lendemain ne modifie donc pas la valeur historique affichée.
    """
    BASE = "HTG"
    target = (display_currency or BASE).upper()

    def _line_display(l: JournalLine, raw_value: float) -> tuple[float, bool]:
        """
        Retourne (montant, is_approximate) pour `raw_value` (debit ou credit).
        `raw_value` est en HTG (stockage). On l'exprime dans `target` en
        respectant la règle d'historicité ci-dessus.
        """
        if not raw_value:
            return 0.0, False
        orig_ccy = (l.original_currency or BASE).upper()
        # Cas 1 : on demande la devise d'origine → on a la valeur exacte
        # stockée (original_amount), pas de conversion.
        if target == orig_ccy and l.original_amount is not None:
            # `original_amount` couvre toute la ligne (debit OU credit, l'autre = 0)
            return float(l.original_amount), False
        # Cas 2 : on demande la devise comptable HTG → la valeur stockée
        # est déjà la bonne, figée par le taux historique.
        if target == BASE:
            return float(raw_value), False
        # Cas 3 : devise tierce → triangulation via le taux courant HTG→target.
        # Inévitablement approximatif (le cours bouge), on le signale.
        if rates is not None:
            return round(rates.convert(float(raw_value), BASE, target, strict=False), 4), True
        return float(raw_value), True

    line_dicts = []
    any_approx = False
    for l in e.lines:
        disp_debit, ad = _line_display(l, float(l.debit or 0))
        disp_credit, ac = _line_display(l, float(l.credit or 0))
        any_approx = any_approx or ad or ac
        line_dicts.append({
            "id": str(l.id),
            "line_number": l.line_number,
            "account_id": str(l.account_id),
            # Montant à afficher dans la devise demandée (historique préservé)
            "debit": round(disp_debit, 4),
            "credit": round(disp_credit, 4),
            # Valeurs comptables brutes en HTG (stockage figé)
            "debit_htg": float(l.debit or 0),
            "credit_htg": float(l.credit or 0),
            # Audit : devise + montant + taux du jour de la transaction
            "original_currency": l.original_currency,
            "original_amount": float(l.original_amount) if l.original_amount is not None else None,
            "fx_rate": float(l.fx_rate) if l.fx_rate is not None else None,
            "investor_id": str(l.investor_id) if l.investor_id else None,
            "description": l.description,
        })

    return {
        "id": str(e.id),
        "entry_date": str(e.entry_date),
        "reference": e.reference,
        "description": e.description,
        "status": e.status,
        "posted_at": e.posted_at.isoformat() if e.posted_at else None,
        "source_type": e.source_type,
        "source_id": str(e.source_id) if e.source_id else None,
        "currency": target,           # devise utilisée pour debit/credit
        "is_approximate": any_approx, # vrai si une ligne a été (re)convertie via taux courant
        "lines": line_dicts,
    }


@router.get("/journal")
def list_journal(
    start: date | None = None,
    end: date | None = None,
    status: str | None = None,
    currency: str | None = None,
    db: Session = Depends(get_db),
):
    """
    Liste les écritures du journal général.

    `currency` (optionnel) : devise dans laquelle convertir débits/crédits
    pour l'affichage. Sans ce paramètre, les montants sont retournés en HTG
    (devise de stockage comptable). Même contrat d'API que les états financiers.
    """
    q = db.query(JournalEntry).options(selectinload(JournalEntry.lines))
    if start:
        q = q.filter(JournalEntry.entry_date >= start)
    if end:
        q = q.filter(JournalEntry.entry_date <= end)
    if status:
        q = q.filter(JournalEntry.status == status)
    entries = q.order_by(JournalEntry.entry_date.desc(), JournalEntry.created_at.desc()).limit(500).all()

    # Cache de taux partagé pour la sérialisation de toutes les écritures :
    # 1 seule lecture en base au lieu de N par ligne.
    rates = RateCache(db) if currency and currency.upper() != "HTG" else None
    return [_serialize_entry(e, rates=rates, display_currency=currency) for e in entries]


@router.post("/journal", status_code=201)
def create_entry(
    body: JournalEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_or_cashier),
):
    if len(body.lines) < 2:
        raise HTTPException(400, "Une écriture doit avoir au moins 2 lignes")

    total_debit = sum(Decimal(str(l.debit)) for l in body.lines)
    total_credit = sum(Decimal(str(l.credit)) for l in body.lines)
    if total_debit != total_credit:
        raise HTTPException(
            400,
            f"Écriture non équilibrée : débits={total_debit} ≠ crédits={total_credit}",
        )
    if total_debit == 0:
        raise HTTPException(400, "Montant total nul")

    # Valide les comptes (postables, actifs)
    for line in body.lines:
        acc = db.query(Account).filter(Account.id == line.account_id).first()
        if not acc:
            raise HTTPException(400, f"Compte {line.account_id} introuvable")
        if not acc.is_postable:
            raise HTTPException(400, f"Le compte {acc.code} n'est pas postable")
        if not acc.is_active:
            raise HTTPException(400, f"Le compte {acc.code} est inactif")
        if (line.debit or 0) > 0 and (line.credit or 0) > 0:
            raise HTTPException(400, "Une ligne ne peut avoir débit ET crédit simultanément")
        if (line.debit or 0) == 0 and (line.credit or 0) == 0:
            raise HTTPException(400, "Une ligne doit avoir un montant")

    entry = JournalEntry(
        entry_date=body.entry_date,
        reference=body.reference,
        description=body.description,
        status="draft",
        source_type=body.source_type,
        source_id=body.source_id,
        created_by=current_user.id,
    )
    db.add(entry)
    db.flush()

    for idx, l in enumerate(body.lines, start=1):
        db.add(JournalLine(
            entry_id=entry.id,
            account_id=l.account_id,
            line_number=idx,
            debit=l.debit or 0,
            credit=l.credit or 0,
            original_currency=l.original_currency,
            original_amount=l.original_amount,
            fx_rate=l.fx_rate,
            investor_id=l.investor_id,
            description=l.description,
        ))

    db.commit()
    db.refresh(entry)
    # Re-charger avec lines
    entry = db.query(JournalEntry).options(selectinload(JournalEntry.lines)).filter(JournalEntry.id == entry.id).first()
    return _serialize_entry(entry)


@router.post("/journal/{entry_id}/post")
def post_entry(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_or_cashier),
):
    entry = db.query(JournalEntry).options(selectinload(JournalEntry.lines)).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Écriture introuvable")
    if entry.status != "draft":
        raise HTTPException(400, f"Écriture déjà au statut {entry.status}")

    total_debit = sum(Decimal(str(l.debit)) for l in entry.lines)
    total_credit = sum(Decimal(str(l.credit)) for l in entry.lines)
    if total_debit != total_credit or total_debit == 0:
        raise HTTPException(400, "Écriture déséquilibrée ou vide")

    entry.status = "posted"
    entry.posted_at = datetime.now(timezone.utc)
    entry.posted_by = current_user.id
    db.commit()
    return {"ok": True, "status": "posted"}


@router.post("/journal/{entry_id}/void")
def void_entry(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Écriture introuvable")
    if entry.status == "void":
        return {"ok": True, "status": "void"}
    entry.status = "void"
    db.commit()
    return {"ok": True, "status": "void"}


# ── Financial statements ─────────────────────────────────────────────────────

@router.get("/statements/trial-balance")
def trial_balance(
    as_of: date | None = None,
    currency: str | None = None,
    db: Session = Depends(get_db),
):
    return ledger_service.trial_balance(db, as_of=as_of, display_currency=currency)


@router.get("/statements/income-statement")
def income_statement(
    start: date,
    end: date,
    currency: str | None = None,
    db: Session = Depends(get_db),
):
    return ledger_service.income_statement(db, start=start, end=end, display_currency=currency)


@router.get("/statements/balance-sheet")
def balance_sheet(
    as_of: date,
    currency: str | None = None,
    db: Session = Depends(get_db),
):
    return ledger_service.balance_sheet(db, as_of=as_of, display_currency=currency)
