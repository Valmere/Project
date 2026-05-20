from datetime import date, timedelta
from collections import defaultdict
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.investor import Investor
from app.models.investment import Investment
from app.models.transaction import Transaction
from app.models.message import Message
from app.models.user import User
from app.dependencies.auth import get_current_user, admin_or_cashier
from app.services.roi_calculator import compute_roi_from_pnl
from app.services.currency import RateCache
from app.services.portfolio_math import (
    initial_seed_by_investment,
    is_effective_pnl_tx,
    latest_bailout_key_by_investment,
    transaction_business_amount,
)

# Short month labels (fr) for chart x-axis
_MONTHS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"]

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

# Canonical base currency used for all dashboard aggregates. The frontend then
# converts this to the user's chosen display currency via useRatesStore.
BASE_CCY = "HTG"
_TX_SIGNS = {
    "deposit": 1,
    "gain": 1,
    "withdrawal": -1,
    "loss": -1,
    "fee": -1,
    "company_withdrawal": -1,
    "bailout": 1,
    "company_bailout": 1,
}
_CASH_FLOW_TYPES = {
    "deposit",
    "withdrawal",
    "bailout",
    "company_bailout",
    "company_withdrawal",
}

# Mapping des clés de période (côté UI) vers le nombre de jours à remonter.
_PERIOD_DAYS = {
    "3d": 3, "7d": 7, "15d": 15, "30d": 30, "60d": 60,
    "90d": 90, "180d": 180, "365d": 365, "730d": 730,
}
_STANDARD_PERIODS = (3, 7, 15, 30, 60, 90, 180, 365, 730)

_VALID_GRANULARITIES = {"day", "week", "month", "year"}


def _to_base(rates: RateCache, amount, ccy: str | None, missing: set[str] | None = None,
             *, target: str = BASE_CCY) -> float:
    """
    Conversion vers la devise d'agrégation (par défaut HTG, mais peut être
    surchargée par la devise d'affichage choisie côté UI).

    Pourquoi paramétriser ? Pour éviter le double aller-retour USD → HTG → USD
    qui introduit des erreurs de précision flottante (ex: 600,03 au lieu de
    600,00). Quand la devise source est déjà la cible, `RateCache.convert`
    renvoie la valeur telle quelle — zéro arrondi.
    """
    return rates.convert(amount, ccy or target, target, strict=False, missing=missing)


def _tx_sort_key(tx: Transaction):
    created_at = getattr(tx, "created_at", None)
    return (
        tx.transaction_date or date.min,
        created_at.isoformat() if created_at else "",
        str(getattr(tx, "id", "")),
    )


def _initial_values_by_investment(
    investments: list[Investment],
    txs: list[Transaction],
    rates: RateCache,
    target_ccy: str,
    missing: set[str],
) -> dict[uuid.UUID, float]:
    return initial_seed_by_investment(investments, txs, rates, target_ccy, missing)


def _apply_tx_to_current_value(
    current_by_investment: dict[uuid.UUID, float],
    tx: Transaction,
    rates: RateCache,
    target_ccy: str,
    missing: set[str],
) -> None:
    if tx.investment_id not in current_by_investment:
        return
    sign = _TX_SIGNS.get(tx.type, 0)
    if not sign:
        return
    amount = transaction_business_amount(tx, rates, target_ccy, missing)
    if (tx.type or "").lower() == "bailout":
        current_by_investment[tx.investment_id] = amount
    else:
        current_by_investment[tx.investment_id] += sign * amount


def _current_values_by_investment(
    investments: list[Investment],
    txs: list[Transaction],
    rates: RateCache,
    target_ccy: str,
    missing: set[str],
) -> dict[uuid.UUID, float]:
    current = _initial_values_by_investment(investments, txs, rates, target_ccy, missing)
    for tx in sorted(txs, key=_tx_sort_key):
        _apply_tx_to_current_value(current, tx, rates, target_ccy, missing)
    return current


def _parse_iso(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except (TypeError, ValueError):
        return None


def _resolve_window(
    period: str | None,
    start_date: str | None,
    end_date: str | None,
) -> tuple[date, date]:
    """
    Calcule l'intervalle [window_start, window_end] (inclusif) à partir des
    paramètres du filtre.
      - period='custom' : utilise start_date/end_date si fournis (fallback : 30j)
      - period='3d'..'730d' : fenêtre glissante depuis aujourd'hui
      - sinon : 30 derniers jours
    """
    today = date.today()
    if period == "custom":
        ws = _parse_iso(start_date) or (today - timedelta(days=30))
        we = _parse_iso(end_date) or today
        if ws > we:
            ws, we = we, ws
        return ws, we
    days = _PERIOD_DAYS.get(period or "30d", 30)
    return today - timedelta(days=days), today


# ─── Buckets utilitaires ──────────────────────────────────────────────────────

def _bucket_start(d: date, g: str) -> date:
    if g == "day":
        return d
    if g == "week":
        return d - timedelta(days=d.weekday())
    if g == "month":
        return d.replace(day=1)
    if g == "year":
        return d.replace(month=1, day=1)
    return d


def _bucket_next(d: date, g: str) -> date:
    if g == "day":
        return d + timedelta(days=1)
    if g == "week":
        return d + timedelta(days=7)
    if g == "month":
        if d.month == 12:
            return date(d.year + 1, 1, 1)
        return date(d.year, d.month + 1, 1)
    if g == "year":
        return date(d.year + 1, 1, 1)
    return d + timedelta(days=1)


def _bucket_label(d: date, g: str) -> str:
    if g == "day":
        return f"{d.day:02d} {_MONTHS_FR[d.month - 1]}"
    if g == "week":
        end = d + timedelta(days=6)
        return f"{d.day:02d}–{end.day:02d} {_MONTHS_FR[end.month - 1]}"
    if g == "month":
        return f"{_MONTHS_FR[d.month - 1]} {str(d.year)[2:]}"
    if g == "year":
        return str(d.year)
    return d.isoformat()


# ─── Agrégation en un seul passage ───────────────────────────────────────────

def _aggregate_transactions(
    txs: list,
    rates: RateCache,
    window_start: date,
    window_end: date,
    chart_start: date,
    granularity: str,
    missing: set[str],
    *,
    target_ccy: str = BASE_CCY,
) -> dict:
    """
    Unique passage sur la liste des transactions qui produit, en même temps :
      - realized_pnl_total, net_deposits_total (cumulés toutes dates)
      - pnl_period (somme gain-perte-frais sur [window_start, window_end])
      - pnl_by_days (P&L pour chaque période standard 3d..730d)
      - pnl_by_bucket / flow_by_bucket (pour le graphique, agrégés par bucket)
      - pnl_before / flow_before (cumul avant le début du graphique)
    Chaque montant est converti une seule fois vers `target_ccy` (devise
    d'affichage). Si une transaction est déjà dans cette devise, aucune
    conversion → pas d'erreur de précision flottante.
    """
    today = date.today()
    realized_total = 0.0
    deposits_total = 0.0
    pnl_period = 0.0
    pnl_by_days: dict[int, float] = {d: 0.0 for d in _STANDARD_PERIODS}
    pnl_by_bucket: dict[date, float] = defaultdict(float)
    flow_by_bucket: dict[date, float] = defaultdict(float)
    pnl_before = 0.0
    flow_before = 0.0
    latest_bailouts = latest_bailout_key_by_investment(txs)

    for tx in txs:
        amt = transaction_business_amount(tx, rates, target_ccy, missing)
        t = tx.type
        if t in ("gain", "loss", "fee"):
            if not is_effective_pnl_tx(tx, latest_bailouts):
                continue
            sign, is_flow = _TX_SIGNS[t], False
        elif t in ("deposit", "bailout", "company_bailout"):
            # Renflouements = cash entrant, côté investisseur ou société.
            sign, is_flow = _TX_SIGNS[t], True
        elif t in ("withdrawal", "company_withdrawal"):
            # Retrait investisseur / prélèvement société = sortie de cash.
            sign, is_flow = _TX_SIGNS[t], True
        else:
            continue

        signed = sign * amt
        tx_date = tx.transaction_date

        if is_flow:
            deposits_total += signed
        else:
            realized_total += signed
            # Fenêtre filtre (pnl_period)
            if window_start <= tx_date <= window_end:
                pnl_period += signed
            # Raccourcis 3d..730d (toujours fenêtre glissante depuis aujourd'hui)
            days_ago = (today - tx_date).days
            for d in _STANDARD_PERIODS:
                if 0 <= days_ago <= d:
                    pnl_by_days[d] += signed

        # Chart buckets
        if tx_date < chart_start:
            if is_flow:
                flow_before += signed
            else:
                pnl_before += signed
        else:
            bkey = _bucket_start(tx_date, granularity)
            if is_flow:
                flow_by_bucket[bkey] += signed
            else:
                pnl_by_bucket[bkey] += signed

    return {
        "realized_total": realized_total,
        "deposits_total": deposits_total,
        "pnl_period": pnl_period,
        "pnl_by_days": pnl_by_days,
        "pnl_by_bucket": pnl_by_bucket,
        "flow_by_bucket": flow_by_bucket,
        "pnl_before": pnl_before,
        "flow_before": flow_before,
    }


def _build_chart(
    total_initial: float,
    agg: dict,
    chart_start: date,
    window_end: date,
    granularity: str,
) -> list[dict]:
    """
    Construit la série [{period, roi_pct, closing_value}].

    `roi_pct` cumulatif = ∑ P&L cumulé / valeur courante × 100
    (cohérent avec la nouvelle formule des tuiles : pnl/current_value).
    Avant on faisait pnl/initial — ça donnait toujours 0 quand l'initial
    était nul (cas Blade), d'où le graphique plat à 0%.
    """
    chart: list[dict] = []
    cum_pnl = agg["pnl_before"]
    cum_flow = agg["flow_before"]
    cursor = chart_start
    max_points = 2000  # garde-fou pour granularité 'day' sur fenêtre énorme
    while cursor <= window_end and len(chart) < max_points:
        cum_pnl += agg["pnl_by_bucket"].get(cursor, 0.0)
        cum_flow += agg["flow_by_bucket"].get(cursor, 0.0)
        closing = total_initial + cum_pnl + cum_flow
        # ROI rapporté à la VA courante. Si P&L et valeur courante sont tous
        # deux négatifs, le ratio deviendrait positif et trompeur ; on renvoie
        # donc None pour que l'UI affiche N/A.
        roi = compute_roi_from_pnl(cum_pnl, closing)
        chart.append({
            "period": _bucket_label(cursor, granularity),
            "roi_pct": round(roi, 2) if roi is not None else None,
            "roi_unavailable": roi is None,
            "closing_value": round(closing, 4),
        })
        cursor = _bucket_next(cursor, granularity)
    return chart


def _build_chart_from_transactions(
    investments: list[Investment],
    txs: list[Transaction],
    rates: RateCache,
    target_ccy: str,
    missing: set[str],
    chart_start: date,
    window_end: date,
    granularity: str,
) -> list[dict]:
    current_by_investment = _initial_values_by_investment(
        investments, txs, rates, target_ccy, missing
    )
    ordered = sorted(txs, key=_tx_sort_key)
    idx = 0
    pnl_by_investment = {inv_id: 0.0 for inv_id in current_by_investment}

    def apply(tx: Transaction) -> None:
        amount = transaction_business_amount(tx, rates, target_ccy, missing)
        investment_id = getattr(tx, "investment_id", None)
        if tx.type == "bailout" and investment_id in pnl_by_investment:
            pnl_by_investment[investment_id] = 0.0
        elif tx.type == "gain" and investment_id in pnl_by_investment:
            pnl_by_investment[investment_id] += amount
        elif tx.type in ("loss", "fee"):
            if investment_id in pnl_by_investment:
                pnl_by_investment[investment_id] -= amount
        _apply_tx_to_current_value(
            current_by_investment, tx, rates, target_ccy, missing
        )

    while idx < len(ordered) and ordered[idx].transaction_date < chart_start:
        apply(ordered[idx])
        idx += 1

    chart: list[dict] = []
    cursor = chart_start
    max_points = 2000
    while cursor <= window_end and len(chart) < max_points:
        next_bucket = _bucket_next(cursor, granularity)
        while (
            idx < len(ordered)
            and ordered[idx].transaction_date < next_bucket
            and ordered[idx].transaction_date <= window_end
        ):
            apply(ordered[idx])
            idx += 1

        closing = sum(current_by_investment.values())
        cum_pnl = sum(pnl_by_investment.values())
        roi = compute_roi_from_pnl(cum_pnl, closing)
        chart.append({
            "period": _bucket_label(cursor, granularity),
            "roi_pct": round(roi, 2) if roi is not None else None,
            "roi_unavailable": roi is None,
            "closing_value": round(closing, 4),
        })
        cursor = next_bucket
    return chart


def _load_dashboard(
    db: Session,
    investor_id: uuid.UUID | None,
    period: str,
    granularity: str,
    start_date: str | None,
    end_date: str | None,
    *,
    display_currency: str | None = None,
) -> dict:
    """
    Charge un dashboard complet en faisant le MINIMUM de requêtes SQL :
      - 1 requête sur CurrencyRate (via RateCache)
      - 1 requête sur Investment (+ agrégation en mémoire)
      - 1 requête sur Transaction (+ agrégation en un seul passage)
    Toutes les KPIs et le graphique sont dérivés de ces trois lectures.

    `display_currency` (optionnel) — devise d'affichage choisie par l'utilisateur.
    Quand fourni, les agrégats sont calculés directement dans cette devise.
    Si la transaction/investment est déjà dans cette devise, aucune conversion
    n'est faite → pas d'erreur de précision flottante (sinon double aller-retour
    USD→HTG→USD donne des arrondis du type 600,03 au lieu de 600,00).
    """
    if granularity not in _VALID_GRANULARITIES:
        granularity = "month"

    window_start, window_end = _resolve_window(period, start_date, end_date)
    chart_start = _bucket_start(window_start, granularity)

    target = (display_currency or BASE_CCY).upper()

    rates = RateCache(db)
    missing: set[str] = set()

    # Investissements actifs (1 requête).
    # On EXCLUT le compte société Valmere & Co : AUM représente l'argent
    # géré pour les investisseurs réels, pas la trésorerie société. Le solde
    # société est exposé séparément via /api/investors/_meta/global-stats
    # (et affiché comme tuile dédiée sur le dashboard admin).
    inv_q = (
        db.query(Investment)
        .join(Investor, Investor.id == Investment.investor_id)
        .filter(Investment.status == "active", Investor.status == "active", Investor.is_company.is_(False))
    )
    if investor_id:
        inv_q = inv_q.filter(Investment.investor_id == investor_id)
    investments = inv_q.all()
    total_initial = sum(
        _to_base(rates, i.initial_capital, getattr(i, "currency", None), missing, target=target)
        for i in investments
    )

    # Transactions (1 requête) — restreintes au POOL (investisseurs réels)
    # uniquement. Le compte société Valmere & Co a ses propres transactions
    # (les 80 % de chaque distribution P&L) qui ne doivent PAS gonfler les
    # tuiles de l'AUM, du graphique ou du résultat période — sinon on
    # mélange « ce qu'on gère pour les clients » et « ce qu'on garde en
    # propre ». La trésorerie société est exposée à part via /global-stats.
    tx_q = (
        db.query(Transaction)
        .join(Investor, Investor.id == Transaction.investor_id)
        .join(Investment, Investment.id == Transaction.investment_id)
        .filter(
            Investor.status == "active",
            Investor.is_company.is_(False),
            Investment.status == "active",
            Transaction.status == "active",
        )
    )
    if investor_id:
        tx_q = tx_q.filter(Transaction.investor_id == investor_id)
    txs = tx_q.all()

    # Reconstruction depuis les transactions natives (pas via
    # investment.current_value qui est figé dans une devise unique et
    # introduit du drift float USD↔HTG). Une seule conversion par tx →
    # exact quand tx.currency == target.
    agg = _aggregate_transactions(
        txs, rates, window_start, window_end, chart_start, granularity, missing,
        target_ccy=target,
    )

    realized_pnl = round(agg["realized_total"], 4)
    net_deposits = round(agg["deposits_total"], 4)
    current_by_investment = _current_values_by_investment(
        investments,
        txs,
        rates,
        target,
        missing,
    )
    initial_seed_total = sum(
        initial_seed_by_investment(investments, txs, rates, target, missing).values()
    )
    # AUM = capital initial + flux nets + P&L réalisé du POOL.
    # Cohérent avec total_initial (déjà filtré pool dans inv_q ci-dessus).
    aum = sum(current_by_investment.values())
    # « Capital investi » : argent réellement mis (apport initial + dépôts)
    # moins les retraits, indépendamment des P&L. Si aucun mouvement de
    # cash (cas legacy avant l'auto-création de la transaction "Capital
    # initial"), on retombe sur l'initial_capital de l'investment pour
    # garder un chiffre cohérent.
    total_invested = round(initial_seed_total + net_deposits, 4)
    # ROI global = bénéfice réalisé / VA globale (admin / caissier).
    # Demande métier : on n'utilise plus Modified Dietz par rapport au capital
    # initial — c'est plus simple et plus parlant pour le dashboard
    # (% que représente le bénéfice par rapport à la valeur en gestion).
    global_roi = compute_roi_from_pnl(realized_pnl, aum)
    roi_unavailable = global_roi is None

    chart_data = _build_chart_from_transactions(
        investments,
        txs,
        rates,
        target,
        missing,
        chart_start,
        window_end,
        granularity,
    )

    return {
        "rates": rates,
        "missing": missing,
        "window_start": window_start,
        "window_end": window_end,
        "granularity": granularity,
        "investments": investments,
        "total_initial": total_initial,
        "total_invested": total_invested,
        "aum": aum,
        "realized_pnl": realized_pnl,
        "net_deposits": net_deposits,
        "global_roi": global_roi,
        "roi_unavailable": roi_unavailable,
        "agg": agg,
        "chart_data": chart_data,
        # Devise dans laquelle TOUS les chiffres ci-dessus sont exprimés.
        # Renvoyée au front pour qu'il sache quoi mettre comme suffixe et
        # éviter de re-convertir (no-op).
        "currency": target,
    }


def _pnl_response_fields(agg: dict) -> dict:
    """Construit les champs pnl_3d..pnl_730d à partir de l'agrégat (0 requête)."""
    out = {}
    for d in _STANDARD_PERIODS:
        out[f"pnl_{d}d"] = round(agg["pnl_by_days"][d], 4)
    return out


@router.get("/admin")
def admin_dashboard(
    investor_id: uuid.UUID | None = None,
    period: str = Query("30d"),
    granularity: str = Query("month"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    currency: str | None = Query(None),
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    ctx = _load_dashboard(
        db, investor_id, period, granularity, start_date, end_date,
        display_currency=currency,
    )

    # Exclure la personne morale Valmere & Co des comptages :
    # le tableau de bord parle des investisseurs réels, pas du compte société.
    total_investors = (
        db.query(func.count(Investor.id))
        .filter(Investor.status == "active", Investor.is_company.is_(False))
        .scalar()
    )
    unread_messages = (
        db.query(func.count(Message.id))
        .filter(Message.read_at.is_(None))
        .scalar()
    )

    return {
        # `base_currency` reflète désormais la devise effective des montants
        # ci-dessous : si l'utilisateur a USD comme devise du topbar, tout est
        # déjà en USD côté backend (zéro conversion côté frontend).
        "base_currency": ctx["currency"],
        "total_investors": total_investors,
        "aum": ctx["aum"],
        "total_initial_capital": ctx["total_initial"],
        "total_invested": ctx["total_invested"],
        "total_gain": ctx["realized_pnl"],
        "net_deposits": ctx["net_deposits"],
        "global_roi_pct": ctx["global_roi"],
        "roi_unavailable": ctx["roi_unavailable"],
        "pnl_period": round(ctx["agg"]["pnl_period"], 4),
        **_pnl_response_fields(ctx["agg"]),
        "unread_messages": unread_messages,
        "chart_data": ctx["chart_data"],
        "window": {
            "start": ctx["window_start"].isoformat(),
            "end": ctx["window_end"].isoformat(),
            "granularity": ctx["granularity"],
        },
        "rates_missing": sorted(ctx["missing"]),
    }


@router.get("/investor")
def investor_dashboard(
    period: str = Query("30d"),
    granularity: str = Query("month"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    currency: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("admin", "cashier") and not current_user.investor_id:
        return {"error": "Aucun profil investisseur associé"}

    inv_id = current_user.investor_id
    ctx = _load_dashboard(
        db, inv_id, period, granularity, start_date, end_date,
        display_currency=currency,
    )

    return {
        "base_currency": ctx["currency"],
        "total_initial_capital": ctx["total_initial"],
        "total_invested": ctx["total_invested"],
        "total_current_value": ctx["aum"],
        "total_gain": ctx["realized_pnl"],
        "net_deposits": ctx["net_deposits"],
        "roi_pct": ctx["global_roi"],
        "roi_unavailable": ctx["roi_unavailable"],
        "pnl_period": round(ctx["agg"]["pnl_period"], 4),
        **_pnl_response_fields(ctx["agg"]),
        "chart_data": ctx["chart_data"],
        "window": {
            "start": ctx["window_start"].isoformat(),
            "end": ctx["window_end"].isoformat(),
            "granularity": ctx["granularity"],
        },
        "rates_missing": sorted(ctx["missing"]),
    }
