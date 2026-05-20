import uuid
import base64
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
import io
from jose import jwt, JWTError
from PIL import Image, ImageChops

from app.database import get_db
from app.models.report import Report
from app.models.investor import Investor
from app.models.investment import Investment
from app.models.transaction import Transaction
from app.models.performance import Performance
from app.models.user import User
from app.models.company_settings import CompanySettings
from app.dependencies.auth import get_current_user, admin_or_cashier
from app.services import excel_service, pdf_service, storage_service
from app.services.currency import MissingRateError
from app.services.roi_calculator import compute_roi_from_pnl
from app.services.portfolio_math import (
    TX_SIGNS,
    is_effective_pnl_tx,
    is_initial_capital_tx,
    latest_bailout_key_by_investment,
    transaction_business_amount_and_currency,
    tx_sort_key,
)
from app.config import settings

router = APIRouter(prefix="/api/reports", tags=["reports"])

MIME = {"pdf": "application/pdf", "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
EXT = {"excel": "xlsx", "pdf": "pdf"}


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _is_available(report: Report) -> bool:
    available_at = _as_utc(report.available_at)
    return available_at is None or available_at <= datetime.now(timezone.utc)


def _signature_png_bytes(data_url: str | None) -> bytes | None:
    if not data_url or "," not in data_url:
        return None
    try:
        _, payload = data_url.split(",", 1)
        raw = base64.b64decode(payload, validate=True)
        image = Image.open(io.BytesIO(raw)).convert("RGBA")
        full_box = (0, 0, image.width, image.height)
        alpha_bbox = image.getchannel("A").getbbox()
        bg = Image.new("RGBA", image.size, (255, 255, 255, 255))
        diff_bbox = ImageChops.difference(image, bg).getbbox()
        bbox = alpha_bbox if alpha_bbox and alpha_bbox != full_box else diff_bbox
        if bbox:
            pad = 12
            image = image.crop((
                max(0, bbox[0] - pad),
                max(0, bbox[1] - pad),
                min(image.width, bbox[2] + pad),
                min(image.height, bbox[3] + pad),
            ))
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()
    except Exception:
        return None


def _signature_storage_path(report: Report) -> str:
    return f"{report.investor_id}/{report.id}_signature.png"


def _signature_signed_url(report: Report) -> str | None:
    if not report.signature_name:
        return None
    try:
        return storage_service.get_signed_url(
            settings.SUPABASE_REPORTS_BUCKET,
            _signature_storage_path(report),
            expires_in=3600,
        )
    except Exception:
        return None


def _load_signature_data_url(report: Report) -> str | None:
    """Récupère la signature stockée et la renvoie sous forme de data: URL,
    prête à être réinjectée dans `pdf_service.generate_statement`.

    Utilisé lors de la régénération à la volée pour préserver la signature
    quand on rend le rapport dans la langue de l'investisseur.
    """
    if not report.signature_name:
        return None
    try:
        png = storage_service.download_file(
            settings.SUPABASE_REPORTS_BUCKET,
            _signature_storage_path(report),
        )
        if not png:
            return None
        b64 = base64.b64encode(png).decode("ascii")
        return f"data:image/png;base64,{b64}"
    except Exception:
        return None


def _render_report_bytes(
    db: Session,
    report: Report,
    *,
    lang: str,
    display_currency: str,
) -> bytes:
    """Régénère le fichier (PDF/Excel) d'un rapport existant dans la langue
    et la devise demandées, sans toucher au fichier stocké en bucket.

    - Conserve la période figée du rapport (period_start/end) — c'est la
      photo comptable validée par l'admin, elle ne doit pas bouger.
    - Conserve l'investisseur et l'investment liés.
    - Réapplique la signature (si présente) téléchargée depuis le storage.
    - Réutilise les helpers pdf_service / excel_service, donc le rendu reste
      strictement identique à la génération initiale, juste traduit.
    """
    investor = db.query(Investor).filter(Investor.id == report.investor_id).first()
    if not investor:
        raise HTTPException(404, "Investisseur introuvable")
    investment = None
    if report.investment_id:
        investment = (
            db.query(Investment).filter(Investment.id == report.investment_id).first()
        )
    if investment is None:
        investment = (
            db.query(Investment)
            .filter(Investment.investor_id == report.investor_id, Investment.status == "active")
            .first()
        )

    tx_q = db.query(Transaction).filter(
        Transaction.investor_id == report.investor_id,
        Transaction.status == "active",
    )
    if investment is not None:
        tx_q = tx_q.filter(Transaction.investment_id == investment.id)
    if report.period_start:
        tx_q = tx_q.filter(Transaction.transaction_date >= report.period_start)
    if report.period_end:
        tx_q = tx_q.filter(Transaction.transaction_date <= report.period_end)
    txs = tx_q.order_by(Transaction.transaction_date.desc()).all()

    performances = (
        db.query(Performance)
        .filter(Performance.investor_id == report.investor_id)
        .order_by(Performance.period_end.desc())
        .all()
    )
    company = db.query(CompanySettings).first()
    signature_data_url = _load_signature_data_url(report)

    fmt = (report.format or "pdf").lower()
    if fmt == "pdf":
        return pdf_service.generate_statement(
            investor, investment, txs, performances,
            report.period_start, report.period_end,
            lang=lang,
            display_currency=display_currency,
            db=db,
            company=company,
            signature_data_url=signature_data_url,
            signed_by=report.signature_name,
        )
    return excel_service.generate_statement(
        investor, investment, txs, performances,
        report.period_start, report.period_end,
        lang=lang,
        display_currency=display_currency,
        db=db,
        company=company,
    )


def _publish_due_reports(db: Session) -> None:
    # A scheduled report is only a reminder/publication slot. It must never
    # become visible as a published report without an explicit admin action.
    return None


def _scheduled_due_count(db: Session) -> int:
    return (
        db.query(Report)
        .filter(
            Report.status == "scheduled",
            Report.available_at.isnot(None),
            Report.available_at <= datetime.now(timezone.utc),
        )
        .count()
    )


def _is_investor_published(report: Report) -> bool:
    return (
        report.format == "pdf"
        and report.status == "ready"
        and report.published_at is not None
        and _is_available(report)
    )


class GenerateRequest(BaseModel):
    investor_id: uuid.UUID
    format: str = "pdf"
    report_type: str = "statement"
    period_start: date | None = None
    period_end: date | None = None
    lang: str = "fr"
    display_currency: str = "HTG"
    available_at: datetime | None = None
    signature_data_url: str | None = None
    signature_name: str | None = None


class PublishRequest(BaseModel):
    investor_id: uuid.UUID | None = None
    investor_ids: list[uuid.UUID] = Field(default_factory=list)
    all_active: bool = False
    schedule_id: uuid.UUID | None = None
    schedule_ids: list[uuid.UUID] = Field(default_factory=list)
    report_type: str = "statement"
    period_start: date | None = None
    period_end: date | None = None
    lang: str = "fr"
    display_currency: str = "HTG"
    available_at: datetime | None = None
    signature_data_url: str | None = None
    signature_name: str | None = None


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
    output_format: str = "excel",
    available_at: datetime | None = None,
    signature_data_url: str | None = None,
    signature_name: str | None = None,
    signed_by: str | None = None,
    publish: bool = False,
    target_report: Report | None = None,
) -> Report:
    """Factorise la génération d'un relevé Excel (admin + investisseur auto)."""
    output_format = (output_format or "pdf").lower()
    if output_format not in ("pdf", "excel"):
        raise HTTPException(400, "Format non supporte")

    investor = db.query(Investor).filter(Investor.id == investor_id).first()
    if not investor:
        raise HTTPException(404, "Investisseur introuvable")

    investment = (
        db.query(Investment)
        .filter(Investment.investor_id == investor_id, Investment.status == "active")
        .first()
    )
    if not investment:
        raise HTTPException(404, "Aucun investissement trouvé pour cet investisseur")

    previous_available_at = _as_utc(target_report.available_at) if target_report else None

    tx_query = db.query(Transaction).filter(
        Transaction.investor_id == investor_id,
        Transaction.investment_id == investment.id,
        Transaction.status == "active",
    )
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

    if target_report is None:
        report = Report(
            investor_id=investor_id,
            investment_id=investment.id,
            report_type=report_type,
            format=output_format,
            period_start=period_start,
            period_end=period_end,
            status="generating",
            generated_by=generated_by,
            signature_name=signature_name,
        )
        db.add(report)
    else:
        report = target_report
        report.investor_id = investor_id
        report.investment_id = investment.id
        report.report_type = report_type
        report.format = output_format
        report.period_start = period_start
        report.period_end = period_end
        report.status = "generating"
        report.error_message = None
        report.generated_by = generated_by
        report.signature_name = signature_name
    db.commit()
    db.refresh(report)

    try:
        company = db.query(CompanySettings).first()
        if output_format == "pdf":
            file_bytes = pdf_service.generate_statement(
                investor, investment, txs, performances,
                period_start, period_end,
                lang=lang,
                display_currency=display_currency,
                db=db,
                company=company,
                signature_data_url=signature_data_url,
                signed_by=signed_by,
            )
        else:
            file_bytes = excel_service.generate_statement(
                investor, investment, txs, performances,
                period_start, period_end,
                lang=lang,
                display_currency=display_currency,
                db=db,
                company=company,
            )
        ext = EXT[output_format]
        storage_path = f"{investor_id}/{report.id}.{ext}"
        storage_service.upload_file(settings.SUPABASE_REPORTS_BUCKET, storage_path, file_bytes, MIME[output_format])
        signature_bytes = _signature_png_bytes(signature_data_url) if publish and output_format == "pdf" else None
        if signature_bytes:
            storage_service.upload_file(
                settings.SUPABASE_REPORTS_BUCKET,
                _signature_storage_path(report),
                signature_bytes,
                "image/png",
            )

        now = datetime.now(timezone.utc)
        scheduled_at = _as_utc(available_at)
        report.storage_path = storage_path
        report.generated_at = now
        if publish:
            if scheduled_at and scheduled_at > now:
                raise HTTPException(400, "Planifiez d'abord le rapport, puis publiez-le manuellement a l'horaire prevu")
            else:
                report.status = "ready"
                report.published_at = now
                report.available_at = previous_available_at or now
        else:
            report.status = "ready"
            report.published_at = None
            report.available_at = None
        db.commit()
        db.refresh(report)
    except HTTPException:
        raise
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
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    return _build_report(
        db,
        body.investor_id,
        current_user.id,
        report_type=body.report_type,
        period_start=body.period_start,
        period_end=body.period_end,
        lang=body.lang,
        display_currency=body.display_currency,
        output_format=body.format,
    )


@router.post("/preview")
def preview_report(
    body: GenerateRequest,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    report = Report(
        id=uuid.uuid4(),
        investor_id=body.investor_id,
        report_type=body.report_type,
        format=(body.format or "pdf").lower(),
        period_start=body.period_start,
        period_end=body.period_end,
        status="draft",
        generated_by=current_user.id,
        generated_at=datetime.now(timezone.utc),
        published_at=None,
        available_at=body.available_at,
        download_count=0,
    )
    return _build_view_payload(db, report, body.display_currency)


def _publish_targets(db: Session, body: PublishRequest) -> list[Investor]:
    if body.all_active:
        investors = (
            db.query(Investor)
            .filter(Investor.status == "active", Investor.is_company.is_(False))
            .order_by(Investor.full_name.asc())
            .all()
        )
        if not investors:
            raise HTTPException(404, "Aucun investisseur actif trouve")
        return investors

    raw_ids = []
    if body.investor_id:
        raw_ids.append(body.investor_id)
    raw_ids.extend(body.investor_ids or [])
    investor_ids = list(dict.fromkeys(raw_ids))
    if not investor_ids:
        raise HTTPException(400, "Selectionnez au moins un investisseur")

    investors = (
        db.query(Investor)
        .filter(Investor.id.in_(investor_ids), Investor.status == "active", Investor.is_company.is_(False))
        .order_by(Investor.full_name.asc())
        .all()
    )
    if not investors:
        raise HTTPException(404, "Aucun investisseur actif trouve")
    return investors


@router.post("/schedule", status_code=201)
def schedule_reports(
    body: PublishRequest,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    scheduled_at = _as_utc(body.available_at)
    if not scheduled_at:
        raise HTTPException(400, "Choisissez une date et une heure de publication")

    reports: list[Report] = []
    for investor in _publish_targets(db, body):
        investment = (
            db.query(Investment)
            .filter(Investment.investor_id == investor.id, Investment.status == "active")
            .first()
        )
        if not investment:
            raise HTTPException(404, f"Aucun investissement trouve pour {investor.full_name}")
        report = Report(
            investor_id=investor.id,
            investment_id=investment.id,
            report_type=body.report_type,
            format="pdf",
            period_start=None,
            period_end=None,
            status="scheduled",
            generated_by=current_user.id,
            generated_at=None,
            published_at=None,
            available_at=scheduled_at,
            signature_name=None,
        )
        db.add(report)
        reports.append(report)
    db.commit()
    for report in reports:
        db.refresh(report)
    return reports


@router.post("/publish", status_code=201)
def publish_report(
    body: PublishRequest,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    scheduled_at = _as_utc(body.available_at)
    if scheduled_at and scheduled_at > datetime.now(timezone.utc):
        raise HTTPException(400, "Utilisez la planification pour un horaire futur")

    schedule_ids = []
    if body.schedule_id:
        schedule_ids.append(body.schedule_id)
    schedule_ids.extend(body.schedule_ids or [])
    scheduled_by_investor: dict[uuid.UUID, Report] = {}
    if schedule_ids:
        scheduled_rows = (
            db.query(Report)
            .filter(Report.id.in_(list(dict.fromkeys(schedule_ids))), Report.status == "scheduled")
            .all()
        )
        scheduled_by_investor = {row.investor_id: row for row in scheduled_rows}

    if scheduled_by_investor and not body.all_active and not body.investor_id and not body.investor_ids:
        targets = (
            db.query(Investor)
            .filter(
                Investor.id.in_(scheduled_by_investor.keys()),
                Investor.status == "active",
                Investor.is_company.is_(False),
            )
            .order_by(Investor.full_name.asc())
            .all()
        )
    else:
        targets = _publish_targets(db, body)

    reports: list[Report] = []
    for investor in targets:
        target_report = scheduled_by_investor.get(investor.id)
        reports.append(
            _build_report(
                db,
                investor.id,
                current_user.id,
                report_type=body.report_type,
                period_start=body.period_start,
                period_end=body.period_end,
                lang=body.lang,
                display_currency=body.display_currency,
                output_format="pdf",
                available_at=body.available_at,
                signature_data_url=body.signature_data_url,
                signature_name=body.signature_name,
                signed_by=current_user.full_name,
                publish=True,
                target_report=target_report,
            )
        )
    return reports


@router.post("/my/generate", status_code=201)
def generate_my_statement(
    body: MyGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """L'investisseur connecté génère lui-même son propre relevé pour une période."""
    raise HTTPException(403, "Les rapports sont publies par l'administrateur")
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
    Renvoie la structure du relevé pour un rendu à l'écran (résumé + transactions
    filtrées par période). Montants convertis dans `display_currency`.

    Évolutions par rapport à l'ancienne version :
      - `summary.invested` : capital investi = ∑ dépôts − ∑ retraits (incluant
        l'apport initial déjà tracé comme transaction "Capital initial").
        Remplace conceptuellement l'ancien `summary.initial` qui ne montrait
        que le champ `investment.initial_capital`.
      - `summary.roi_pct` : maintenant `pnl / current_value` (rendement par
        rapport à la valeur actuelle), pas `pnl / initial`.
      - `transactions[i].fx_rate_to_display` : taux utilisé pour convertir le
        montant d'origine vers `display_currency` (transparence — affiché à
        l'investisseur quand l'admin a activé `show_fx_rate_to_investors`).
      - `transactions[i].fx_rate_at_posting` : taux historique original→HTG
        figé au moment du posting comptable (depuis journal_lines), quand
        disponible. Garantit l'intégrité comptable.
      - `show_fx_rate` : reflète le toggle admin pour que le front décide.
    """
    from app.services.currency import convert_amount, get_rate, MissingRateError  # noqa
    from app.models.company_settings import CompanySettings
    from app.models.journal_entry import JournalLine

    if not current_user.investor_id:
        raise HTTPException(403, "Aucun investisseur lié à ce compte")

    investor = db.query(Investor).filter(Investor.id == current_user.investor_id).first()
    investment = (
        db.query(Investment)
        .filter(Investment.investor_id == current_user.investor_id, Investment.status == "active")
        .first()
    )
    if not investor:
        raise HTTPException(404, "Données introuvables")

    display_ccy = (display_currency or "HTG").upper()
    if not investment:
        return {
            "investor": {
                "id": str(investor.id),
                "full_name": investor.full_name,
                "code": investor.code,
                "entry_date": str(investor.entry_date) if investor.entry_date else None,
                "status": investor.status,
            },
            "investment": {
                "start_date": None,
                "currency": display_ccy,
                "initial_capital_native": 0,
                "current_value_native": 0,
            },
            "display_currency": display_ccy,
            "show_fx_rate": False,
            "summary": {
                "initial": 0,
                "invested": 0,
                "current": 0,
                "pnl": 0,
                "roi_pct": None,
                "roi_unavailable": True,
                "net_deposits": 0,
            },
            "transactions": [],
            "period": {
                "start": str(period_start) if period_start else None,
                "end": str(period_end) if period_end else None,
            },
        }
    inv_ccy = (getattr(investment, "currency", None) or "HTG").upper()

    settings = db.query(CompanySettings).first()
    show_fx_rate = bool(settings.show_fx_rate_to_investors) if settings else False

    tx_query = db.query(Transaction).filter(
        Transaction.investor_id == investor.id,
        Transaction.investment_id == investment.id,
        Transaction.status == "active",
    )
    if period_start:
        tx_query = tx_query.filter(Transaction.transaction_date >= period_start)
    if period_end:
        tx_query = tx_query.filter(Transaction.transaction_date <= period_end)
    txs = tx_query.order_by(Transaction.transaction_date.desc()).all()

    # Cache des fx_rate historiques (journal_lines) pour éviter N requêtes.
    tx_ids = [t.id for t in txs]
    historical_rates: dict[uuid.UUID, float] = {}
    if tx_ids:
        rows = (
            db.query(JournalLine.investor_id, JournalLine.fx_rate, JournalLine.original_currency)
            .join(JournalLine.entry)
            .filter(JournalLine.fx_rate.isnot(None))
            .all()
        )
        # On indexe par (source_id) via la jointure à JournalEntry
        from app.models.journal_entry import JournalEntry as JE
        rows = (
            db.query(JE.source_id, JournalLine.fx_rate)
            .join(JournalLine, JournalLine.entry_id == JE.id)
            .filter(JE.source_type == "transaction", JE.source_id.in_(tx_ids), JournalLine.fx_rate.isnot(None))
            .all()
        )
        for src_id, rate in rows:
            if src_id and rate is not None and src_id not in historical_rates:
                historical_rates[src_id] = float(rate)

    try:
        initial_native = float(investment.initial_capital or 0)
        initial = convert_amount(db, initial_native, inv_ccy, display_ccy)

        pnl = 0.0
        net_deposits = 0.0  # ∑ deposits − ∑ withdrawals (en devise d'affichage)
        tx_out = []
        latest_bailouts = latest_bailout_key_by_investment(txs)
        for tx in txs:
            native_amt, tx_ccy = transaction_business_amount_and_currency(tx)
            amt = convert_amount(db, native_amt, tx_ccy, display_ccy)
            if is_effective_pnl_tx(tx, latest_bailouts):
                pnl += amt if tx.type == "gain" else -amt
            elif tx.type in ("deposit", "bailout", "company_bailout"):
                # Renflouement = cash réinjecté, compté comme un dépôt pour
                # le total « capital investi ».
                net_deposits += amt
            elif tx.type in ("withdrawal", "company_withdrawal"):
                net_deposits -= amt

            # Taux pour l'affichage : tx.currency → display_currency.
            # Si l'origine == affichage, le ratio est 1 (pas de conversion).
            fx_to_display = (
                1.0 if tx_ccy == display_ccy
                else (get_rate(db, tx_ccy, display_ccy) or 1.0)
            )

            tx_out.append({
                "id": str(tx.id),
                "date": str(tx.transaction_date),
                "type": (tx.type or "").lower(),
                "converted_amount": amt,
                "original_amount": native_amt,
                "original_currency": tx_ccy,
                "description": tx.description or None,
                "reference": getattr(tx, "reference", None),
                # Transparence (uniquement informatif) — le front les affiche
                # côté investisseur quand `show_fx_rate` est vrai.
                "fx_rate_to_display": float(fx_to_display),
                "fx_rate_at_posting": historical_rates.get(tx.id),
            })
        has_initial_tx = any(is_initial_capital_tx(tx) for tx in txs)
        invested_seed = 0.0 if has_initial_tx else initial
        current = invested_seed
        for tx in sorted(txs, key=tx_sort_key):
            native_amt, tx_ccy = transaction_business_amount_and_currency(tx)
            amt = convert_amount(db, native_amt, tx_ccy, display_ccy)
            if (tx.type or "").lower() == "bailout":
                current = amt
            else:
                current += TX_SIGNS.get((tx.type or "").lower(), 0) * amt
        current_native = convert_amount(db, current, display_ccy, inv_ccy)
    except MissingRateError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # « Capital investi » : tout ce que l'investisseur a réellement mis (et
    # garde) dans son portefeuille, indépendamment des P&L. On utilise les
    # dépôts nets — qui incluent déjà l'apport initial s'il a été créé comme
    # transaction "Capital initial". Pour les enregistrements legacy sans
    # transaction d'apport initial, on retombe sur `initial`.
    invested = invested_seed + net_deposits

    # ROI investisseur : bénéfice / valeur actuelle (ratio de rentabilité
    # courant). Différent de pnl/initial qui mesurait le rendement / mise
    # de départ.
    roi = compute_roi_from_pnl(pnl, current)

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
        "show_fx_rate": show_fx_rate,
        "summary": {
            "initial": initial,           # rétro-compat (champ initial_capital pur)
            "invested": invested,         # nouveau : capital investi (∑ dépôts − ∑ retraits)
            "current": current,
            "pnl": pnl,
            "roi_pct": roi,               # désormais pnl/current au lieu de pnl/initial
            "roi_unavailable": roi is None,
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
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    _publish_due_reports(db)
    q = db.query(Report).filter(Report.status.in_(("ready", "scheduled")))
    if investor_id:
        q = q.filter(Report.investor_id == investor_id)
    return q.order_by(Report.available_at.desc().nullslast(), Report.generated_at.desc()).all()


@router.get("/my")
def my_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _publish_due_reports(db)
    if not current_user.investor_id:
        return []
    reports = (
        db.query(Report)
        .filter(
            Report.investor_id == current_user.investor_id,
            Report.status.in_(("ready", "scheduled")),
            Report.format == "pdf",
        )
        .order_by(Report.available_at.desc().nullslast(), Report.generated_at.desc())
        .all()
    )
    return [
        report for report in reports
        if report.status == "scheduled" or report.published_at is not None
    ]


@router.get("/scheduled-count")
def scheduled_count(
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    total = db.query(Report).filter(Report.status == "scheduled").count()
    return {"scheduled": total, "due": _scheduled_due_count(db)}


@router.get("/{report_id:uuid}/download")
def download_report(
    report_id: uuid.UUID,
    lang: str | None = None,
    display_currency: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _publish_due_reports(db)
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Rapport introuvable")

    if current_user.role == "investor" and str(report.investor_id) != str(current_user.investor_id):
        raise HTTPException(403, "Accès refusé")

    if current_user.role == "investor":
        if report.status == "scheduled":
            raise HTTPException(425, "Rapport programme, pas encore disponible")
        if not _is_investor_published(report):
            raise HTTPException(403, "Seuls les rapports PDF publies sont disponibles")

    if report.status not in ("ready", "scheduled") or not report.storage_path:
        raise HTTPException(400, "Rapport non disponible")

    # Régénération à la volée si le client demande explicitement une langue
    # ou une devise. Cela permet à un investisseur de voir le rapport dans sa
    # propre langue, indépendamment de celle choisie par l'admin lors de la
    # publication. Le fichier stocké en bucket reste intact (audit).
    lang_norm = (lang or "").strip().lower()
    ccy_norm = (display_currency or "").strip().upper()
    if lang_norm in ("fr", "en", "es") or ccy_norm in ("HTG", "USD", "EUR"):
        try:
            file_bytes = _render_report_bytes(
                db,
                report,
                lang=lang_norm or "fr",
                display_currency=ccy_norm or "HTG",
            )
        except HTTPException:
            raise
        except Exception:
            # En cas d'échec de régénération (taux manquant, etc.) on retombe
            # silencieusement sur le fichier stocké pour ne pas casser le DL.
            file_bytes = storage_service.download_file(
                settings.SUPABASE_REPORTS_BUCKET, report.storage_path
            )
    else:
        file_bytes = storage_service.download_file(
            settings.SUPABASE_REPORTS_BUCKET, report.storage_path
        )

    report.download_count = (report.download_count or 0) + 1
    db.commit()

    ext = EXT.get(report.format, report.format)
    content_type = MIME.get(report.format, "application/octet-stream")

    investor = db.query(Investor).filter(Investor.id == report.investor_id).first()
    tx_count = (
        db.query(Transaction).filter(Transaction.investor_id == report.investor_id, Transaction.status == "active").count()
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
    """L'investisseur ne peut acceder qu'a ses propres rapports, l'admin a tous."""
    if user.role == "investor" and str(report.investor_id) != str(user.investor_id):
        raise HTTPException(403, "Acces refuse")
    if user.role == "investor":
        if report.status == "scheduled":
            raise HTTPException(425, "Rapport programme, pas encore disponible")
        if not _is_investor_published(report):
            raise HTTPException(403, "Seuls les rapports PDF publies sont disponibles")


def _build_view_payload(db: Session, report: Report, display_currency: str = "HTG") -> dict:
    """
    Produit la même structure que `/my/preview`, mais figée sur la période
    du rapport et l'investisseur lié. Utilisée par l'écran de visualisation.
    """
    from app.services.currency import convert_amount, MissingRateError  # noqa

    investor = db.query(Investor).filter(Investor.id == report.investor_id).first()
    investment = (
        db.query(Investment)
        .filter(Investment.investor_id == report.investor_id, Investment.status == "active")
        .first()
    )
    if not investor:
        raise HTTPException(404, "Données introuvables")

    display_ccy = (display_currency or "HTG").upper()
    if not investment:
        company = db.query(CompanySettings).first()
        return {
            "report": {
                "id": str(report.id),
                "report_type": report.report_type,
                "format": report.format,
                "status": report.status,
                "storage_path": report.storage_path,
                "generated_at": report.generated_at.isoformat() if report.generated_at else None,
                "published_at": report.published_at.isoformat() if report.published_at else None,
                "available_at": report.available_at.isoformat() if report.available_at else None,
                "signature_name": report.signature_name,
                "signature_url": _signature_signed_url(report),
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
                "start_date": None,
                "currency": display_ccy,
                "initial_capital_native": 0,
                "current_value_native": 0,
            },
            "display_currency": display_ccy,
            "summary": {
                "initial": 0,
                "invested": 0,
                "current": 0,
                "pnl": 0,
                "roi_pct": None,
                "roi_unavailable": True,
                "net_deposits": 0,
            },
            "transactions": [],
            "period": {
                "start": str(report.period_start) if report.period_start else None,
                "end": str(report.period_end) if report.period_end else None,
            },
        }
    inv_ccy = (getattr(investment, "currency", None) or "HTG").upper()

    tx_q = db.query(Transaction).filter(
        Transaction.investor_id == investor.id,
        Transaction.investment_id == investment.id,
        Transaction.status == "active",
    )
    if report.period_start:
        tx_q = tx_q.filter(Transaction.transaction_date >= report.period_start)
    if report.period_end:
        tx_q = tx_q.filter(Transaction.transaction_date <= report.period_end)
    txs = tx_q.order_by(Transaction.transaction_date.desc()).all()

    try:
        initial_native = float(investment.initial_capital or 0)
        initial = convert_amount(db, initial_native, inv_ccy, display_ccy)

        pnl = 0.0
        net_deposits = 0.0
        tx_out = []
        latest_bailouts = latest_bailout_key_by_investment(txs)
        for tx in txs:
            native_amt, tx_ccy = transaction_business_amount_and_currency(tx)
            amt = convert_amount(db, native_amt, tx_ccy, display_ccy)
            if is_effective_pnl_tx(tx, latest_bailouts):
                pnl += amt if tx.type == "gain" else -amt
            elif tx.type in ("deposit", "bailout", "company_bailout"):
                net_deposits += amt
            elif tx.type in ("withdrawal", "company_withdrawal"):
                net_deposits -= amt
            tx_out.append({
                "id": str(tx.id),
                "date": str(tx.transaction_date),
                "type": (tx.type or "").lower(),
                "converted_amount": amt,
                "original_amount": native_amt,
                "original_currency": tx_ccy,
                "description": tx.description or None,
                "reference": getattr(tx, "reference", None),
            })
        has_initial_tx = any(is_initial_capital_tx(tx) for tx in txs)
        invested_seed = 0.0 if has_initial_tx else initial
        current = invested_seed
        for tx in sorted(txs, key=tx_sort_key):
            native_amt, tx_ccy = transaction_business_amount_and_currency(tx)
            amt = convert_amount(db, native_amt, tx_ccy, display_ccy)
            if (tx.type or "").lower() == "bailout":
                current = amt
            else:
                current += TX_SIGNS.get((tx.type or "").lower(), 0) * amt
        current_native = convert_amount(db, current, display_ccy, inv_ccy)
    except MissingRateError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Capital investi = ∑ dépôts − ∑ retraits (apport initial inclus s'il a
    # été tracé comme transaction "Capital initial"). Fallback sur l'initial
    # statique pour les enregistrements legacy.
    invested = invested_seed + net_deposits
    # ROI = bénéfice / valeur actuelle (cohérent avec le dashboard).
    roi = compute_roi_from_pnl(pnl, current)

    company = db.query(CompanySettings).first()

    return {
        "report": {
            "id": str(report.id),
            "report_type": report.report_type,
            "format": report.format,
            "status": report.status,
            "storage_path": report.storage_path,
            "generated_at": report.generated_at.isoformat() if report.generated_at else None,
            "published_at": report.published_at.isoformat() if report.published_at else None,
            "available_at": report.available_at.isoformat() if report.available_at else None,
            "signature_name": report.signature_name,
            "signature_url": _signature_signed_url(report),
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
            "invested": invested,
            "current": current,
            "pnl": pnl,
            "roi_pct": roi,
            "roi_unavailable": roi is None,
            "net_deposits": net_deposits,
        },
        "transactions": tx_out,
        "period": {
            "start": str(report.period_start) if report.period_start else None,
            "end": str(report.period_end) if report.period_end else None,
        },
    }


@router.get("/{report_id:uuid}/view")
def view_report(
    report_id: uuid.UUID,
    display_currency: str = "HTG",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Renvoie le contenu du rapport pour un affichage à l'écran (admin ou investisseur)."""
    _publish_due_reports(db)
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Rapport introuvable")
    _authorize_report_access(report, current_user)
    return _build_view_payload(db, report, display_currency)


@router.post("/{report_id:uuid}/share", response_model=ShareResponse)
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
    _publish_due_reports(db)
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Rapport introuvable")
    _authorize_report_access(report, current_user)
    if current_user.role == "investor":
        raise HTTPException(403, "Le partage public des rapports investisseurs est reserve a l'administration")
    if report.status != "ready" or not report.storage_path:
        raise HTTPException(400, "Rapport non disponible")
    if not _is_available(report):
        raise HTTPException(425, "Rapport programme, pas encore disponible")

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
    _publish_due_reports(db)
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
    if not _is_available(report):
        raise HTTPException(425, "Rapport programme, pas encore disponible")

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
