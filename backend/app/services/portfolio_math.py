from __future__ import annotations

import uuid
import re
from datetime import date
from typing import Any


TX_SIGNS = {
    "deposit": 1,
    "initial": 1,
    "initial_capital": 1,
    "gain": 1,
    "withdrawal": -1,
    "loss": -1,
    "fee": -1,
    "company_withdrawal": -1,
    "bailout": 1,
    "company_bailout": 1,
}

CASH_FLOW_TYPES = {
    "deposit",
    "initial",
    "initial_capital",
    "withdrawal",
    "bailout",
    "company_bailout",
    "company_withdrawal",
}

PNL_TYPES = {"gain", "loss", "fee"}

_BAILOUT_AMOUNT_RE = re.compile(
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
        compact = compact.replace(",", "." if 1 <= decimals <= 4 else "")
    elif dot >= 0:
        decimals = len(compact) - dot - 1
        if decimals < 1 or decimals > 4:
            compact = compact.replace(".", "")
    try:
        return float(compact)
    except ValueError:
        return None


def tx_type(tx: Any) -> str:
    return (getattr(tx, "type", None) or "").lower()


def tx_sort_key(tx: Any) -> tuple:
    created_at = getattr(tx, "created_at", None)
    return (
        getattr(tx, "transaction_date", None) or date.min,
        created_at.isoformat() if created_at else "",
        str(getattr(tx, "id", "")),
    )


def is_initial_capital_tx(tx: Any) -> bool:
    t = tx_type(tx)
    if t in {"initial", "initial_capital"}:
        return True
    if t != "deposit":
        return False
    desc = (getattr(tx, "description", None) or "").strip().lower()
    return (
        "capital initial" in desc
        or "apport initial" in desc
        or "initial capital" in desc
        or "initial deposit" in desc
    )


def convert_value(
    rates: Any,
    amount: float,
    from_currency: str | None,
    target_currency: str,
    missing: set[str] | None = None,
) -> float:
    if rates is None:
        return float(amount or 0)
    try:
        return rates.convert(
            float(amount or 0),
            from_currency or target_currency,
            target_currency,
            strict=False,
            missing=missing,
        )
    except TypeError:
        return rates.convert(
            float(amount or 0),
            from_currency or target_currency,
            target_currency,
        )


def transaction_business_amount_and_currency(tx: Any) -> tuple[float, str]:
    """
    Montant metier d'une transaction.

    Les anciens bailouts ont parfois `amount` = delta technique et
    `display_amount` = montant saisi par l'utilisateur. La regle actuelle
    garde toujours le montant saisi comme valeur reelle.
    """
    if tx_type(tx) == "bailout" and getattr(tx, "display_amount", None) is not None:
        currency = (
            getattr(tx, "display_currency", None)
            or getattr(tx, "currency", None)
            or "HTG"
        )
        return float(getattr(tx, "display_amount") or 0), currency.upper()
    if tx_type(tx) == "bailout":
        match = _BAILOUT_AMOUNT_RE.search(getattr(tx, "description", None) or "")
        if match:
            parsed = _parse_amount_text(match.group(1))
            if parsed is not None:
                return parsed, (match.group(2) or getattr(tx, "currency", None) or "HTG").upper()
    return (
        float(getattr(tx, "amount", 0) or 0),
        (getattr(tx, "currency", None) or "HTG").upper(),
    )


def transaction_business_amount(
    tx: Any,
    rates: Any,
    target_currency: str,
    missing: set[str] | None = None,
) -> float:
    amount, currency = transaction_business_amount_and_currency(tx)
    return convert_value(rates, amount, currency, target_currency, missing)


def latest_bailout_key_by_investment(txs: list[Any]) -> dict[uuid.UUID, tuple]:
    """
    Last current-value reset per investment.

    Performance metrics (gain/loss and ROI) use this as a new starting point:
    P&L before the latest bailout is historical and should not keep weighing on
    the investor after the account has been reset.
    """
    out: dict[uuid.UUID, tuple] = {}
    for tx in sorted(txs, key=tx_sort_key):
        if tx_type(tx) != "bailout":
            continue
        investment_id = getattr(tx, "investment_id", None)
        if investment_id is not None:
            out[investment_id] = tx_sort_key(tx)
    return out


def is_after_latest_bailout(
    tx: Any,
    latest_bailouts: dict[uuid.UUID, tuple],
) -> bool:
    key = latest_bailouts.get(getattr(tx, "investment_id", None))
    return key is None or tx_sort_key(tx) > key


def is_effective_pnl_tx(
    tx: Any,
    latest_bailouts: dict[uuid.UUID, tuple],
) -> bool:
    return tx_type(tx) in PNL_TYPES and is_after_latest_bailout(tx, latest_bailouts)


def initial_seed_by_investment(
    investments: list[Any],
    txs: list[Any],
    rates: Any,
    target_currency: str,
    missing: set[str] | None = None,
) -> dict[uuid.UUID, float]:
    explicit_initial_ids = {
        getattr(tx, "investment_id", None)
        for tx in txs
        if is_initial_capital_tx(tx)
    }
    seeds: dict[uuid.UUID, float] = {}
    for inv in investments:
        inv_id = getattr(inv, "id")
        if inv_id in explicit_initial_ids:
            seeds[inv_id] = 0.0
            continue
        seeds[inv_id] = convert_value(
            rates,
            float(getattr(inv, "initial_capital", 0) or 0),
            getattr(inv, "currency", None),
            target_currency,
            missing,
        )
    return seeds


def static_initial_by_investor(
    investments: list[Any],
    rates: Any,
    target_currency: str,
    missing: set[str] | None = None,
) -> dict[uuid.UUID, float]:
    out: dict[uuid.UUID, float] = {}
    for inv in investments:
        investor_id = getattr(inv, "investor_id")
        out[investor_id] = out.get(investor_id, 0.0) + convert_value(
            rates,
            float(getattr(inv, "initial_capital", 0) or 0),
            getattr(inv, "currency", None),
            target_currency,
            missing,
        )
    return out


def portfolio_totals_by_investor(
    investments: list[Any],
    txs: list[Any],
    rates: Any,
    target_currency: str,
    missing: set[str] | None = None,
    company_investor_ids: set[uuid.UUID] | None = None,
) -> dict[str, dict[uuid.UUID, float]]:
    seed_by_investment = initial_seed_by_investment(
        investments, txs, rates, target_currency, missing
    )
    owner_by_investment = {
        getattr(inv, "id"): getattr(inv, "investor_id") for inv in investments
    }

    current_by_investment = dict(seed_by_investment)
    invested_by_inv: dict[uuid.UUID, float] = {}
    current_by_inv: dict[uuid.UUID, float] = {}
    pnl_by_investment: dict[uuid.UUID, float] = {inv_id: 0.0 for inv_id in current_by_investment}
    pnl_by_inv: dict[uuid.UUID, float] = {}

    for inv_id, seed in seed_by_investment.items():
        investor_id = owner_by_investment.get(inv_id)
        if investor_id is None:
            continue
        invested_by_inv[investor_id] = invested_by_inv.get(investor_id, 0.0) + seed

    for tx in sorted(txs, key=tx_sort_key):
        investment_id = getattr(tx, "investment_id", None)
        investor_id = getattr(tx, "investor_id", None) or owner_by_investment.get(investment_id)
        if investment_id not in current_by_investment or investor_id is None:
            continue

        t = tx_type(tx)
        sign = TX_SIGNS.get(t, 0)
        if not sign:
            continue
        amount = transaction_business_amount(tx, rates, target_currency, missing)
        signed = sign * amount
        if t == "bailout":
            current_by_investment[investment_id] = amount
            pnl_by_investment[investment_id] = 0.0
        else:
            current_by_investment[investment_id] += signed
        if t in CASH_FLOW_TYPES:
            invested_by_inv[investor_id] = invested_by_inv.get(investor_id, 0.0) + signed
        elif t in PNL_TYPES:
            pnl_by_investment[investment_id] = pnl_by_investment.get(investment_id, 0.0) + signed

    for investment_id, current in current_by_investment.items():
        investor_id = owner_by_investment.get(investment_id)
        if investor_id is not None:
            current_by_inv[investor_id] = current_by_inv.get(investor_id, 0.0) + current
            pnl_by_inv[investor_id] = pnl_by_inv.get(investor_id, 0.0) + pnl_by_investment.get(investment_id, 0.0)

    return {
        "current_by_investment": current_by_investment,
        "current_by_investor": current_by_inv,
        "invested_by_investor": invested_by_inv,
        "pnl_by_investor": pnl_by_inv,
        "initial_by_investor": static_initial_by_investor(
            investments, rates, target_currency, missing
        ),
        "seed_by_investment": seed_by_investment,
    }
