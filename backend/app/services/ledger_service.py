"""
Services de consultation du grand livre : soldes par compte, balance générée,
états financiers simples (Bilan, Compte de résultat).

Toute la lecture se fait depuis `journal_lines` + `journal_entries` — il n'y a
jamais de solde stocké. Les soldes sont toujours recalculés.
"""
from datetime import date
from sqlalchemy import func, and_
from sqlalchemy.orm import Session
from app.models.account import Account, NORMAL_BALANCE
from app.models.journal_entry import JournalEntry, JournalLine
from app.services.currency import RateCache, BASE_CCY


# ─────────────────────────────────────────────────────────────────────────────
# Conversion vers la devise d'affichage
# -----------------------------------------------------------------------------
# Les montants en base (`JournalLine.debit/credit`) sont toujours stockés en
# HTG (devise de base). L'admin peut consulter les états dans n'importe quelle
# devise d'affichage : on applique un taux unique HTG → target au moment du
# rendu. Si le taux manque (strict=False), on renvoie HTG brut pour éviter de
# bloquer la consultation, et on trace le manque via `rates_missing`.
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
        .filter(JournalLine.account_id == account_id)
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
    rate, ccy, missing = _resolve_display_rate(db, display_currency)

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
        bal = account_balance(db, acc.id, as_of=as_of)
        d = bal["debit"] * rate
        c = bal["credit"] * rate
        out.append({
            "account_id": str(acc.id),
            "code": acc.code,
            "name": acc.name,
            "type": acc.type,
            "debit": d,
            "credit": c,
            "balance": bal["balance"] * rate,
            "signed_balance": bal["signed_balance"] * rate,
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
    rate, ccy, missing = _resolve_display_rate(db, display_currency)

    q = (
        db.query(
            Account.type,
            func.coalesce(func.sum(JournalLine.debit), 0).label("debit"),
            func.coalesce(func.sum(JournalLine.credit), 0).label("credit"),
        )
        .join(JournalLine, JournalLine.account_id == Account.id)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .filter(JournalEntry.status == "posted")
        .filter(JournalEntry.entry_date >= start)
        .filter(JournalEntry.entry_date <= end)
        .filter(Account.type.in_(("revenue", "expense")))
        .group_by(Account.type)
    )

    totals = {"revenue": 0.0, "expense": 0.0}
    for row in q.all():
        # produits augmentent au crédit, charges augmentent au débit
        if row.type == "revenue":
            totals["revenue"] = float(row.credit) - float(row.debit)
        else:
            totals["expense"] = float(row.debit) - float(row.credit)

    net_income = totals["revenue"] - totals["expense"]

    # Détail par compte
    details = (
        db.query(
            Account.code,
            Account.name,
            Account.type,
            func.coalesce(func.sum(JournalLine.debit), 0).label("debit"),
            func.coalesce(func.sum(JournalLine.credit), 0).label("credit"),
        )
        .join(JournalLine, JournalLine.account_id == Account.id)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .filter(JournalEntry.status == "posted")
        .filter(JournalEntry.entry_date >= start)
        .filter(JournalEntry.entry_date <= end)
        .filter(Account.type.in_(("revenue", "expense")))
        .group_by(Account.code, Account.name, Account.type)
        .order_by(Account.code)
        .all()
    )

    return {
        "period": {"start": str(start), "end": str(end)},
        "currency": ccy,
        "rates_missing": sorted(missing),
        "revenue_total": totals["revenue"] * rate,
        "expense_total": totals["expense"] * rate,
        "net_income": net_income * rate,
        "lines": [
            {
                "code": r.code,
                "name": r.name,
                "type": r.type,
                "amount": rate * ((float(r.credit) - float(r.debit))
                          if r.type == "revenue"
                          else (float(r.debit) - float(r.credit))),
            }
            for r in details
        ],
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
