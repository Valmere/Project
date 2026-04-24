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
from app.dependencies.auth import get_current_user, admin_or_analyst
from app.services.roi_calculator import compute_roi
from app.services.currency import RateCache

# Short month labels (fr) for chart x-axis
_MONTHS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"]

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

# Canonical base currency used for all dashboard aggregates. The frontend then
# converts this to the user's chosen display currency via useRatesStore.
BASE_CCY = "HTG"

# Mapping des clés de période (côté UI) vers le nombre de jours à remonter.
_PERIOD_DAYS = {
    "3d": 3, "7d": 7, "15d": 15, "30d": 30, "60d": 60,
    "90d": 90, "180d": 180, "365d": 365, "730d": 730,
}
_STANDARD_PERIODS = (3, 7, 15, 30, 60, 90, 180, 365, 730)

_VALID_GRANULARITIES = {"day", "week", "month", "year"}


def _to_base(rates: RateCache, amount, ccy: str | None, missing: set[str] | None = None) -> float:
    """Conversion vers HTG via le cache en mémoire (0 requête SQL)."""
    return rates.convert(amount, ccy or BASE_CCY, BASE_CCY, strict=False, missing=missing)


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
) -> dict:
    """
    Unique passage sur la liste des transactions qui produit, en même temps :
      - realized_pnl_total, net_deposits_total (cumulés toutes dates)
      - pnl_period (somme gain-perte-frais sur [window_start, window_end])
      - pnl_by_days (P&L pour chaque période standard 3d..730d)
      - pnl_by_bucket / flow_by_bucket (pour le graphique, agrégés par bucket)
      - pnl_before / flow_before (cumul avant le début du graphique)
    Chaque montant est converti en HTG une seule fois via le cache.
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

    for tx in txs:
        amt = _to_base(rates, tx.amount, getattr(tx, "currency", None), missing)
        t = tx.type
        if t == "gain":
            sign, is_flow = 1, False
        elif t in ("loss", "fee"):
            sign, is_flow = -1, False
        elif t == "deposit":
            sign, is_flow = 1, True
        elif t == "withdrawal":
            sign, is_flow = -1, True
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
    """Construit la série [{period, roi_pct, closing_value}] à partir de l'agrégat."""
    chart: list[dict] = []
    cum_pnl = agg["pnl_before"]
    cum_flow = agg["flow_before"]
    cursor = chart_start
    max_points = 2000  # garde-fou pour granularité 'day' sur fenêtre énorme
    while cursor <= window_end and len(chart) < max_points:
        cum_pnl += agg["pnl_by_bucket"].get(cursor, 0.0)
        cum_flow += agg["flow_by_bucket"].get(cursor, 0.0)
        closing = total_initial + cum_pnl + cum_flow
        roi = (cum_pnl / total_initial * 100.0) if total_initial > 0 else 0.0
        chart.append({
            "period": _bucket_label(cursor, granularity),
            "roi_pct": round(roi, 2),
            "closing_value": round(closing, 4),
        })
        cursor = _bucket_next(cursor, granularity)
    return chart


def _load_dashboard(
    db: Session,
    investor_id: uuid.UUID | None,
    period: str,
    granularity: str,
    start_date: str | None,
    end_date: str | None,
) -> dict:
    """
    Charge un dashboard complet en faisant le MINIMUM de requêtes SQL :
      - 1 requête sur CurrencyRate (via RateCache)
      - 1 requête sur Investment (+ agrégation en mémoire)
      - 1 requête sur Transaction (+ agrégation en un seul passage)
    Toutes les KPIs et le graphique sont dérivés de ces trois lectures.
    """
    if granularity not in _VALID_GRANULARITIES:
        granularity = "month"

    window_start, window_end = _resolve_window(period, start_date, end_date)
    chart_start = _bucket_start(window_start, granularity)

    rates = RateCache(db)
    missing: set[str] = set()

    # Investissements actifs (1 requête)
    inv_q = db.query(Investment).filter(Investment.status == "active")
    if investor_id:
        inv_q = inv_q.filter(Investment.investor_id == investor_id)
    investments = inv_q.all()
    total_initial = sum(_to_base(rates, i.initial_capital, getattr(i, "currency", None), missing) for i in investments)
    aum = sum(_to_base(rates, i.current_value, getattr(i, "currency", None), missing) for i in investments)

    # Transactions (1 requête) + agrégation single-pass
    tx_q = db.query(Transaction)
    if investor_id:
        tx_q = tx_q.filter(Transaction.investor_id == investor_id)
    txs = tx_q.all()

    agg = _aggregate_transactions(
        txs, rates, window_start, window_end, chart_start, granularity, missing
    )

    realized_pnl = round(agg["realized_total"], 4)
    net_deposits = round(agg["deposits_total"], 4)
    global_roi = compute_roi(total_initial, aum, net_deposits) if total_initial > 0 else 0

    chart_data = _build_chart(total_initial, agg, chart_start, window_end, granularity)

    return {
        "rates": rates,
        "missing": missing,
        "window_start": window_start,
        "window_end": window_end,
        "granularity": granularity,
        "investments": investments,
        "total_initial": total_initial,
        "aum": aum,
        "realized_pnl": realized_pnl,
        "net_deposits": net_deposits,
        "global_roi": global_roi,
        "agg": agg,
        "chart_data": chart_data,
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
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    ctx = _load_dashboard(db, investor_id, period, granularity, start_date, end_date)

    total_investors = (
        db.query(func.count(Investor.id))
        .filter(Investor.status == "active")
        .scalar()
    )
    unread_messages = (
        db.query(func.count(Message.id))
        .filter(Message.read_at.is_(None))
        .scalar()
    )

    return {
        "base_currency": BASE_CCY,
        "total_investors": total_investors,
        "aum": ctx["aum"],
        "total_initial_capital": ctx["total_initial"],
        "total_gain": ctx["realized_pnl"],
        "net_deposits": ctx["net_deposits"],
        "global_roi_pct": ctx["global_roi"],
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("admin", "analyst") and not current_user.investor_id:
        return {"error": "Aucun profil investisseur associé"}

    inv_id = current_user.investor_id
    ctx = _load_dashboard(db, inv_id, period, granularity, start_date, end_date)

    return {
        "base_currency": BASE_CCY,
        "total_initial_capital": ctx["total_initial"],
        "total_current_value": ctx["aum"],
        "total_gain": ctx["realized_pnl"],
        "net_deposits": ctx["net_deposits"],
        "roi_pct": ctx["global_roi"],
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
