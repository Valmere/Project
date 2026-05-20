import uuid
import secrets
import string
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.investor import Investor
from app.models.investment import Investment
from app.models.transaction import Transaction
from app.models.report import Report
from app.models.user import User
from app.dependencies.auth import get_current_user, admin_or_cashier, admin_only
from app.services.currency import RateCache
from app.services.roi_calculator import compute_roi_from_pnl
from app.services.auth_service import hash_password
from app.services.user_identity import make_unique_username
from app.services import approvals_service
from app.services.portfolio_math import portfolio_totals_by_investor

router = APIRouter(prefix="/api/investors", tags=["investors"])


class InvestorCreate(BaseModel):
    full_name: str
    email: str | None = None
    phone: str | None = None
    entry_date: date
    investment_duration_months: int | None = None
    notes: str | None = None
    # Capital initial (peut être 0). Si > 0, on crée automatiquement
    # l'investment principal + une transaction `deposit` à la `entry_date`
    # avec le libellé « Capital initial ». Si == 0, on crée juste l'investment
    # à 0 (l'investisseur peut commencer sans apport).
    initial_capital: float = 0
    initial_capital_currency: str = "HTG"


class InvestorUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    status: str | None = None
    activation_mode: str | None = None
    investment_duration_months: int | None = None
    notes: str | None = None


def _next_code(db: Session) -> str:
    max_number = 0
    for (code,) in db.query(Investor.code).filter(Investor.code.like("INV-%")).all():
        suffix = (code or "").rsplit("-", 1)[-1]
        if suffix.isdigit():
            max_number = max(max_number, int(suffix))
    return f"INV-{max_number + 1:04d}"


def _generate_temp_password(length: int = 10) -> str:
    """
    Mot de passe temporaire lisible : majuscules + minuscules + chiffres.
    Évite les caractères ambigus (O/0, l/1) pour faciliter la lecture.
    """
    alphabet = "".join(c for c in (string.ascii_letters + string.digits) if c not in "Oo0lI1")
    return "".join(secrets.choice(alphabet) for _ in range(length))


_TX_SIGNS = {
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
_CASH_FLOW_TYPES = {
    "deposit",
    "initial",
    "initial_capital",
    "withdrawal",
    "bailout",
    "company_bailout",
    "company_withdrawal",
}


def _tx_sort_key(tx: Transaction) -> tuple:
    created_at = getattr(tx, "created_at", None)
    return (
        tx.transaction_date or date.min,
        created_at.isoformat() if created_at else "",
        str(getattr(tx, "id", "")),
    )


def _to_display_ccy(rates: RateCache, amount: float, currency: str | None, target: str) -> float:
    return rates.convert(float(amount or 0), currency or target, target, strict=False)


def _cash_flow_amount(tx: Transaction, rates: RateCache, target: str) -> float:
    if (tx.type or "").lower() == "bailout" and getattr(tx, "display_amount", None) is not None:
        currency = getattr(tx, "display_currency", None) or getattr(tx, "currency", None) or target
        return _to_display_ccy(rates, float(tx.display_amount or 0), currency, target)
    return _to_display_ccy(rates, float(tx.amount or 0), getattr(tx, "currency", None), target)


def _portfolio_values_from_transactions(
    investments: list[Investment],
    txs: list[Transaction],
    rates: RateCache,
    target: str,
    company_investor_ids: set[uuid.UUID] | None = None,
) -> tuple[dict[uuid.UUID, float], dict[uuid.UUID, float]]:
    totals = portfolio_totals_by_investor(
        investments,
        txs,
        rates,
        target,
        company_investor_ids=company_investor_ids,
    )
    return totals["current_by_investor"], totals["initial_by_investor"]


def _share_base(value: float | None) -> float:
    """Negative current values count as 0 when computing ownership shares."""
    return max(float(value or 0), 0.0)


def _company_share_from_investor_global_shares(
    investor_share_bases: list[float],
    company_share_basis: float,
) -> float:
    """
    Company/global share displayed on the dashboard.

    Business rule: it must mirror the Investor page by using
    100% - sum(Part / Entreprise for active investors). Investor shares use
    `_share_base`, so negative current values count as 0 in the share basis.
    """
    global_total = sum(investor_share_bases) + company_share_basis
    if global_total <= 0:
        return 0.0
    investor_share_pct_total = sum(
        round((basis / global_total) * 100, 4)
        for basis in investor_share_bases
        if basis > 0
    )
    return round(max(0.0, min(100.0, 100.0 - investor_share_pct_total)), 4)


def _invested_from_transactions(
    txs: list[Transaction],
    rates: RateCache,
    target: str,
) -> dict[uuid.UUID, float]:
    invested_by_inv: dict[uuid.UUID, float] = {}
    for tx in txs:
        if tx.type not in _CASH_FLOW_TYPES:
            continue
        sign = _TX_SIGNS.get(tx.type, 0)
        if not sign:
            continue
        amount = _cash_flow_amount(tx, rates, target)
        invested_by_inv[tx.investor_id] = invested_by_inv.get(tx.investor_id, 0.0) + sign * amount
    return invested_by_inv


def _auto_create_or_link_user(db: Session, investor: Investor) -> dict | None:
    """
    À la création d'un investisseur avec un email :
      - si un User existe déjà avec cet email → on le lie (fix pour les comptes
        comme "Blade" créés avant le nouveau flow) et on ne renvoie pas de mot
        de passe (il en a déjà un).
      - sinon → on crée un User avec un mot de passe temporaire, role=investor,
        must_change_password=True. Le mot de passe clair est renvoyé UNE FOIS
        à l'admin pour qu'il le transmette.
    Retourne None si aucun email n'est associé à l'investisseur.
    """
    if not investor.email:
        return None

    email = investor.email.strip().lower()
    existing = db.query(User).filter(func.lower(func.trim(User.email)) == email).first()
    if existing:
        if not existing.investor_id:
            existing.investor_id = investor.id
            db.flush()
        return {
            "created": False,
            "linked": True,
            "email": existing.email,
            "temp_password": None,
        }

    temp_password = _generate_temp_password()
    user = User(
        email=email,
        username=make_unique_username(db, None, email, investor.full_name),
        hashed_password=hash_password(temp_password),
        full_name=investor.full_name,
        role="investor",
        investor_id=investor.id,
        must_change_password=True,
    )
    db.add(user)
    db.flush()
    return {
        "created": True,
        "linked": True,
        "email": user.email,
        "temp_password": temp_password,
    }


def _liquidate_investor_assets(db: Session, investor: Investor) -> None:
    investor.status = "inactive"
    today = date.today()
    for investment in (
        db.query(Investment)
        .filter(Investment.investor_id == investor.id, Investment.status == "active")
        .all()
    ):
        investment.status = "inactive"
        investment.end_date = today


def _reactivate_investor_assets(
    db: Session,
    investor: Investor,
    *,
    mode: str | None,
    user_id: uuid.UUID | None,
) -> None:
    mode = (mode or "restore").lower()
    if mode not in ("restore", "restart"):
        raise HTTPException(400, "Mode de reactivation invalide")

    investor.status = "active"
    if mode == "restore":
        restored = False
        for investment in (
            db.query(Investment)
            .filter(Investment.investor_id == investor.id, Investment.status == "inactive")
            .all()
        ):
            investment.status = "active"
            investment.end_date = None
            restored = True
        if restored:
            return

    has_active = (
        db.query(func.count(Investment.id))
        .filter(Investment.investor_id == investor.id, Investment.status == "active")
        .scalar()
        or 0
    )
    if has_active:
        return

    latest = (
        db.query(Investment)
        .filter(Investment.investor_id == investor.id)
        .order_by(Investment.created_at.desc())
        .first()
    )
    db.add(
        Investment(
            investor_id=investor.id,
            name="Portefeuille Principal",
            currency=(getattr(latest, "currency", None) or "HTG").upper(),
            initial_capital=0,
            current_value=0,
            start_date=date.today(),
            status="active",
            created_by=user_id,
        )
    )


@router.get("")
def list_investors(
    include_company: bool = False,
    status: str | None = None,
    currency: str | None = None,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    """
    Liste les investisseurs avec leur VA et leurs parts (pool + global).

    - `include_company=False` (défaut) : exclut la ligne société Valmere & Co
      pour ne pas polluer les vues « Investisseurs ». Le dashboard peut la
      demander explicitement avec `include_company=true`.
    - `status` : filtre `'active'` ou `'inactive'` (sinon tout).
    - `currency` : devise d'affichage. Sans ce paramètre on retourne en HTG ;
      sinon on convertit directement vers la devise demandée. Évite le
      double-arrondi USD→HTG→USD qui produit des chiffres comme 600,03 $.

    Quand l'investment est déjà dans la devise demandée, aucune conversion
    n'est appliquée (RateCache.convert renvoie l'amount tel quel).
    """
    BASE = (currency or "HTG").upper()
    rates = RateCache(db)

    q = db.query(Investor)
    if not include_company:
        q = q.filter(Investor.is_company.is_(False))
    if status in ("active", "inactive"):
        q = q.filter(Investor.status == status)

    investors = q.order_by(Investor.created_at.desc()).all()
    all_pool = (
        db.query(Investor)
        .filter(Investor.is_company.is_(False), Investor.status == "active")
        .all()
    )
    company = db.query(Investor).filter(Investor.is_company.is_(True)).first()
    context_ids = {i.id for i in investors} | {i.id for i in all_pool}
    if company:
        context_ids.add(company.id)

    investments = (
        db.query(Investment)
        .filter(Investment.investor_id.in_(context_ids), Investment.status == "active")
        .all()
        if context_ids
        else []
    )
    all_txs = (
        db.query(Transaction)
        .filter(Transaction.investor_id.in_(context_ids), Transaction.status == "active")
        .all()
        if context_ids
        else []
    )
    company_ids = {company.id} if company else None
    totals = portfolio_totals_by_investor(
        investments,
        all_txs,
        rates,
        BASE,
        company_investor_ids=company_ids,
    )
    current_by_inv = totals["current_by_investor"]
    initial_by_inv = totals["initial_by_investor"]
    invested_by_inv = totals["invested_by_investor"]

    # Totaux pour les pourcentages — toujours calculés sur l'univers complet
    # (pool actif + société), indépendamment des filtres d'affichage.
    pool_total = sum(_share_base(current_by_inv.get(p.id, 0.0)) for p in all_pool)
    company_total = _share_base(current_by_inv.get(company.id, 0.0)) if company else 0.0
    global_total = pool_total + company_total

    rows: list[dict] = []
    for inv in investors:
        cur_v = current_by_inv.get(inv.id, 0.0)
        ini_v = initial_by_inv.get(inv.id, 0.0)
        # Société : exclue du pool, mais comptée dans le global.
        share_basis = _share_base(cur_v)
        is_active = inv.status == "active"
        if inv.is_company or inv.status != "active":
            share_pool = 0.0
        else:
            share_pool = (share_basis / pool_total) if pool_total > 0 else 0.0
        share_global = (share_basis / global_total) if is_active and global_total > 0 else 0.0
        negative_share_marker = is_active and cur_v < 0

        invested = invested_by_inv.get(inv.id, 0.0)

        rows.append({
            "id": str(inv.id),
            "code": inv.code,
            "full_name": inv.full_name,
            "email": inv.email,
            "phone": inv.phone,
            "status": inv.status,
            "entry_date": inv.entry_date.isoformat() if inv.entry_date else None,
            "investment_duration_months": inv.investment_duration_months,
            "notes": inv.notes,
            "is_company": bool(inv.is_company),
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
            # Champs dérivés
            "initial_capital": round(ini_v, 4),
            "total_invested": round(invested, 4),
            "current_value": round(cur_v, 4),
            "share_pct_pool": round(share_pool * 100, 4),
            "share_pct_global": round(share_global * 100, 4),
            "share_pct_pool_negative": bool(negative_share_marker and not inv.is_company),
            "share_pct_global_negative": bool(negative_share_marker),
            "base_currency": BASE,
        })
    return rows


@router.post("", status_code=201)
def create_investor(
    body: InvestorCreate,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    if body.initial_capital is not None and body.initial_capital < 0:
        raise HTTPException(400, "Le capital initial ne peut pas être négatif")

    # On exclut nos champs « capital initial » du payload Investor — ils ne
    # sont pas des colonnes de la table mais drivent la création des entités
    # liées (investment + transaction « Capital initial »).
    investor_payload = body.model_dump(exclude={"initial_capital", "initial_capital_currency"})
    investor = Investor(**investor_payload, code=_next_code(db), created_by=current_user.id)
    db.add(investor)
    db.flush()  # investor.id disponible pour les FKs

    initial = float(body.initial_capital or 0)
    currency = (body.initial_capital_currency or "HTG").upper()

    investment = Investment(
        investor_id=investor.id,
        name="Portefeuille Principal",
        currency=currency,
        initial_capital=initial,
        current_value=initial,
        start_date=body.entry_date,
        status="active",
        created_by=current_user.id,
    )
    db.add(investment)
    db.flush()

    if initial > 0:
        # Trace l'apport initial dans le journal des transactions afin que
        # toute la mécanique (rapports, somme des deposits, audit) le voie
        # comme un dépôt classique. Distinguable via la description.
        deposit = Transaction(
            investment_id=investment.id,
            investor_id=investor.id,
            type="deposit",
            amount=initial,
            currency=currency,
            transaction_date=body.entry_date,
            description="Capital initial",
            created_by=current_user.id,
        )
        db.add(deposit)

    account_info = _auto_create_or_link_user(db, investor)
    db.commit()
    db.refresh(investor)

    # Auto-posting comptable best-effort (silencieux si plan comptable absent).
    if initial > 0:
        try:
            from app.services.accounting_posting import ensure_posted_for_transaction, PostingError
            tx_to_post = (
                db.query(Transaction)
                .filter(Transaction.investor_id == investor.id, Transaction.description == "Capital initial", Transaction.status == "active")
                .order_by(Transaction.created_at.desc())
                .first()
            )
            if tx_to_post:
                ensure_posted_for_transaction(db, tx_to_post, posted_by=current_user.id)
        except Exception:
            db.rollback()

    from sqlalchemy import inspect as sa_inspect
    data = {c.key: getattr(investor, c.key) for c in sa_inspect(investor).mapper.column_attrs}
    data["account"] = account_info
    data["initial_capital"] = initial
    data["initial_capital_currency"] = currency
    return data


@router.get("/{investor_id}")
def get_investor(
    investor_id: uuid.UUID,
    currency: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    investor = db.query(Investor).filter(Investor.id == investor_id).first()
    if not investor:
        raise HTTPException(404, "Investisseur introuvable")
    if current_user.role == "investor" and current_user.investor_id != investor_id:
        raise HTTPException(403, "Accès refusé")

    # Enrichi avec VA + parts (pool / global), comme la liste — la fiche
    # détail doit donner les mêmes chiffres pour la cohérence.
    # Conversion directe vers la devise demandée pour éviter les arrondis
    # du round-trip via HTG.
    BASE = (currency or "HTG").upper()
    rates = RateCache(db)

    # Helper local : reconstruit la VA d'un investisseur depuis ses transactions
    # natives (pas de drift float USD↔HTG via investment.current_value).
    def _va_from_txs(inv_uuid: uuid.UUID, *, is_company: bool = False) -> tuple[float, float]:
        investments = (
            db.query(Investment)
            .filter(Investment.investor_id == inv_uuid, Investment.status == "active")
            .all()
        )
        txs = (
            db.query(Transaction)
            .filter(Transaction.investor_id == inv_uuid, Transaction.status == "active")
            .all()
        )
        current_by_inv, initial_by_inv = _portfolio_values_from_transactions(
            investments,
            txs,
            rates,
            BASE,
            company_investor_ids={inv_uuid} if is_company else None,
        )
        return current_by_inv.get(inv_uuid, 0.0), initial_by_inv.get(inv_uuid, 0.0)

    cur_v, ini_v = _va_from_txs(investor.id)

    # Totaux pool / global pour calculer les %, mêmes règles.
    pool_invs = (
        db.query(Investor)
        .filter(Investor.is_company.is_(False), Investor.status == "active")
        .all()
    )
    pool_total = sum(_share_base(_va_from_txs(p.id)[0]) for p in pool_invs)
    company = db.query(Investor).filter(Investor.is_company.is_(True)).first()
    company_total = _share_base(_va_from_txs(company.id, is_company=True)[0]) if company else 0.0
    global_total = pool_total + company_total

    share_basis = _share_base(cur_v)
    is_active = investor.status == "active"
    if investor.is_company or investor.status != "active":
        share_pool = 0.0
    else:
        share_pool = (share_basis / pool_total) if pool_total > 0 else 0.0
    share_global = (share_basis / global_total) if is_active and global_total > 0 else 0.0
    negative_share_marker = is_active and cur_v < 0

    return {
        "id": str(investor.id),
        "code": investor.code,
        "full_name": investor.full_name,
        "email": investor.email,
        "phone": investor.phone,
        "status": investor.status,
        "entry_date": investor.entry_date.isoformat() if investor.entry_date else None,
        "investment_duration_months": investor.investment_duration_months,
        "notes": investor.notes,
        "is_company": bool(investor.is_company),
        "created_at": investor.created_at.isoformat() if investor.created_at else None,
        "initial_capital": round(ini_v, 4),
        "current_value": round(cur_v, 4),
        "share_pct_pool": round(share_pool * 100, 4),
        "share_pct_global": round(share_global * 100, 4),
        "share_pct_pool_negative": bool(negative_share_marker and not investor.is_company),
        "share_pct_global_negative": bool(negative_share_marker),
        "base_currency": BASE,
    }


@router.put("/{investor_id}")
def update_investor(
    investor_id: uuid.UUID,
    body: InvestorUpdate,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    investor = db.query(Investor).filter(Investor.id == investor_id).first()
    if not investor:
        raise HTTPException(404, "Investisseur introuvable")

    payload = body.model_dump(exclude_none=True)
    activation_mode = payload.pop("activation_mode", None)
    next_status = payload.pop("status", None)

    for field, value in payload.items():
        setattr(investor, field, value)

    if next_status:
        if next_status not in ("active", "inactive", "suspended"):
            raise HTTPException(400, "Statut invalide")
        current_status = investor.status
        if investor.is_company:
            investor.status = next_status
        elif next_status == "inactive" and current_status != "inactive":
            _liquidate_investor_assets(db, investor)
        elif next_status == "active" and current_status != "active":
            _reactivate_investor_assets(
                db,
                investor,
                mode=activation_mode,
                user_id=current_user.id,
            )
        else:
            investor.status = next_status

    db.commit()
    db.refresh(investor)
    return investor


@router.get("/_meta/global-stats")
def global_stats(
    currency: str | None = None,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    """
    Métriques globales : VA pool, VA société, VA globale, ratio entreprise/pool.
    Utilisé par les tuiles du dashboard admin.

    `currency` : devise d'affichage. Sans, on retourne en HTG. Conversion
    directe (pas de double aller-retour via HTG → erreurs de précision
    flottante évitées).
    """
    BASE = (currency or "HTG").upper()
    rates = RateCache(db)

    # Reconstruire la VA depuis les transactions natives au lieu de lire
    # `investment.current_value` (figé en HTG) — évite la drift float USD↔HTG.
    # Une seule conversion par transaction, identité quand devise déjà = BASE.
    def _va(investor_id: uuid.UUID, *, is_company: bool = False) -> float:
        investments = (
            db.query(Investment)
            .filter(Investment.investor_id == investor_id, Investment.status == "active")
            .all()
        )
        txs = (
            db.query(Transaction)
            .filter(Transaction.investor_id == investor_id, Transaction.status == "active")
            .all()
        )
        current_by_inv, _initial_by_inv = _portfolio_values_from_transactions(
            investments,
            txs,
            rates,
            BASE,
            company_investor_ids={investor_id} if is_company else None,
        )
        return current_by_inv.get(investor_id, 0.0)

    pool_total = 0.0
    investor_share_bases: list[float] = []
    pool_count_active = 0
    pool_count_inactive = 0
    for p in db.query(Investor).filter(Investor.is_company.is_(False)).all():
        if p.status == "active":
            pool_count_active += 1
            value = _va(p.id)
            pool_total += value
            investor_share_bases.append(_share_base(value))
        else:
            pool_count_inactive += 1

    company = db.query(Investor).filter(Investor.is_company.is_(True)).first()
    company_total = _va(company.id, is_company=True) if company else 0.0
    company_share_basis = _share_base(company_total)

    return {
        "base_currency": BASE,
        "pool_va": round(pool_total, 4),
        "company_va": round(company_total, 4),
        "global_va": round(pool_total + company_total, 4),
        "company_share_of_global": _company_share_from_investor_global_shares(
            investor_share_bases,
            company_share_basis,
        ),
        "active_investors": pool_count_active,
        "inactive_investors": pool_count_inactive,
        "company_id": str(company.id) if company else None,
    }


@router.get("/{investor_id}/summary")
def investor_summary(
    investor_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == "investor" and current_user.investor_id != investor_id:
        raise HTTPException(403, "Accès refusé")
    investor = db.query(Investor).filter(Investor.id == investor_id).first()
    if not investor:
        raise HTTPException(404, "Investisseur introuvable")

    BASE = "HTG"
    # Cache en mémoire des taux (1 seule requête sur CurrencyRate) — évite
    # la cascade N+1 quand on convertit 100+ transactions en boucle.
    rates = RateCache(db)
    missing: set[str] = set()

    def _to_base(amount, ccy):
        return rates.convert(amount, ccy or BASE, BASE, strict=False, missing=missing)

    if investor.status != "active" and not investor.is_company:
        investments = []
        txs = []
    else:
        investments = db.query(Investment).filter(Investment.investor_id == investor_id, Investment.status == "active").all()
        active_investment_ids = [investment.id for investment in investments]
        txs = (
            db.query(Transaction)
            .filter(
                Transaction.investor_id == investor_id,
                Transaction.investment_id.in_(active_investment_ids),
                Transaction.status == "active",
            )
            .all()
            if active_investment_ids
            else []
        )
    totals = portfolio_totals_by_investor(
        investments,
        txs,
        rates,
        BASE,
        company_investor_ids={investor_id} if investor.is_company else None,
    )
    total_initial = totals["initial_by_investor"].get(investor_id, 0.0)
    total_current = totals["current_by_investor"].get(investor_id, 0.0)
    total_invested = totals["invested_by_investor"].get(investor_id, 0.0)
    realized_pnl = totals["pnl_by_investor"].get(investor_id, 0.0)

    # Bénéfice réalisé et apports nets, dérivés des transactions (pas de current − initial naïf).
    net_deposits = 0.0
    for tx in txs:
        if tx.type in ("deposit", "bailout", "company_bailout"):
            amt = _cash_flow_amount(tx, rates, BASE)
            net_deposits += amt
        elif tx.type in ("withdrawal", "company_withdrawal"):
            amt = _cash_flow_amount(tx, rates, BASE)
            net_deposits -= amt

    roi_pct = compute_roi_from_pnl(realized_pnl, total_current)

    return {
        "investor": investor,
        "base_currency": BASE,
        "total_initial_capital": total_initial,
        "total_invested": round(total_invested, 4),
        "total_current_value": total_current,
        "total_gain": round(realized_pnl, 4),
        "net_deposits": round(net_deposits, 4),
        "roi_pct": roi_pct,
        "roi_unavailable": roi_pct is None,
        "active_investments": len(investments),
        "rates_missing": sorted(missing),
    }


class InvestorLoginCreate(BaseModel):
    email: str | None = None
    password: str | None = None  # optional — if omitted, a temp one is generated
    full_name: str | None = None


@router.post("/auto-link-users")
def auto_link_users(
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """
    Pour chaque investisseur avec email mais sans User lié, si un User existe
    déjà avec le même email et n'est lié à aucun investisseur, on les associe.
    Corrige les comptes « orphelins » créés avant l'introduction du flow
    automatique (cas typique : Blade).
    """
    linked = []
    investors = db.query(Investor).filter(Investor.email.isnot(None)).all()
    for inv in investors:
        already = db.query(User).filter(User.investor_id == inv.id).first()
        if already:
            continue
        match = (
            db.query(User)
            .filter(func.lower(func.trim(User.email)) == inv.email.strip().lower())
            .filter(User.investor_id.is_(None))
            .first()
        )
        if match:
            match.investor_id = inv.id
            linked.append({
                "investor_id": str(inv.id),
                "investor_name": inv.full_name,
                "user_email": match.email,
            })
    db.commit()
    return {"linked_count": len(linked), "linked": linked}


@router.get("/{investor_id}/login-account")
def get_login_account(
    investor_id: uuid.UUID,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    """
    Renvoie le compte User lié à cet investisseur (ou null si pas encore créé).
    Utilisé par l'interface admin pour savoir si un login existe déjà.
    """
    user = db.query(User).filter(User.investor_id == investor_id).first()
    if not user:
        return {"linked": False}
    return {
        "linked": True,
        "user_id": str(user.id),
        "email": user.email,
        "username": user.username,
        "is_active": user.is_active,
    }


@router.post("/{investor_id}/create-login", status_code=201)
def create_login_for_investor(
    investor_id: uuid.UUID,
    body: InvestorLoginCreate,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """
    Crée (ou regénère) le compte de connexion d'un investisseur existant
    qui n'aurait pas encore de login (par ex. créé sans email à l'origine).
    Si `password` est omis, un mot de passe temporaire est généré et renvoyé.
    Le compte est marqué `must_change_password=True` pour forcer le changement
    à la première connexion.
    """
    investor = db.query(Investor).filter(Investor.id == investor_id).first()
    if not investor:
        raise HTTPException(404, "Investisseur introuvable")

    email = (body.email or investor.email or "").strip().lower()
    if not email:
        raise HTTPException(400, "Un email est requis pour créer un compte")

    if db.query(User).filter(User.investor_id == investor_id).first():
        raise HTTPException(409, "Cet investisseur a déjà un compte de connexion")
    if db.query(User).filter(func.lower(func.trim(User.email)) == email).first():
        raise HTTPException(409, "Un compte avec cet email existe déjà")

    password = body.password or _generate_temp_password()
    if len(password) < 8:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 8 caractères")

    user = User(
        email=email,
        username=make_unique_username(db, None, email, body.full_name or investor.full_name),
        hashed_password=hash_password(password),
        full_name=body.full_name or investor.full_name,
        role="investor",
        investor_id=investor.id,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "user_id": str(user.id),
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "investor_id": str(investor.id),
        "temp_password": password if not body.password else None,
    }


class DeleteRequestBody(BaseModel):
    reason: str | None = None


@router.delete("/{investor_id}")
def delete_investor(
    investor_id: uuid.UUID,
    body: DeleteRequestBody | None = None,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    """
    Admin : supprime l'investisseur et ses dépendances immédiatement.
    Caissier : la demande est mise en file d'attente et doit être validée
    par un admin (réponse 202 + objet PendingAction).
    """
    investor = db.query(Investor).filter(Investor.id == investor_id).first()
    if not investor:
        raise HTTPException(404, "Investisseur introuvable")

    reason = body.reason if body else None

    if current_user.role == "admin":
        # Exécution directe via le même dispatcher, pour garder la même logique.
        from app.models.pending_action import PendingAction as _PA
        fake = _PA(
            action_type="delete_investor",
            target_type="investor",
            target_id=investor_id,
            reason=reason,
            requested_by=current_user.id,
            status="executed",
        )
        approvals_service._execute_delete_investor(db, fake, current_user)  # type: ignore[attr-defined]
        db.commit()
        return {"deleted": True, "investor_id": str(investor_id)}

    # Caissier : file d'attente.
    pa = approvals_service.queue_action(
        db,
        requested_by=current_user,
        action_type=approvals_service.ACTION_DELETE_INVESTOR,
        target_type="investor",
        target_id=investor_id,
        reason=reason,
    )
    return {
        "queued": True,
        "pending_action_id": str(pa.id),
        "message": "Demande envoyée à l'administrateur pour approbation.",
    }


@router.get("/{investor_id}/reports")
def investor_reports(
    investor_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == "investor" and str(current_user.investor_id) != str(investor_id):
        raise HTTPException(403, "Accès refusé")
    return (
        db.query(Report)
        .filter(Report.investor_id == investor_id, Report.status == "ready")
        .order_by(Report.generated_at.desc())
        .all()
    )
