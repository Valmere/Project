"""
Services de consultation du grand livre : soldes par compte, balance générée,
états financiers simples (Bilan, Compte de résultat).

Toute la lecture se fait depuis `journal_lines` + `journal_entries` — il n'y a
jamais de solde stocké. Les soldes sont toujours recalculés.
"""
from datetime import date
from sqlalchemy import func, and_, or_
from sqlalchemy.orm import Session
from app.models.account import Account, NORMAL_BALANCE
from app.models.investment import Investment
from app.models.investor import Investor
from app.models.journal_entry import JournalEntry, JournalLine
from app.models.transaction import Transaction
from app.services.currency import RateCache, BASE_CCY


# ─────────────────────────────────────────────────────────────────────────────
# Conversion vers la devise d'affichage
# -----------------------------------------------------------------------------
# Les montants en base (`JournalLine.debit/credit`) sont toujours stockés en
# HTG (devise de base), mais chaque ligne garde aussi sa devise + son montant
# d'origine. Si l'admin consulte les états dans cette même devise d'origine,
# on reprend le montant exact saisi au lieu de reconvertir HTG → devise via le
# taux courant. Cela évite les écarts comme 500,00 USD affiché 499,99 USD.
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_display_rate(
    db: Session,
    target_currency: str | None,
) -> tuple[float, str, set[str]]:
    """
    Retourne (rate, ccy_effective, missing) pour convertir HTG → target.
      - rate         : facteur multiplicatif (1.0 si target = HTG ou taux manquant)
      - ccy_effective: devise réellement appliquée (fallback HTG si taux manquant)
      - missing      : ensemble des paires manquantes pour signalement UI
    """
    tc = (target_currency or BASE_CCY).upper()
    missing: set[str] = set()
    if tc == BASE_CCY:
        return 1.0, BASE_CCY, missing
    cache = RateCache(db)
    rate = cache.get(BASE_CCY, tc)
    if rate is None:
        missing.add(f"{BASE_CCY}→{tc}")
        return 1.0, BASE_CCY, missing
    return rate, tc, missing


def _display_amount(
    line: JournalLine,
    raw_value: float,
    target_currency: str,
    rates: RateCache,
    missing: set[str],
) -> float:
    """
    Montant d'une ligne dans la devise d'affichage.

    Priorité d'intégrité :
      1. Devise affichée = devise d'origine de la ligne → original_amount exact.
      2. Devise affichée = HTG → montant comptable HTG figé.
      3. Autre devise → conversion HTG vers target au taux courant.
    """
    value = float(raw_value or 0)
    if not value:
        return 0.0
    target = (target_currency or BASE_CCY).upper()
    original_currency = (line.original_currency or BASE_CCY).upper()
    if target == original_currency and line.original_amount is not None:
        return float(line.original_amount or 0)
    if target == BASE_CCY:
        return value
    return rates.convert(value, BASE_CCY, target, strict=False, missing=missing)


def _account_balance_display(
    db: Session,
    account: Account,
    *,
    as_of: date | None = None,
    start: date | None = None,
    end: date | None = None,
    target_currency: str,
    rates: RateCache,
    missing: set[str],
) -> dict:
    q = (
        db.query(JournalLine)
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .outerjoin(Investor, JournalLine.investor_id == Investor.id)
        .outerjoin(Transaction, and_(JournalEntry.source_type == "transaction", JournalEntry.source_id == Transaction.id))
        .outerjoin(Investment, Transaction.investment_id == Investment.id)
        .filter(JournalLine.account_id == account.id)
        .filter(JournalEntry.status == "posted")
        .filter(or_(
            JournalLine.investor_id.is_(None),
            Investor.is_company.is_(True),
            and_(
                Investor.status == "active",
                or_(
                    JournalEntry.source_type.is_(None),
                    JournalEntry.source_type != "transaction",
                    Investment.status == "active",
                ),
            ),
        ))
    )
    if as_of:
        q = q.filter(JournalEntry.entry_date <= as_of)
    if start:
        q = q.filter(JournalEntry.entry_date >= start)
    if end:
        q = q.filter(JournalEntry.entry_date <= end)

    debit = 0.0
    credit = 0.0
    for line in q.all():
        debit += _display_amount(line, float(line.debit or 0), target_currency, rates, missing)
        credit += _display_amount(line, float(line.credit or 0), target_currency, rates, missing)

    balance = debit - credit
    normal = NORMAL_BALANCE.get(account.type, "debit")
    signed = balance if normal == "debit" else -balance
    return {
        "debit": debit,
        "credit": credit,
        "balance": balance,
        "signed_balance": signed,
        "normal_side": normal,
    }


def _posted_only(q):
    """Restreint la requête aux écritures validées (jamais les brouillons)."""
    return q.filter(JournalEntry.status == "posted")


def account_balance(
    db: Session,
    account_id,
    *,
    as_of: date | None = None,
    include_drafts: bool = False,
) -> dict:
    """
    Retourne {debit, credit, balance, signed_balance} pour un compte.
    `signed_balance` applique le sens normal : positif = augmentation du compte
    selon sa nature (actif/charge → débit naturel ; passif/revenu → crédit naturel).
    """
    q = (
        db.query(
            func.coalesce(func.sum(JournalLine.debit), 0).label("debit"),
            func.coalesce(func.sum(JournalLine.credit), 0).label("credit"),
        )
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .outerjoin(Investor, JournalLine.investor_id == Investor.id)
        .outerjoin(Transaction, and_(JournalEntry.source_type == "transaction", JournalEntry.source_id == Transaction.id))
        .outerjoin(Investment, Transaction.investment_id == Investment.id)
        .filter(JournalLine.account_id == account_id)
        .filter(or_(
            JournalLine.investor_id.is_(None),
            Investor.is_company.is_(True),
            and_(
                Investor.status == "active",
                or_(
                    JournalEntry.source_type.is_(None),
                    JournalEntry.source_type != "transaction",
                    Investment.status == "active",
                ),
            ),
        ))
    )
    if as_of:
        q = q.filter(JournalEntry.entry_date <= as_of)
    if not include_drafts:
        q = _posted_only(q)

    row = q.one()
    debit = float(row.debit or 0)
    credit = float(row.credit or 0)
    balance = debit - credit  # solde brut = débit - crédit

    acc = db.query(Account).filter(Account.id == account_id).first()
    normal = NORMAL_BALANCE.get(acc.type if acc else "asset", "debit")
    signed = balance if normal == "debit" else -balance

    return {
        "account_id": str(account_id),
        "debit": debit,
        "credit": credit,
        "balance": balance,
        "signed_balance": signed,
        "normal_side": normal,
    }


def trial_balance(
    db: Session,
    *,
    as_of: date | None = None,
    display_currency: str | None = None,
) -> dict:
    """
    Balance générale : pour chaque compte postable actif, renvoie (débit, crédit, solde).
    Converti dans `display_currency` si fourni (par défaut HTG).
    """
    _rate, ccy, missing = _resolve_display_rate(db, display_currency)
    target = (display_currency or BASE_CCY).upper()
    if ccy == BASE_CCY and target != BASE_CCY:
        target = BASE_CCY
    rates = RateCache(db)

    accounts = (
        db.query(Account)
        .filter(Account.is_active == True, Account.is_postable == True)  # noqa: E712
        .order_by(Account.code)
        .all()
    )

    out = []
    total_debit = 0.0
    total_credit = 0.0
    for acc in accounts:
        bal = _account_balance_display(
            db,
            acc,
            as_of=as_of,
            target_currency=target,
            rates=rates,
            missing=missing,
        )
        d = bal["debit"]
        c = bal["credit"]
        out.append({
            "account_id": str(acc.id),
            "code": acc.code,
            "name": acc.name,
            "type": acc.type,
            "debit": d,
            "credit": c,
            "balance": bal["balance"],
            "signed_balance": bal["signed_balance"],
        })
        total_debit += d
        total_credit += c

    return {
        "as_of": str(as_of) if as_of else None,
        "currency": ccy,
        "rates_missing": sorted(missing),
        "lines": out,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "is_balanced": round(total_debit - total_credit, 4) == 0,
    }


def income_statement(
    db: Session,
    *,
    start: date,
    end: date,
    display_currency: str | None = None,
) -> dict:
    """
    Compte de résultat sur [start, end] : produits - charges = résultat.
    Converti dans `display_currency` si fourni (par défaut HTG).
    """
    _rate, ccy, missing = _resolve_display_rate(db, display_currency)
    target = (display_currency or BASE_CCY).upper()
    if ccy == BASE_CCY and target != BASE_CCY:
        target = BASE_CCY
    rates = RateCache(db)

    totals = {"revenue": 0.0, "expense": 0.0}
    details = []
    accounts = (
        db.query(Account)
        .filter(Account.type.in_(("revenue", "expense")))
        .order_by(Account.code)
        .all()
    )
    for account in accounts:
        bal = _account_balance_display(
            db,
            account,
            start=start,
            end=end,
            target_currency=target,
            rates=rates,
            missing=missing,
        )
        amount = (
            bal["credit"] - bal["debit"]
            if account.type == "revenue"
            else bal["debit"] - bal["credit"]
        )
        if amount:
            details.append({
                "code": account.code,
                "name": account.name,
                "type": account.type,
                "amount": amount,
            })
        totals[account.type] += amount

    net_income = totals["revenue"] - totals["expense"]

    return {
        "period": {"start": str(start), "end": str(end)},
        "currency": ccy,
        "rates_missing": sorted(missing),
        "revenue_total": totals["revenue"],
        "expense_total": totals["expense"],
        "net_income": net_income,
        "lines": details,
    }


def balance_sheet(
    db: Session,
    *,
    as_of: date,
    display_currency: str | None = None,
) -> dict:
    """
    Bilan à une date : Actif = Passif + Capitaux propres (+ Résultat N).
    Converti dans `display_currency` (par défaut HTG).
    """
    tb = trial_balance(db, as_of=as_of, display_currency=display_currency)

    by_type = {"asset": 0.0, "liability": 0.0, "equity": 0.0}
    details = {"asset": [], "liability": [], "equity": []}
    for line in tb["lines"]:
        t = line["type"]
        if t in by_type:
            amt = line["signed_balance"]
            by_type[t] += amt
            if amt != 0:
                details[t].append({
                    "code": line["code"],
                    "name": line["name"],
                    "amount": amt,
                })

    # Résultat de l'exercice N (produits - charges YTD jusqu'à as_of)
    # Approximation simple : on suppose l'exercice commence au 1er janvier.
    ytd_start = date(as_of.year, 1, 1)
    ist = income_statement(db, start=ytd_start, end=as_of, display_currency=display_currency)

    # Fusionne les paires manquantes des deux sous-calculs.
    missing = sorted(set(tb.get("rates_missing") or []) | set(ist.get("rates_missing") or []))

    return {
        "as_of": str(as_of),
        "currency": tb["currency"],
        "rates_missing": missing,
        "assets": {"total": by_type["asset"], "lines": details["asset"]},
        "liabilities": {"total": by_type["liability"], "lines": details["liability"]},
        "equity": {"total": by_type["equity"], "lines": details["equity"]},
        "net_income_ytd": ist["net_income"],
        "total_liabilities_and_equity": by_type["liability"] + by_type["equity"] + ist["net_income"],
        "is_balanced": round(
            by_type["asset"] - (by_type["liability"] + by_type["equity"] + ist["net_income"]),
            2,
        ) == 0,
    }
