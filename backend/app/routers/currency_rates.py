import uuid
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.currency_rate import CurrencyRate
from app.models.user import User
from app.models.transaction import Transaction
from app.models.investment import Investment
from app.models.journal_entry import JournalLine
from app.dependencies.auth import get_current_user, admin_or_analyst, admin_only
from app.services.brh_rates import fetch_brh_rates

router = APIRouter(prefix="/api/currency-rates", tags=["currency-rates"])


class RateCreate(BaseModel):
    from_currency: str = Field(min_length=2, max_length=10)
    to_currency: str = Field(min_length=2, max_length=10)
    rate: float = Field(gt=0)


class RateUpdate(BaseModel):
    rate: float = Field(gt=0)


@router.get("")
def list_rates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(CurrencyRate).order_by(CurrencyRate.from_currency, CurrencyRate.to_currency).all()


@router.post("", status_code=201)
def create_rate(
    body: RateCreate,
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    fc = body.from_currency.upper()
    tc = body.to_currency.upper()
    if fc == tc:
        raise HTTPException(400, "Les devises source et cible doivent etre differentes")

    existing = (
        db.query(CurrencyRate)
        .filter(CurrencyRate.from_currency == fc, CurrencyRate.to_currency == tc)
        .first()
    )
    if existing:
        existing.rate = body.rate
        existing.updated_by = current_user.id
        existing.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing

    rate = CurrencyRate(
        from_currency=fc,
        to_currency=tc,
        rate=body.rate,
        updated_by=current_user.id,
    )
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate


@router.put("/{rate_id}")
def update_rate(
    rate_id: uuid.UUID,
    body: RateUpdate,
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    r = db.query(CurrencyRate).filter(CurrencyRate.id == rate_id).first()
    if not r:
        raise HTTPException(404, "Taux introuvable")
    r.rate = body.rate
    r.updated_by = current_user.id
    r.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(r)
    return r


def _upsert(db: Session, fc: str, tc: str, rate: float, user_id):
    fc, tc = fc.upper(), tc.upper()
    if fc == tc or rate <= 0:
        return None
    existing = (
        db.query(CurrencyRate)
        .filter(CurrencyRate.from_currency == fc, CurrencyRate.to_currency == tc)
        .first()
    )
    if existing:
        existing.rate = rate
        existing.updated_by = user_id
        existing.updated_at = datetime.now(timezone.utc)
        return existing
    r = CurrencyRate(from_currency=fc, to_currency=tc, rate=rate, updated_by=user_id)
    db.add(r)
    return r


@router.post("/sync-brh")
def sync_brh(
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    """
    Fetch reference rates from the Banque de la République d'Haïti (BRH)
    and upsert USD↔HTG and EUR↔HTG (with both directions).
    """
    try:
        data = fetch_brh_rates()
    except Exception as e:
        raise HTTPException(502, f"Impossible de récupérer les taux BRH: {e}")

    updated = []
    usd_htg = data.get("USD_HTG")
    eur_htg = data.get("EUR_HTG")

    if usd_htg:
        _upsert(db, "USD", "HTG", usd_htg, current_user.id)
        _upsert(db, "HTG", "USD", round(1.0 / usd_htg, 8), current_user.id)
        updated += ["USD→HTG", "HTG→USD"]

    if eur_htg:
        _upsert(db, "EUR", "HTG", eur_htg, current_user.id)
        _upsert(db, "HTG", "EUR", round(1.0 / eur_htg, 8), current_user.id)
        updated += ["EUR→HTG", "HTG→EUR"]

        if usd_htg:
            # Cross rate EUR↔USD derived from the two pairs against HTG
            eur_usd = round(eur_htg / usd_htg, 6)
            _upsert(db, "EUR", "USD", eur_usd, current_user.id)
            _upsert(db, "USD", "EUR", round(1.0 / eur_usd, 8), current_user.id)
            updated += ["EUR→USD", "USD→EUR"]

    db.commit()

    return {
        "source": data.get("source"),
        "date": data.get("date"),
        "USD_HTG": usd_htg,
        "EUR_HTG": eur_htg,
        "updated": updated,
    }


class NormalizeRequest(BaseModel):
    from_currency: str = Field(min_length=2, max_length=10)
    to_currency: str = Field(min_length=2, max_length=10)
    rate: float = Field(gt=0, description="1 {from_currency} = rate × {to_currency}")
    dry_run: bool = Field(default=False, description="If true, only count affected rows — no write.")


@router.post("/normalize")
def normalize_currency(
    body: NormalizeRequest,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """
    Réécrit toutes les données libellées dans `from_currency` pour les
    exprimer dans `to_currency`, à taux fixe `rate`.

    Concerne :
      - transactions  (amount *= rate, currency = to)
      - investments   (initial_capital, current_value *= rate, currency = to)
      - journal_lines (original_amount *= rate, original_currency = to)
                      ⚠ Les colonnes debit/credit restent intouchées car
                      elles sont déjà dans la devise de base (HTG) — seule
                      la trace de la devise d'origine est remise à jour.

    Opération irréversible. Utilisée quand une devise est retirée du menu
    de l'app (ex: CAD) mais que des données historiques restent dans cette
    devise et bloquent les rapports.

    `dry_run=true` → renvoie seulement les compteurs sans écrire.
    """
    fc = body.from_currency.upper()
    tc = body.to_currency.upper()
    if fc == tc:
        raise HTTPException(400, "Source et cible identiques")

    rate = Decimal(str(body.rate))

    # Count first (serves both preview and idempotency check).
    tx_q = db.query(Transaction).filter(Transaction.currency == fc)
    inv_q = db.query(Investment).filter(Investment.currency == fc)
    ln_q = db.query(JournalLine).filter(JournalLine.original_currency == fc)

    tx_count = tx_q.count()
    inv_count = inv_q.count()
    ln_count = ln_q.count()

    if body.dry_run:
        return {"tx": tx_count, "inv": inv_count, "lines": ln_count, "dry_run": True}

    if tx_count + inv_count + ln_count == 0:
        return {"tx": 0, "inv": 0, "lines": 0}

    # Apply : on itère en Python plutôt qu'en UPDATE bulk pour garder
    # la précision Decimal et laisser les onupdate timestamps jouer.
    for tx in tx_q.all():
        if tx.amount is not None:
            tx.amount = float((Decimal(str(tx.amount)) * rate).quantize(Decimal("0.0001")))
        tx.currency = tc

    for inv in inv_q.all():
        if inv.initial_capital is not None:
            inv.initial_capital = float((Decimal(str(inv.initial_capital)) * rate).quantize(Decimal("0.0001")))
        if inv.current_value is not None:
            inv.current_value = float((Decimal(str(inv.current_value)) * rate).quantize(Decimal("0.0001")))
        inv.currency = tc

    for ln in ln_q.all():
        if ln.original_amount is not None:
            ln.original_amount = float((Decimal(str(ln.original_amount)) * rate).quantize(Decimal("0.0001")))
        ln.original_currency = tc
        # fx_rate relates to HTG base, not to original currency — no update.

    db.commit()
    return {"tx": tx_count, "inv": inv_count, "lines": ln_count}


@router.delete("/{rate_id}", status_code=204)
def delete_rate(
    rate_id: uuid.UUID,
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    r = db.query(CurrencyRate).filter(CurrencyRate.id == rate_id).first()
    if not r:
        raise HTTPException(404, "Taux introuvable")
    db.delete(r)
    db.commit()
