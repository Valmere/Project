"""
Auto-posting : conversion d'une transaction Valmere en écriture comptable
en partie double, selon un mapping fixe sur le plan comptable par défaut.

Mapping retenu (reproductible, idempotent, vérifiable à l'œil) :

    deposit / bailout
                                      DR  512X (banque devise)   CR  421 (compte investisseur)
    withdrawal / company_withdrawal   DR  421                    CR  512X
    gain       (valeur ajoutée)       DR  512X                   CR  767 (gains investisseurs)
    loss       (moins-value)          DR  667 (pertes investisseurs) CR  512X
    fee        (frais de gestion)     DR  421                    CR  706 (commissions)

Cas particulier Valmere & Co (`is_company=True`) :
    company_bailout / bailout         DR  512X                   CR  101
    company_withdrawal                DR  101                    CR  512X
    gain                              DR  512X                   CR  766
    loss                              DR  666                    CR  512X
    fee                               DR  512X                   CR  706

Raison du sens des écritures investisseurs :
  - Les gains financiers sont des produits : les gains société créditent 766,
    les gains investisseurs créditent 767.
  - Les pertes financières sont des charges : les pertes société débitent 666,
    les pertes investisseurs débitent 667.
  - Les apports/retraits restent sur 421 pour suivre les flux investisseurs.
  - Un frais diminue aussi le passif, mais le crédit va dans les commissions
    de gestion (706), séparées des gains financiers.
  - Ce modèle est simplifié (pas de compte intermédiaire de résultat de
    trading) mais suffisant pour produire un bilan et un résultat cohérents
    à partir des seules données Valmere.

Idempotence :
  - `source_type = 'transaction'` et `source_id = tx.id` servent de clé.
  - `ensure_posted_for_transaction(db, tx)` ne duplique pas les écritures ;
    il répare les anciennes écritures si le mapping ou le montant métier a
    changé.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from collections import defaultdict
from sqlalchemy.orm import Session

from app.models.transaction import Transaction
from app.models.investment import Investment
from app.models.investor import Investor
from app.models.account import Account
from app.models.journal_entry import JournalEntry, JournalLine
from app.services.currency import RateCache, BASE_CCY
from app.services.portfolio_math import transaction_business_amount_and_currency


# Code du compte banque pour chaque devise. Fallback sur 512 générique.
_BANK_BY_CURRENCY = {
    "HTG": "5121",
    "USD": "5122",
    "EUR": "5123",
    "CAD": "5124",
}
_INVESTOR_ACCOUNT = "421"
_COMPANY_EQUITY_ACCOUNT = "101"
_LOSS_ACCOUNT = "666"   # Pertes financières (charge)
_INVESTOR_LOSS_ACCOUNT = "667"  # Pertes financières investisseurs (charge)
_GAIN_ACCOUNT = "766"   # Gains financiers (produit)
_INVESTOR_GAIN_ACCOUNT = "767"  # Gains financiers investisseurs (produit)
_FEE_ACCOUNT = "706"    # Commissions de gestion (produit)

SUPPORTED_TRANSACTION_TYPES = frozenset({
    "deposit",
    "initial",
    "initial_capital",
    "withdrawal",
    "gain",
    "loss",
    "fee",
    "company_withdrawal",
    "bailout",
    "company_bailout",
})


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


def _posting_amount_and_currency(tx: Transaction) -> tuple[float, str]:
    """
    Amount used by accounting.

    Older bailouts can have two amounts:
      - tx.amount: former technical delta
      - tx.display_amount: amount originally entered by the user

    Accounting must reflect the entered business amount, not the internal delta.
    """
    return transaction_business_amount_and_currency(tx)


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
    amount_native, tx_ccy = _posting_amount_and_currency(tx)
    # Conversion en HTG (devise de base des écritures). strict=False → fallback
    # silencieux si le taux manque (on préfère une écriture au montant brut
    # plutôt qu'un échec bloquant du backfill).
    rate = rates.get(tx_ccy, BASE_CCY) or 1.0
    amount_base = rates.convert(amount_native, tx_ccy, BASE_CCY, strict=False)

    tx_type = (tx.type or "").lower()
    investor_id = getattr(tx, "investor_id", None) or (
        investment.investor_id if investment else None
    )
    investor = (
        db.query(Investor).filter(Investor.id == investor_id).first()
        if investor_id
        else None
    )
    is_company_tx = bool(getattr(investor, "is_company", False)) or tx_type in {
        "company_bailout",
        "company_withdrawal",
    }
    investor_account = accounts.get(_INVESTOR_ACCOUNT)
    company_equity_account = accounts.get(_COMPANY_EQUITY_ACCOUNT) if is_company_tx else None
    bank_account = accounts.bank(tx_ccy)

    # Décide (debit_account, credit_account) selon le type.
    if is_company_tx and tx_type in ("deposit", "initial", "initial_capital", "bailout", "company_bailout"):
        debit_acc, credit_acc = bank_account, company_equity_account
    elif is_company_tx and tx_type in ("withdrawal", "company_withdrawal"):
        debit_acc, credit_acc = company_equity_account, bank_account
    elif is_company_tx and tx_type == "gain":
        debit_acc, credit_acc = bank_account, accounts.get(_GAIN_ACCOUNT)
    elif is_company_tx and tx_type == "loss":
        debit_acc, credit_acc = accounts.get(_LOSS_ACCOUNT), bank_account
    elif is_company_tx and tx_type == "fee":
        debit_acc, credit_acc = bank_account, accounts.get(_FEE_ACCOUNT)
    elif tx_type in ("deposit", "initial", "initial_capital", "bailout", "company_bailout"):
        debit_acc, credit_acc = bank_account, investor_account
    elif tx_type in ("withdrawal", "company_withdrawal"):
        debit_acc, credit_acc = investor_account, bank_account
    elif tx_type == "gain":
        debit_acc, credit_acc = bank_account, accounts.get(_INVESTOR_GAIN_ACCOUNT)
    elif tx_type == "loss":
        debit_acc, credit_acc = accounts.get(_INVESTOR_LOSS_ACCOUNT), bank_account
    elif tx_type == "fee":
        debit_acc, credit_acc = investor_account, accounts.get(_FEE_ACCOUNT)
    else:
        supported = ", ".join(sorted(SUPPORTED_TRANSACTION_TYPES))
        raise PostingError(
            f"Type de transaction inconnu : {tx.type!r}. Types supportes : {supported}"
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
    `source_type='transaction', source_id=tx.id` existe déjà, on la compare
    avec le mapping courant et on la répare si nécessaire.

    Retourne l'écriture créée/réparée (ou None si no-op).
    """
    existing = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.source_type == "transaction",
            JournalEntry.source_id == tx.id,
            JournalEntry.status == "posted",
        )
        .first()
    )
    if existing:
        rates = rates or RateCache(db)
        accounts = accounts or AccountCache(db)
        if _repair_entry_if_needed(db, tx, rates, accounts, posted_by=posted_by):
            if commit:
                db.commit()
                db.refresh(existing)
            return existing
        return None
    rates = rates or RateCache(db)
    accounts = accounts or AccountCache(db)
    entry = _build_entry_for_transaction(db, tx, rates, accounts, posted_by=posted_by)
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    return entry


def _repair_entry_if_needed(
    db: Session,
    tx: Transaction,
    rates: RateCache,
    accounts: AccountCache,
    posted_by: uuid.UUID | None = None,
) -> bool:
    """
    Repair an existing transaction journal entry when the desired mapping,
    entered business amount, currency, or investor classification changed.
    """
    entry = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.source_type == "transaction",
            JournalEntry.source_id == tx.id,
            JournalEntry.status == "posted",
        )
        .first()
    )
    if not entry:
        return False

    desired = _build_entry_for_transaction(
        db,
        tx,
        rates,
        accounts,
        posted_by=posted_by,
    )
    desired_lines = sorted(desired.lines, key=lambda line: line.line_number)
    current_lines = sorted(entry.lines, key=lambda line: line.line_number)

    needs_repair = len(current_lines) != len(desired_lines)
    if not needs_repair:
        for current, expected in zip(current_lines, desired_lines):
            if (
                current.account_id != expected.account_id
                or round(float(current.debit or 0), 4) != round(float(expected.debit or 0), 4)
                or round(float(current.credit or 0), 4) != round(float(expected.credit or 0), 4)
                or (current.original_currency or "").upper() != (expected.original_currency or "").upper()
                or round(float(current.original_amount or 0), 4) != round(float(expected.original_amount or 0), 4)
            ):
                needs_repair = True
                break
    if not needs_repair:
        return False

    entry.entry_date = desired.entry_date
    entry.reference = desired.reference
    entry.description = desired.description
    entry.updated_at = datetime.now(timezone.utc)
    for line in list(current_lines):
        db.delete(line)
    db.flush()
    entry.lines = []
    for expected in desired_lines:
        replacement = JournalLine(
            entry_id=entry.id,
            account_id=expected.account_id,
            line_number=expected.line_number,
            debit=expected.debit,
            credit=expected.credit,
            original_currency=expected.original_currency,
            original_amount=expected.original_amount,
            fx_rate=expected.fx_rate,
            investor_id=expected.investor_id,
            description=expected.description,
        )
        db.add(replacement)
        entry.lines.append(replacement)
    return True


def _repair_bailout_entry_if_needed(
    db: Session,
    tx: Transaction,
    rates: RateCache,
    accounts: AccountCache,
    posted_by: uuid.UUID | None = None,
) -> bool:
    """Backward-compatible wrapper kept for old tests/imports."""
    return _repair_entry_if_needed(db, tx, rates, accounts, posted_by=posted_by)


def _void_duplicate_transaction_entries(db: Session) -> int:
    """
    Keep one accounting entry per transaction and void extra posted copies.
    This preserves audit history while preventing doubled balances.
    """
    entries = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.source_type == "transaction",
            JournalEntry.source_id.isnot(None),
        )
        .order_by(JournalEntry.source_id.asc(), JournalEntry.created_at.asc())
        .all()
    )
    by_source: dict[uuid.UUID, list[JournalEntry]] = defaultdict(list)
    for entry in entries:
        by_source[entry.source_id].append(entry)

    voided = 0
    for grouped in by_source.values():
        if len(grouped) <= 1:
            continue
        posted = [entry for entry in grouped if entry.status == "posted"]
        keep = posted[0] if posted else grouped[0]
        for entry in grouped:
            if entry.id == keep.id or entry.status == "void":
                continue
            entry.status = "void"
            entry.updated_at = datetime.now(timezone.utc)
            voided += 1
    return voided


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
    duplicates_voided = _void_duplicate_transaction_entries(db)
    posted_ids: set[uuid.UUID] = set()
    for (src_id,) in (
        db.query(JournalEntry.source_id)
        .filter(JournalEntry.source_type == "transaction", JournalEntry.status == "posted")
        .all()
    ):
        if src_id:
            posted_ids.add(src_id)

    rates = RateCache(db)
    accounts = AccountCache(db)
    posted = 0
    skipped = 0
    repaired = 0
    errors: list[dict] = []

    # Ordre chronologique → la série des écritures est lisible telle quelle
    # dans le journal général après le backfill.
    txs = (
        db.query(Transaction)
        .filter(Transaction.status == "active")
        .order_by(Transaction.transaction_date.asc())
        .all()
    )
    for tx in txs:
        if tx.id in posted_ids:
            try:
                if _repair_entry_if_needed(db, tx, rates, accounts, posted_by=posted_by):
                    repaired += 1
            except PostingError as e:
                errors.append({"transaction_id": str(tx.id), "error": str(e)})
            skipped += 1
            continue
        try:
            entry = _build_entry_for_transaction(db, tx, rates, accounts, posted_by=posted_by)
            db.add(entry)
            posted += 1
        except PostingError as e:
            errors.append({"transaction_id": str(tx.id), "error": str(e)})
    if posted or repaired or duplicates_voided:
        db.commit()
    return {
        "posted": posted,
        "skipped": skipped,
        "repaired": repaired,
        "duplicates_voided": duplicates_voided,
        "errors": errors,
    }
