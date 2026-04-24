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
from app.dependencies.auth import get_current_user, admin_or_analyst, admin_only
from app.services.currency import convert_amount, RateCache
from app.services.roi_calculator import compute_roi
from app.services.auth_service import hash_password

router = APIRouter(prefix="/api/investors", tags=["investors"])


class InvestorCreate(BaseModel):
    full_name: str
    email: str | None = None
    phone: str | None = None
    entry_date: date
    investment_duration_months: int | None = None
    notes: str | None = None


class InvestorUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    status: str | None = None
    investment_duration_months: int | None = None
    notes: str | None = None


def _next_code(db: Session) -> str:
    count = db.query(func.count(Investor.id)).scalar() or 0
    return f"INV-{count + 1:04d}"


def _generate_temp_password(length: int = 10) -> str:
    """
    Mot de passe temporaire lisible : majuscules + minuscules + chiffres.
    Évite les caractères ambigus (O/0, l/1) pour faciliter la lecture.
    """
    alphabet = "".join(c for c in (string.ascii_letters + string.digits) if c not in "Oo0lI1")
    return "".join(secrets.choice(alphabet) for _ in range(length))


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
    existing = db.query(User).filter(func.lower(User.email) == email).first()
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
        email=investor.email,
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


@router.get("")
def list_investors(
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    return db.query(Investor).order_by(Investor.created_at.desc()).all()


@router.post("", status_code=201)
def create_investor(
    body: InvestorCreate,
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    investor = Investor(**body.model_dump(), code=_next_code(db), created_by=current_user.id)
    db.add(investor)
    db.flush()  # assign investor.id before linking a User

    account_info = _auto_create_or_link_user(db, investor)
    db.commit()
    db.refresh(investor)

    # Shape: ORM fields of investor + an optional `account` block carrying the
    # one-shot temp password (so the admin can communicate it to the investor).
    from sqlalchemy import inspect as sa_inspect
    data = {c.key: getattr(investor, c.key) for c in sa_inspect(investor).mapper.column_attrs}
    data["account"] = account_info
    return data


@router.get("/{investor_id}")
def get_investor(
    investor_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    investor = db.query(Investor).filter(Investor.id == investor_id).first()
    if not investor:
        raise HTTPException(404, "Investisseur introuvable")
    if current_user.role == "investor" and current_user.investor_id != investor_id:
        raise HTTPException(403, "Accès refusé")
    return investor


@router.put("/{investor_id}")
def update_investor(
    investor_id: uuid.UUID,
    body: InvestorUpdate,
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    investor = db.query(Investor).filter(Investor.id == investor_id).first()
    if not investor:
        raise HTTPException(404, "Investisseur introuvable")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(investor, field, value)
    db.commit()
    db.refresh(investor)
    return investor


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

    investments = db.query(Investment).filter(Investment.investor_id == investor_id, Investment.status == "active").all()
    total_initial = sum(_to_base(i.initial_capital, getattr(i, "currency", None)) for i in investments)
    total_current = sum(_to_base(i.current_value, getattr(i, "currency", None)) for i in investments)

    # Bénéfice réalisé et apports nets, dérivés des transactions (pas de current − initial naïf).
    txs = db.query(Transaction).filter(Transaction.investor_id == investor_id).all()
    realized_pnl = 0.0
    net_deposits = 0.0
    for tx in txs:
        amt = _to_base(tx.amount, getattr(tx, "currency", None))
        if tx.type == "gain":
            realized_pnl += amt
        elif tx.type in ("loss", "fee"):
            realized_pnl -= amt
        elif tx.type == "deposit":
            net_deposits += amt
        elif tx.type == "withdrawal":
            net_deposits -= amt

    roi_pct = compute_roi(total_initial, total_current, net_deposits) if total_initial > 0 else 0

    return {
        "investor": investor,
        "base_currency": BASE,
        "total_initial_capital": total_initial,
        "total_current_value": total_current,
        "total_gain": round(realized_pnl, 4),
        "net_deposits": round(net_deposits, 4),
        "roi_pct": roi_pct,
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
            .filter(func.lower(User.email) == inv.email.strip().lower())
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
    current_user: User = Depends(admin_or_analyst),
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

    email = (body.email or investor.email or "").strip()
    if not email:
        raise HTTPException(400, "Un email est requis pour créer un compte")

    if db.query(User).filter(User.investor_id == investor_id).first():
        raise HTTPException(409, "Cet investisseur a déjà un compte de connexion")
    if db.query(User).filter(func.lower(User.email) == email.lower()).first():
        raise HTTPException(409, "Un compte avec cet email existe déjà")

    password = body.password or _generate_temp_password()
    if len(password) < 8:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 8 caractères")

    user = User(
        email=email,
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
        "full_name": user.full_name,
        "investor_id": str(investor.id),
        "temp_password": password if not body.password else None,
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
