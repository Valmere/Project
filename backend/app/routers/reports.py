import uuid
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
import io
from jose import jwt, JWTError

from app.database import get_db
from app.models.report import Report
from app.models.investor import Investor
from app.models.investment import Investment
from app.models.transaction import Transaction
from app.models.performance import Performance
from app.models.user import User
from app.models.company_settings import CompanySettings
from app.dependencies.auth import get_current_user, admin_or_analyst
from app.services import excel_service, storage_service
from app.services.currency import MissingRateError
from app.config import settings

router = APIRouter(prefix="/api/reports", tags=["reports"])

MIME = {"pdf": "application/pdf", "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
EXT = {"excel": "xlsx", "pdf": "pdf"}


class GenerateRequest(BaseModel):
    investor_id: uuid.UUID
    format: str = "excel"  # "excel" only
    report_type: str = "statement"
    period_start: date | None = None
    period_end: date | None = None
    lang: str = "fr"
    display_currency: str = "HTG"


class MyGenerateRequest(BaseModel):
    period_start: date | None = None
    period_end: date | None = None
    lang: str = "fr"
    display_currency: str = "HTG"
    report_type: str = "statement"


def _build_report(
    db: Session,
    investor_id: uuid.UUID,
    generated_by: uuid.UUID,
    *,
    report_type: str,
    period_start: date | None,
    period_end: date | None,
    lang: str,
    display_currency: str,
) -> Report:
    """Factorise la génération d'un relevé Excel (admin + investisseur auto)."""
    investor = db.query(Investor).filter(Investor.id == investor_id).first()
    if not investor:
        raise HTTPException(404, "Investisseur introuvable")

    investment = db.query(Investment).filter(Investment.investor_id == investor_id).first()
    if not investment:
        raise HTTPException(404, "Aucun investissement trouvé pour cet investisseur")

    tx_query = db.query(Transaction).filter(Transaction.investor_id == investor_id)
    if period_start:
        tx_query = tx_query.filter(Transaction.transaction_date >= period_start)
    if period_end:
        tx_query = tx_query.filter(Transaction.transaction_date <= period_end)
    txs = tx_query.order_by(Transaction.transaction_date.desc()).all()

    performances = (
        db.query(Performance)
        .filter(Performance.investor_id == investor_id)
        .order_by(Performance.period_end.desc())
        .all()
    )

    report = Report(
        investor_id=investor_id,
        investment_id=investment.id,
        report_type=report_type,
        format="excel",
        period_start=period_start,
        period_end=period_end,
        status="generating",
        generated_by=generated_by,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    try:
        company = db.query(CompanySettings).first()
        file_bytes = excel_service.generate_statement(
            investor, investment, txs, performances,
            period_start, period_end,
            lang=lang,
            display_currency=display_currency,
            db=db,
            company=company,
        )
        storage_path = f"{investor_id}/{report.id}.xlsx"
        storage_service.upload_file(settings.SUPABASE_REPORTS_BUCKET, storage_path, file_bytes, MIME["excel"])

        report.storage_path = storage_path
        report.status = "ready"
        report.generated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(report)
    except MissingRateError as exc:
        report.status = "error"
        report.error_message = str(exc)
        db.commit()
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        report.status = "error"
        report.error_message = str(exc)
        db.commit()
        raise HTTPException(500, f"Erreur lors de la génération : {exc}")

    return report


@router.post("/generate", status_code=201)
def generate_report(
    body: GenerateRequest,
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    if body.format != "excel":
        raise HTTPException(400, "Seul le format Excel est supporté actuellement")
    return _build_report(
        db,
        body.investor_id,
        current_user.id,
        report_type=body.report_type,
        period_start=body.period_start,
        period_end=body.period_end,
        lang=body.lang,
        display_currency=body.display_currency,
    )


@router.post("/my/generate", status_code=201)
def generate_my_statement(
    body: MyGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """L'investisseur connecté génère lui-même son propre relevé pour une période."""
    if not current_user.investor_id:
        raise HTTPException(403, "Aucun investisseur lié à ce compte")
    return _build_report(
        db,
        current_user.investor_id,
        current_user.id,
        report_type=body.report_type,
        period_start=body.period_start,
        period_end=body.period_end,
        lang=body.lang,
        display_currency=body.display_currency,
    )


@router.get("/my/preview")
def preview_my_statement(
    period_start: date | None = None,
    period_end: date | None = None,
    display_currency: str = "HTG",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Renvoie la structure du relevé (résumé + transactions filtrées par période)
    pour un rendu à l'écran avant génération du fichier Excel.
    Montants convertis dans `display_currency`.
    """
    from app.services.currency import convert_amount, MissingRateError  # noqa

    if not current_user.investor_id:
        raise HTTPException(403, "Aucun investisseur lié à ce compte")

    investor = db.query(Investor).filter(Investor.id == current_user.investor_id).first()
    investment = db.query(Investment).filter(Investment.investor_id == current_user.investor_id).first()
    if not investor or not investment:
        raise HTTPException(404, "Données introuvables")

    display_ccy = (display_currency or "HTG").upper()
    inv_ccy = (getattr(investment, "currency", None) or "HTG").upper()

    tx_query = db.query(Transaction).filter(Transaction.investor_id == investor.id)
    if period_start:
        tx_query = tx_query.filter(Transaction.transaction_date >= period_start)
    if period_end:
        tx_query = tx_query.filter(Transaction.transaction_date <= period_end)
    txs = tx_query.order_by(Transaction.transaction_date.desc()).all()

    try:
        initial_native = float(investment.initial_capital or 0)
        current_native = float(investment.current_value or 0)
        initial = convert_amount(db, initial_native, inv_ccy, display_ccy)
        current = convert_amount(db, current_native, inv_ccy, display_ccy)

        pnl = 0.0
        net_deposits = 0.0
        tx_out = []
        for tx in txs:
            tx_ccy = (getattr(tx, "currency", None) or "HTG").upper()
            amt = convert_amount(db, float(tx.amount or 0), tx_ccy, display_ccy)
            if tx.type == "gain":
                pnl += amt
            elif tx.type in ("loss", "fee"):
                pnl -= amt
            elif tx.type == "deposit":
                net_deposits += amt
            elif tx.type == "withdrawal":
                net_deposits -= amt
            tx_out.append({
                "id": str(tx.id),
                "date": str(tx.transaction_date),
                "type": (tx.type or "").lower(),
                "converted_amount": amt,
                "original_amount": float(tx.amount or 0),
                "original_currency": tx_ccy,
                "description": tx.description or None,
                "reference": getattr(tx, "reference", None),
            })
    except MissingRateError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    roi = (pnl / initial * 100) if initial else 0

    return {
        "investor": {
            "id": str(investor.id),
            "full_name": investor.full_name,
            "code": investor.code,
            "entry_date": str(investor.entry_date) if investor.entry_date else None,
            "status": investor.status,
        },
        "investment": {
            "start_date": str(getattr(investment, "start_date", None)) if getattr(investment, "start_date", None) else None,
            "currency": inv_ccy,
            "initial_capital_native": initial_native,
            "current_value_native": current_native,
        },
        "display_currency": display_ccy,
        "summary": {
            "initial": initial,
            "current": current,
            "pnl": pnl,
            "roi_pct": roi,
            "net_deposits": net_deposits,
        },
        "transactions": tx_out,
        "period": {
            "start": str(period_start) if period_start else None,
            "end": str(period_end) if period_end else None,
        },
    }


@router.get("")
def list_reports(
    investor_id: uuid.UUID | None = None,
    current_user: User = Depends(admin_or_analyst),
    db: Session = Depends(get_db),
):
    q = db.query(Report).filter(Report.status == "ready")
    if investor_id:
        q = q.filter(Report.investor_id == investor_id)
    return q.order_by(Report.generated_at.desc()).all()


@router.get("/my")
def my_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.investor_id:
        return []
    return (
        db.query(Report)
        .filter(Report.investor_id == current_user.investor_id, Report.status == "ready")
        .order_by(Report.generated_at.desc())
        .all()
    )


@router.get("/{report_id}/download")
def download_report(
    report_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Rapport introuvable")

    if current_user.role == "investor" and str(report.investor_id) != str(current_user.investor_id):
        raise HTTPException(403, "Accès refusé")

    if report.status != "ready" or not report.storage_path:
        raise HTTPException(400, "Rapport non disponible")

    file_bytes = storage_service.download_file(settings.SUPABASE_REPORTS_BUCKET, report.storage_path)

    report.download_count = (report.download_count or 0) + 1
    db.commit()

    ext = EXT.get(report.format, report.format)
    content_type = MIME.get(report.format, "application/octet-stream")

    investor = db.query(Investor).filter(Investor.id == report.investor_id).first()
    tx_count = (
        db.query(Transaction).filter(Transaction.investor_id == report.investor_id).count()
    )
    gen_date = (report.generated_at or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    safe_name = _safe_filename(investor.full_name if investor else "Investor")
    filename = f"{safe_name}_{gen_date}_{tx_count}tx.{ext}"

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _safe_filename(name: str) -> str:
    import re
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", (name or "").strip())
    return cleaned.strip("_") or "Investor"


# ───────────────────────────────────────────────────────────────────────────
#  On-screen viewer + share
# ───────────────────────────────────────────────────────────────────────────

class ShareResponse(BaseModel):
    token: str
    url: str
    expires_at: str


def _authorize_report_access(report: Report, user: User):
    """L'investisseur ne peut accéder qu'à ses propres rapports, l'admin à tous."""
    if user.role == "investor" and str(report.investor_id) != str(user.investor_id):
        raise HTTPException(403, "Accès refusé")


def _build_view_payload(db: Session, report: Report, display_currency: str = "HTG") -> dict:
    """
    Produit la même structure que `/my/preview`, mais figée sur la période
    du rapport et l'investisseur lié. Utilisée par l'écran de visualisation.
    """
    from app.services.currency import convert_amount, MissingRateError  # noqa

    investor = db.query(Investor).filter(Investor.id == report.investor_id).first()
    investment = db.query(Investment).filter(Investment.investor_id == report.investor_id).first()
    if not investor or not investment:
        raise HTTPException(404, "Données introuvables")

    display_ccy = (display_currency or "HTG").upper()
    inv_ccy = (getattr(investment, "currency", None) or "HTG").upper()

    tx_q = db.query(Transaction).filter(Transaction.investor_id == investor.id)
    if report.period_start:
        tx_q = tx_q.filter(Transaction.transaction_date >= report.period_start)
    if report.period_end:
        tx_q = tx_q.filter(Transaction.transaction_date <= report.period_end)
    txs = tx_q.order_by(Transaction.transaction_date.desc()).all()

    try:
        initial_native = float(investment.initial_capital or 0)
        current_native = float(investment.current_value or 0)
        initial = convert_amount(db, initial_native, inv_ccy, display_ccy)
        current = convert_amount(db, current_native, inv_ccy, display_ccy)

        pnl = 0.0
        net_deposits = 0.0
        tx_out = []
        for tx in txs:
            tx_ccy = (getattr(tx, "currency", None) or "HTG").upper()
            amt = convert_amount(db, float(tx.amount or 0), tx_ccy, display_ccy)
            if tx.type == "gain":
                pnl += amt
            elif tx.type in ("loss", "fee"):
                pnl -= amt
            elif tx.type == "deposit":
                net_deposits += amt
            elif tx.type == "withdrawal":
                net_deposits -= amt
            tx_out.append({
                "id": str(tx.id),
                "date": str(tx.transaction_date),
                "type": (tx.type or "").lower(),
                "converted_amount": amt,
                "original_amount": float(tx.amount or 0),
                "original_currency": tx_ccy,
                "description": tx.description or None,
                "reference": getattr(tx, "reference", None),
            })
    except MissingRateError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    roi = (pnl / initial * 100) if initial else 0

    company = db.query(CompanySettings).first()

    return {
        "report": {
            "id": str(report.id),
            "report_type": report.report_type,
            "generated_at": report.generated_at.isoformat() if report.generated_at else None,
            "download_count": report.download_count or 0,
        },
        "company": {
            "company_name": getattr(company, "company_name", None) or "Valmere & Co",
            "company_type": getattr(company, "company_type", None),
            "logo_url": getattr(company, "logo_url", None),
            "primary_color": getattr(company, "primary_color", None),
            "secondary_color": getattr(company, "secondary_color", None),
        },
        "investor": {
            "id": str(investor.id),
            "full_name": investor.full_name,
            "code": investor.code,
            "entry_date": str(investor.entry_date) if investor.entry_date else None,
            "status": investor.status,
        },
        "investment": {
            "start_date": str(getattr(investment, "start_date", None)) if getattr(investment, "start_date", None) else None,
            "currency": inv_ccy,
            "initial_capital_native": initial_native,
            "current_value_native": current_native,
        },
        "display_currency": display_ccy,
        "summary": {
            "initial": initial,
            "current": current,
            "pnl": pnl,
            "roi_pct": roi,
            "net_deposits": net_deposits,
        },
        "transactions": tx_out,
        "period": {
            "start": str(report.period_start) if report.period_start else None,
            "end": str(report.period_end) if report.period_end else None,
        },
    }


@router.get("/{report_id}/view")
def view_report(
    report_id: uuid.UUID,
    display_currency: str = "HTG",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Renvoie le contenu du rapport pour un affichage à l'écran (admin ou investisseur)."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Rapport introuvable")
    _authorize_report_access(report, current_user)
    return _build_view_payload(db, report, display_currency)


@router.post("/{report_id}/share", response_model=ShareResponse)
def share_report(
    report_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retourne un lien public signé (JWT) permettant à n'importe qui de
    télécharger ce rapport pendant 72 h. L'accès est vérifié avant :
    l'investisseur ne peut partager QUE ses propres rapports.
    """
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Rapport introuvable")
    _authorize_report_access(report, current_user)
    if report.status != "ready" or not report.storage_path:
        raise HTTPException(400, "Rapport non disponible")

    exp = datetime.now(timezone.utc) + timedelta(hours=72)
    payload = {
        "scope": "report_share",
        "rid": str(report.id),
        "iss_uid": str(current_user.id),
        "exp": exp,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    base = str(request.base_url).rstrip("/")
    url = f"{base}/api/reports/shared/download?token={token}"

    return ShareResponse(token=token, url=url, expires_at=exp.isoformat())


@router.get("/shared/download")
def download_shared_report(
    token: str,
    db: Session = Depends(get_db),
):
    """Téléchargement public via lien partagé (aucune authentification requise)."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Lien invalide ou expiré")

    if payload.get("scope") != "report_share":
        raise HTTPException(401, "Lien invalide")

    rid = payload.get("rid")
    if not rid:
        raise HTTPException(401, "Lien invalide")

    report = db.query(Report).filter(Report.id == uuid.UUID(rid)).first()
    if not report or report.status != "ready" or not report.storage_path:
        raise HTTPException(404, "Rapport introuvable")

    file_bytes = storage_service.download_file(settings.SUPABASE_REPORTS_BUCKET, report.storage_path)

    report.download_count = (report.download_count or 0) + 1
    db.commit()

    ext = EXT.get(report.format, report.format)
    content_type = MIME.get(report.format, "application/octet-stream")

    investor = db.query(Investor).filter(Investor.id == report.investor_id).first()
    gen_date = (report.generated_at or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    safe_name = _safe_filename(investor.full_name if investor else "Investor")
    filename = f"{safe_name}_{gen_date}.{ext}"

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
