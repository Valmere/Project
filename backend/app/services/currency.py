from sqlalchemy.orm import Session
from app.models.currency_rate import CurrencyRate


# Devise de base : toutes les autres devises sont configurées par rapport
# à HTG (soit HTG→X, soit X→HTG). La triangulation utilise HTG comme pivot.
BASE_CCY = "HTG"


# ─────────────────────────────────────────────────────────────────────────────
# Cache de taux par requête (perf)
# -----------------------------------------------------------------------------
# Les dashboards et rapports convertissent plusieurs milliers de montants en
# boucle. Faire un SELECT par conversion explose le temps de réponse.
# `RateCache` charge TOUS les taux en une seule requête et résout ensuite
# direct / inverse / triangulation en mémoire.
# ─────────────────────────────────────────────────────────────────────────────
class RateCache:
    """Snapshot en mémoire de la table CurrencyRate, optimisé pour les boucles chaudes."""

    def __init__(self, db: Session):
        self._rates: dict[tuple[str, str], float] = {}
        for r in db.query(CurrencyRate).all():
            fc = (r.from_currency or "").upper()
            tc = (r.to_currency or "").upper()
            if fc and tc:
                self._rates[(fc, tc)] = float(r.rate)

    def _direct(self, fc: str, tc: str) -> float | None:
        if fc == tc:
            return 1.0
        r = self._rates.get((fc, tc))
        if r is not None:
            return r
        inv = self._rates.get((tc, fc))
        if inv and inv != 0:
            return 1.0 / inv
        return None

    def get(self, from_currency: str, to_currency: str) -> float | None:
        fc = (from_currency or "").upper()
        tc = (to_currency or "").upper()
        if not fc or not tc:
            return None
        r = self._direct(fc, tc)
        if r is not None:
            return r
        if fc != BASE_CCY and tc != BASE_CCY:
            r1 = self._direct(fc, BASE_CCY)
            r2 = self._direct(BASE_CCY, tc)
            if r1 is not None and r2 is not None:
                return r1 * r2
        return None

    def convert(
        self,
        amount: float,
        from_currency: str,
        to_currency: str,
        *,
        strict: bool = True,
        missing: set[str] | None = None,
    ) -> float:
        fc = (from_currency or "").upper()
        tc = (to_currency or "").upper()
        val = float(amount or 0)
        if fc == tc:
            return val
        rate = self.get(fc, tc)
        if rate is None:
            if missing is not None:
                missing.add(f"{fc}→{tc}")
            if strict:
                raise MissingRateError(fc, tc)
            return val
        return val * rate


class MissingRateError(Exception):
    """Levée quand aucun chemin de conversion n'existe entre deux devises."""

    def __init__(self, from_currency: str, to_currency: str):
        self.from_currency = from_currency
        self.to_currency = to_currency
        super().__init__(
            f"Taux de change manquant : {from_currency} → {to_currency}. "
            f"Configurez-le dans « Taux de change »."
        )


def _direct_rate(db: Session, fc: str, tc: str) -> float | None:
    """Cherche un taux direct ou inverse en base, sans triangulation."""
    if fc == tc:
        return 1.0

    direct = (
        db.query(CurrencyRate)
        .filter(CurrencyRate.from_currency == fc, CurrencyRate.to_currency == tc)
        .first()
    )
    if direct:
        return float(direct.rate)

    inverse = (
        db.query(CurrencyRate)
        .filter(CurrencyRate.from_currency == tc, CurrencyRate.to_currency == fc)
        .first()
    )
    if inverse and float(inverse.rate) != 0:
        return 1.0 / float(inverse.rate)

    return None


def get_rate(db: Session, from_currency: str, to_currency: str) -> float | None:
    """
    Retourne le taux de conversion `from_currency → to_currency`.

    Ordre d'essais :
      1. Paire directe en base (fc → tc)
      2. Paire inverse en base (tc → fc), inversée mathématiquement
      3. Triangulation via HTG : fc → HTG → tc

    Retourne None si aucun chemin n'existe.
    """
    fc = (from_currency or "").upper()
    tc = (to_currency or "").upper()
    if not fc or not tc:
        return None

    # 1 & 2 : direct / inverse
    r = _direct_rate(db, fc, tc)
    if r is not None:
        return r

    # 3 : triangulation via la devise de base (HTG)
    if fc != BASE_CCY and tc != BASE_CCY:
        r_from = _direct_rate(db, fc, BASE_CCY)
        r_to = _direct_rate(db, BASE_CCY, tc)
        if r_from is not None and r_to is not None:
            return r_from * r_to

    return None


def convert_amount(
    db: Session,
    amount: float,
    from_currency: str,
    to_currency: str,
    *,
    strict: bool = True,
) -> float:
    """
    Convertit `amount` de `from_currency` vers `to_currency`.

    - Si `strict=True` (défaut) : lève `MissingRateError` quand aucun taux n'est
      disponible. C'est le comportement sûr : on préfère échouer bruyamment
      plutôt que d'afficher des montants non convertis qui semblent corrects.
    - Si `strict=False` : retourne le montant original en fallback silencieux.
      Réservé aux cas où un taux manquant est acceptable (ex: logs).
    """
    fc = (from_currency or "").upper()
    tc = (to_currency or "").upper()
    if fc == tc:
        return float(amount)

    rate = get_rate(db, fc, tc)
    if rate is None:
        if strict:
            raise MissingRateError(fc, tc)
        return float(amount)

    return float(amount) * rate
