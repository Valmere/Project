"""
Service de distribution des bénéfices et pertes.

Règle métier :
  Quand l'admin enregistre un bénéfice ou une perte global de l'entreprise,
  le montant total est réparti selon une politique configurable :
    - `profit_share_company` (par défaut 80%) → personne morale Valmere & Co
    - `profit_share_investors` (par défaut 20%) → réparti entre les
       investisseurs ACTIFS (status='active', is_company=False) au pro-rata
       de leur part dans le pool (VA_inv / VA_pool).

  Une distribution génère atomiquement N+1 transactions partageant un même
  `distribution_id` (UUID), ce qui permet plus tard de visualiser ou annuler
  le groupe entier.

Conversion :
  Le montant de la distribution est exprimé dans une devise (par défaut HTG).
  Pour chaque investisseur ayant son investment dans une autre devise, on
  convertit via `RateCache` (échec strict si un taux manque — on refuse de
  distribuer une part « probablement fausse »).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.company_settings import CompanySettings
from app.models.investment import Investment
from app.models.investor import Investor
from app.models.transaction import Transaction
from app.models.user import User
from app.services.currency import RateCache, MissingRateError
from app.services.portfolio_math import portfolio_totals_by_investor
from app.services.roi_calculator import apply_transaction_to_value


# Type d'événement à distribuer.
DistributionKind = Literal["gain", "loss"]


# ─── Helpers de calcul des parts ──────────────────────────────────────────────


def get_company_investor(db: Session) -> Investor:
    """Retourne la ligne investor `is_company=True`. Lève si absente."""
    inv = db.query(Investor).filter(Investor.is_company.is_(True)).first()
    if not inv:
        raise HTTPException(
            500,
            "Compte société introuvable. Lancez la migration "
            "`alembic upgrade head` pour créer la ligne Valmere & Co.",
        )
    return inv


def _company_investment(db: Session, company_id: uuid.UUID) -> Investment:
    """Investment principal du compte société (créé par la migration)."""
    inv = (
        db.query(Investment)
        .filter(Investment.investor_id == company_id, Investment.status == "active")
        .order_by(Investment.created_at.asc())
        .first()
    )
    if not inv:
        raise HTTPException(500, "Aucun investment actif pour le compte société.")
    return inv


def get_settings(db: Session) -> CompanySettings:
    cs = db.query(CompanySettings).first()
    if not cs:
        raise HTTPException(500, "Paramètres de la société introuvables.")
    return cs


@dataclass
class InvestorShare:
    investor_id: uuid.UUID
    investor_code: str
    investor_name: str
    investment_id: uuid.UUID
    investment_currency: str
    current_value_in_base: float
    share_pct_pool: float          # part dans le pool (0..1)
    share_pct_global: float        # part dans VA globale (0..1, inclut société)


@dataclass
class DistributionPreview:
    kind: DistributionKind
    total_amount: float
    currency: str
    company_amount: float
    investors_pool_amount: float
    company_share_ratio: float
    investors_share_ratio: float
    company_investor_id: uuid.UUID
    pool_va_total_in_base: float
    base_currency: str
    investors: list[dict]          # [{investor_id, name, code, share_pct_pool, amount_in_currency}]


# ─── Snapshot du pool ─────────────────────────────────────────────────────────


def compute_pool_snapshot(
    db: Session,
    *,
    base_currency: str = "HTG",
) -> tuple[list[InvestorShare], float, float]:
    """
    Charge tous les investisseurs ACTIFS non-société, calcule leur VA convertie
    en `base_currency`, et retourne (parts, va_pool, va_company_only).

    Les investisseurs `status != 'active'` ou `is_company=True` ne participent
    PAS au pool (cohérent avec la règle : seuls les actifs encaissent les P&L).
    Le compte société est compté à part, pour calculer la VA globale.
    """
    rates = RateCache(db)

    pool_investors = (
        db.query(Investor)
        .filter(Investor.is_company.is_(False), Investor.status == "active")
        .all()
    )
    company_investor = (
        db.query(Investor).filter(Investor.is_company.is_(True)).first()
    )

    # Charge tous les investments en une seule requête → évite N+1.
    all_investor_ids = [i.id for i in pool_investors]
    if company_investor:
        all_investor_ids.append(company_investor.id)

    investments = (
        db.query(Investment)
        .filter(
            Investment.investor_id.in_(all_investor_ids),
            Investment.status == "active",
        )
        .all()
        if all_investor_ids
        else []
    )
    by_investor: dict[uuid.UUID, list[Investment]] = {}
    for inv in investments:
        by_investor.setdefault(inv.investor_id, []).append(inv)

    txs = (
        db.query(Transaction)
        .filter(
            Transaction.investor_id.in_(all_investor_ids),
            Transaction.status == "active",
        )
        .all()
        if all_investor_ids
        else []
    )
    totals = portfolio_totals_by_investor(
        investments,
        txs,
        rates,
        base_currency,
        company_investor_ids={company_investor.id} if company_investor else None,
    )

    def _total_va(inv_id: uuid.UUID) -> tuple[float, list[Investment]]:
        items = by_investor.get(inv_id, [])
        return totals["current_by_investor"].get(inv_id, 0.0), items

    # VA des investisseurs (pool).
    # Règle : seuls les investisseurs avec une VA STRICTEMENT POSITIVE
    # participent à la distribution. Un investisseur avec VA ≤ 0 a un
    # compte « endetté » qui doit d'abord être renfloué — il ne peut
    # pas avoir de part dans un bénéfice ni absorber une perte tant que
    # son compte n'est pas remis à flot. Il est donc exclu du pool.
    shares: list[InvestorShare] = []
    pool_total = 0.0
    for inv in pool_investors:
        va, items = _total_va(inv.id)
        if not items or va <= 0:
            # Pas d'investment OU VA non positive → ne participe pas.
            continue
        pool_total += va
        shares.append(
            InvestorShare(
                investor_id=inv.id,
                investor_code=inv.code,
                investor_name=inv.full_name,
                investment_id=items[0].id,
                investment_currency=getattr(items[0], "currency", None) or base_currency,
                current_value_in_base=va,
                share_pct_pool=0.0,        # rempli plus bas
                share_pct_global=0.0,
            )
        )

    # VA société (peut être négative, on l'expose telle quelle)
    company_va = 0.0
    if company_investor:
        company_va, _ = _total_va(company_investor.id)

    # Calcul des pourcentages — on garde 0 si pool vide (évite div/0).
    global_total = pool_total + company_va
    for s in shares:
        s.share_pct_pool = (s.current_value_in_base / pool_total) if pool_total > 0 else 0.0
        s.share_pct_global = (s.current_value_in_base / global_total) if global_total > 0 else 0.0

    return shares, pool_total, company_va


# ─── Aperçu (sans persistance) ────────────────────────────────────────────────


def preview_distribution(
    db: Session,
    *,
    amount: float,
    currency: str,
    kind: DistributionKind,
) -> DistributionPreview:
    """
    Calcule l'allocation prévue SANS écrire en base. Utilisé par le modal
    front pour afficher l'aperçu avant validation.
    """
    if amount is None or float(amount) <= 0:
        raise HTTPException(400, "Le montant doit être strictement positif.")
    if kind not in ("gain", "loss"):
        raise HTTPException(400, "Type invalide. Attendu : 'gain' ou 'loss'.")

    settings = get_settings(db)
    company_ratio = float(settings.profit_share_company)
    investors_ratio = float(settings.profit_share_investors)
    if abs((company_ratio + investors_ratio) - 1.0) > 1e-6:
        raise HTTPException(
            500,
            f"Politique invalide : {company_ratio} + {investors_ratio} ≠ 1.0. "
            "Corrigez les paramètres entreprise.",
        )

    company_inv = get_company_investor(db)

    # Snapshot dans la devise de la distribution → permet les calculs au pro-rata
    # sans triangulation à chaque ligne.
    shares, pool_total, _company_va = compute_pool_snapshot(db, base_currency=currency)

    if pool_total <= 0:
        raise HTTPException(
            422,
            "Aucun investisseur actif avec une valeur positive — distribution "
            "impossible. Ajoutez du capital aux investisseurs ou activez-les.",
        )

    company_amount = round(float(amount) * company_ratio, 4)
    investors_pool_amount = round(float(amount) * investors_ratio, 4)

    investors_breakdown: list[dict] = []
    distributed = 0.0
    for s in shares:
        line = round(investors_pool_amount * s.share_pct_pool, 4)
        distributed += line
        investors_breakdown.append({
            "investor_id": str(s.investor_id),
            "investor_code": s.investor_code,
            "investor_name": s.investor_name,
            "current_value": round(s.current_value_in_base, 4),
            "share_pct_pool": round(s.share_pct_pool * 100, 4),
            "amount": line,
        })

    # Reste d'arrondi : on l'attribue au plus gros porteur pour que la somme
    # des lignes investisseurs colle exactement à `investors_pool_amount`.
    rounding_residual = round(investors_pool_amount - distributed, 4)
    if abs(rounding_residual) >= 0.0001 and investors_breakdown:
        biggest = max(investors_breakdown, key=lambda r: r["amount"])
        biggest["amount"] = round(biggest["amount"] + rounding_residual, 4)

    return DistributionPreview(
        kind=kind,
        total_amount=float(amount),
        currency=currency,
        company_amount=company_amount,
        investors_pool_amount=investors_pool_amount,
        company_share_ratio=company_ratio,
        investors_share_ratio=investors_ratio,
        company_investor_id=company_inv.id,
        pool_va_total_in_base=pool_total,
        base_currency=currency,
        investors=investors_breakdown,
    )


# ─── Exécution (atomique) ─────────────────────────────────────────────────────


def execute_distribution(
    db: Session,
    *,
    amount: float,
    currency: str,
    kind: DistributionKind,
    transaction_date: date,
    notes: str | None,
    created_by: User,
) -> dict:
    """
    Crée toutes les transactions d'une distribution (1 société + N investisseurs)
    et met à jour les `current_value` des investments. Tout en une seule
    transaction DB — si une conversion de devise échoue, rien n'est écrit.

    Retourne le résumé : distribution_id + détails par bénéficiaire.
    """
    # Préview re-calculée au moment de l'exécution (les VA peuvent avoir bougé
    # entre l'aperçu front et le commit).
    preview = preview_distribution(db, amount=amount, currency=currency, kind=kind)
    distribution_id = uuid.uuid4()

    rates = RateCache(db)

    # 1) Transaction société
    company_inv = get_company_investor(db)
    company_investment = _company_investment(db, company_inv.id)
    try:
        company_amount_in_inv_ccy = rates.convert(
            preview.company_amount,
            currency,
            getattr(company_investment, "currency", None) or "HTG",
            strict=True,
        )
    except MissingRateError as e:
        raise HTTPException(422, str(e))

    company_tx = Transaction(
        investment_id=company_investment.id,
        investor_id=company_inv.id,
        type=kind,
        amount=preview.company_amount,
        currency=currency,
        transaction_date=transaction_date,
        description=(notes or f"Distribution {kind} — part société"),
        distribution_id=distribution_id,
        created_by=created_by.id,
    )
    db.add(company_tx)
    transactions_to_post = [company_tx]
    company_investment.current_value = apply_transaction_to_value(
        float(company_investment.current_value or 0), kind, company_amount_in_inv_ccy
    )

    # 2) Transactions investisseurs
    created_lines: list[dict] = []
    for line in preview.investors:
        investor_id = uuid.UUID(line["investor_id"])
        # On reprend l'investment principal de cet investisseur (le 1er actif).
        investment = (
            db.query(Investment)
            .filter(Investment.investor_id == investor_id, Investment.status == "active")
            .order_by(Investment.created_at.asc())
            .first()
        )
        if not investment:
            continue

        try:
            line_in_inv_ccy = rates.convert(
                line["amount"],
                currency,
                getattr(investment, "currency", None) or "HTG",
                strict=True,
            )
        except MissingRateError as e:
            raise HTTPException(422, str(e))

        tx = Transaction(
            investment_id=investment.id,
            investor_id=investor_id,
            type=kind,
            amount=line["amount"],
            currency=currency,
            transaction_date=transaction_date,
            description=(notes or f"Distribution {kind} — part investisseur"),
            distribution_id=distribution_id,
            created_by=created_by.id,
        )
        db.add(tx)
        transactions_to_post.append(tx)
        investment.current_value = apply_transaction_to_value(
            float(investment.current_value or 0), kind, line_in_inv_ccy
        )
        created_lines.append({
            "investor_id": str(investor_id),
            "investor_name": line["investor_name"],
            "amount": line["amount"],
            "share_pct_pool": line["share_pct_pool"],
        })

    # Auto-post distribution transactions into accounting when the default
    # chart of accounts is available. If accounting is not initialized yet,
    # the distribution still succeeds and can be caught by the backfill route.
    db.flush()
    try:
        from app.services.accounting_posting import (
            AccountCache,
            PostingError,
            ensure_posted_for_transaction,
        )

        accounts = AccountCache(db)
        for tx in transactions_to_post:
            ensure_posted_for_transaction(
                db,
                tx,
                rates=rates,
                accounts=accounts,
                posted_by=created_by.id,
                commit=False,
            )
    except PostingError:
        pass

    db.commit()

    return {
        "distribution_id": str(distribution_id),
        "kind": kind,
        "total_amount": preview.total_amount,
        "currency": currency,
        "company_amount": preview.company_amount,
        "investors_pool_amount": preview.investors_pool_amount,
        "company_share_ratio": preview.company_share_ratio,
        "investors_share_ratio": preview.investors_share_ratio,
        "lines": created_lines,
    }
