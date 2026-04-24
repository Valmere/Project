"""
Auto-posting : conversion d'une transaction Valmere en écriture comptable
en partie double, selon un mapping fixe sur le plan comptable par défaut.

Mapping retenu (reproductible, idempotent, vérifiable à l'œil) :

    deposit    (investisseur verse)   DR  512X (banque devise)   CR  421 (compte investisseur)
    withdrawal (investisseur retire)  DR  421                    CR  512X
    gain       (valeur ajoutée)       DR  666 (pertes fin.)      CR  421
    loss       (moins-value)          DR  421                    CR  766 (gains fin.)
    fee        (frais de gestion)     DR  421                    CR  766

Raison du sens des écritures gain/loss :
  - Valmere doit de l'argent aux investisseurs (421 = passif).
  - Un gain crédite ce passif (CR 421) → augmente ce qui est dû.
    Le débit se fait contre un compte de charge (666) pour refléter
    l'allocation sortante du point de vue de Valmere.
  - Une perte/un frais diminue le passif (DR 421) ; le crédit va dans
    un produit (766) — Valmere "récupère" comptablement la différence.
  - Ce modèle est simplifié (pas de compte intermédiaire de résultat de
    trading) mais suffisant pour produire un bilan et un résultat cohérents
    à partir des seules données Valmere.

Idempotence :
  - `source_type = 'transaction'` et `source_id = tx.id` servent de clé.
  - `ensure_posted_for_transaction(db, tx)` no-op si une écriture existe déjà.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.transaction import Transaction
from app.models.investment import Investment
from app.models.account import Account
from app.models.journal_entry import JournalEntry, JournalLine
from app.services.currency import RateCache, BASE_CCY


# Code du compte banque pour chaque devise. Fallback sur 512 générique.
_BANK_BY_CURRENCY = {
    "HTG": "5121",
    "USD": "5122",
    "EUR": "5123",
    "CAD": "5124",
}
_INVESTOR_ACCOUNT = "421"
_LOSS_ACCOUNT = "666"   # Pertes financières (charge)
_GAIN_ACCOUNT = "766"   # Gains financiers (produit)


class PostingError(Exception):
    """Levée quand le plan comptable requis n'est pas configuré."""


class AccountCache:
    """Index des comptes par `code` pour éviter N lookups par transaction."""

    def __init__(self, db: Session):
        self._by_code: dict[str, Account] = {
            a.code: a for a in db.query(Account).all()
        }

    def get(self, code: str) -> Account:
        acc = self._by_code.get(code)
        if not acc:
            raise PostingError(
                f"Compte {code} introuvable dans le plan comptable. "
                f"Cliquez sur « Initialiser le plan par défaut » pour créer les comptes requis."
            )
        return acc

    def bank(self, currency: str) -> Account:
        return self.get(_BANK_BY_CURRENCY.get((currency or BASE_CCY).upper(), "5121"))


def _build_entry_for_transaction(
    db: Session,
    tx: Transaction,
    rates: RateCache,
    accounts: AccountCache,
    posted_by: uuid.UUID | None = None,
) -> JournalEntry:
    """Construit (sans commit) une JournalEntry postée pour la transaction `tx`."""
    investment = (
        db.query(Investment)
        .filter(Investment.id == tx.investment_id)
        .first()
    )
    tx_ccy = (getattr(tx, "currency", None) or BASE_CCY).upper()
    amount_native = float(tx.amount or 0)
    # Conversion en HTG (devise de base des écritures). strict=False → fallback
    # silencieux si le taux manque (on préfère une écriture au montant brut
    # plutôt qu'un échec bloquant du backfill).
    rate = rates.get(tx_ccy, BASE_CCY) or 1.0
    amount_base = rates.convert(amount_native, tx_ccy, BASE_CCY, strict=False)

    tx_type = (tx.type or "").lower()
    investor_account = accounts.get(_INVESTOR_ACCOUNT)
    bank_account = accounts.bank(tx_ccy)

    # Décide (debit_account, credit_account) selon le type.
    if tx_type == "deposit":
        debit_acc, credit_acc = bank_account, investor_account
    elif tx_type == "withdrawal":
        debit_acc, credit_acc = investor_account, bank_account
    elif tx_type == "gain":
        debit_acc, credit_acc = accounts.get(_LOSS_ACCOUNT), investor_account
    elif tx_type in ("loss", "fee"):
        debit_acc, credit_acc = investor_account, accounts.get(_GAIN_ACCOUNT)
    else:
        raise PostingError(f"Type de transaction inconnu : {tx.type!r}")

    investor_id = getattr(tx, "investor_id", None) or (
        investment.investor_id if investment else None
    )

    entry = JournalEntry(
        entry_date=tx.transaction_date,
        reference=f"TX-{str(tx.id)[:8]}",
        description=(tx.description or f"Transaction {tx_type}"),
        status="posted",
        posted_at=datetime.now(timezone.utc),
        posted_by=posted_by,
        source_type="transaction",
        source_id=tx.id,
        created_by=posted_by,
    )
    # Deux lignes exactement, équilibrées par construction.
    entry.lines = [
        JournalLine(
            account_id=debit_acc.id,
            line_number=1,
            debit=amount_base,
            credit=0,
            original_currency=tx_ccy,
            original_amount=amount_native,
            fx_rate=rate,
            investor_id=investor_id,
            description=f"Débit — {debit_acc.name}",
        ),
        JournalLine(
            account_id=credit_acc.id,
            line_number=2,
            debit=0,
            credit=amount_base,
            original_currency=tx_ccy,
            original_amount=amount_native,
            fx_rate=rate,
            investor_id=investor_id,
            description=f"Crédit — {credit_acc.name}",
        ),
    ]
    return entry


def ensure_posted_for_transaction(
    db: Session,
    tx: Transaction,
    rates: RateCache | None = None,
    accounts: AccountCache | None = None,
    posted_by: uuid.UUID | None = None,
    commit: bool = True,
) -> JournalEntry | None:
    """
    Garantit qu'une écriture comptable existe pour `tx`. Si une écriture
    `source_type='transaction', source_id=tx.id` existe déjà, no-op.

    Retourne l'écriture créée (ou None si no-op).
    """
    existing = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.source_type == "transaction",
            JournalEntry.source_id == tx.id,
        )
        .first()
    )
    if existing:
        return None
    rates = rates or RateCache(db)
    accounts = accounts or AccountCache(db)
    entry = _build_entry_for_transaction(db, tx, rates, accounts, posted_by=posted_by)
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    return entry


def backfill_all_transactions(
    db: Session,
    posted_by: uuid.UUID | None = None,
) -> dict:
    """
    Parcourt l'intégralité de la table `transactions` et crée une écriture
    pour chacune qui n'en a pas encore. Idempotent — relançable à volonté.

    Retourne un résumé {posted, skipped, errors}.
    """
    # Pré-charge les ids déjà postés pour éviter N requêtes de vérification.
    posted_ids: set[uuid.UUID] = set()
    for (src_id,) in (
        db.query(JournalEntry.source_id)
        .filter(JournalEntry.source_type == "transaction")
        .all()
    ):
        if src_id:
            posted_ids.add(src_id)

    rates = RateCache(db)
    accounts = AccountCache(db)
    posted = 0
    skipped = 0
    errors: list[dict] = []

    # Ordre chronologique → la série des écritures est lisible telle quelle
    # dans le journal général après le backfill.
    txs = (
        db.query(Transaction)
        .order_by(Transaction.transaction_date.asc())
        .all()
    )
    for tx in txs:
        if tx.id in posted_ids:
            skipped += 1
            continue
        try:
            entry = _build_entry_for_transaction(db, tx, rates, accounts, posted_by=posted_by)
            db.add(entry)
            posted += 1
        except PostingError as e:
            errors.append({"transaction_id": str(tx.id), "error": str(e)})
    if posted:
        db.commit()
    return {"posted": posted, "skipped": skipped, "errors": errors}
