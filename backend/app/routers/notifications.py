from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.message import Message
from app.models.pending_action import PendingAction
from app.models.report import Report
from app.models.user import User

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

TEXTS = {
    "fr": {
        "reports_due_title": "Rapports a publier",
        "reports_due_body": "{count} rapport(s) planifie(s) sont arrives a echeance.",
        "approvals_title": "Approbations en attente",
        "approvals_body": "{count} demande(s) attendent une decision.",
        "admin_message_title": "Nouveau message",
        "admin_message_body": "Un investisseur a envoye un message.",
        "scheduled_report_title": "Rapport planifie",
        "scheduled_report_body": "Un rapport est programme par l'administration.",
        "ready_report_title": "Rapport disponible",
        "ready_report_body": "Un nouveau rapport PDF est disponible.",
        "investor_message_title": "Message de l'administration",
        "investor_message_body": "Vous avez un message de l'administration.",
    },
    "en": {
        "reports_due_title": "Reports to publish",
        "reports_due_body": "{count} scheduled report(s) are due.",
        "approvals_title": "Pending approvals",
        "approvals_body": "{count} request(s) are awaiting a decision.",
        "admin_message_title": "New message",
        "admin_message_body": "An investor sent a message.",
        "scheduled_report_title": "Scheduled report",
        "scheduled_report_body": "A report is scheduled by the administration.",
        "ready_report_title": "Report available",
        "ready_report_body": "A new PDF report is available.",
        "investor_message_title": "Message from administration",
        "investor_message_body": "You have a message from administration.",
    },
    "es": {
        "reports_due_title": "Informes por publicar",
        "reports_due_body": "{count} informe(s) programado(s) vencieron.",
        "approvals_title": "Aprobaciones pendientes",
        "approvals_body": "{count} solicitud(es) esperan decision.",
        "admin_message_title": "Nuevo mensaje",
        "admin_message_body": "Un inversor envio un mensaje.",
        "scheduled_report_title": "Informe programado",
        "scheduled_report_body": "La administracion programo un informe.",
        "ready_report_title": "Informe disponible",
        "ready_report_body": "Hay un nuevo informe PDF disponible.",
        "investor_message_title": "Mensaje de administracion",
        "investor_message_body": "Tiene un mensaje de administracion.",
    },
}


def _texts(lang: str | None) -> dict[str, str]:
    return TEXTS.get((lang or "fr").lower(), TEXTS["fr"])


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    value = _as_utc(value)
    return value.isoformat() if value else None


def _item(
    *,
    item_id: str,
    kind: str,
    title: str,
    body: str,
    action_url: str,
    created_at: datetime | None,
    severity: str = "info",
) -> dict:
    return {
        "id": item_id,
        "type": kind,
        "title": title,
        "body": body,
        "action_url": action_url,
        "created_at": _iso(created_at) or datetime.now(timezone.utc).isoformat(),
        "severity": severity,
    }


@router.get("")
def list_notifications(
    lang: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    items: list[dict] = []
    labels = _texts(lang)

    if current_user.role in ("admin", "cashier"):
        due_reports = (
            db.query(Report)
            .filter(
                Report.status == "scheduled",
                Report.available_at.isnot(None),
                Report.available_at <= now,
            )
            .order_by(Report.available_at.asc())
            .limit(50)
            .all()
        )
        if due_reports:
            due_ids = "-".join(str(report.id)[:8] for report in due_reports[:6])
            items.append(
                _item(
                    item_id=f"reports-due-{len(due_reports)}-{due_ids}",
                    kind="reports",
                    title=labels["reports_due_title"],
                    body=labels["reports_due_body"].format(count=len(due_reports)),
                    action_url="/admin/reports?view=scheduled",
                    created_at=due_reports[0].available_at,
                    severity="warning",
                )
            )

        pending_rows = (
            db.query(PendingAction)
            .filter(PendingAction.status == "pending")
            .order_by(PendingAction.created_at.desc())
            .limit(50)
            .all()
        )
        pending_approvals = len(pending_rows)
        if pending_approvals:
            latest_pending = pending_rows[0]
            items.append(
                _item(
                    item_id=f"pending-approvals-{pending_approvals}-{str(latest_pending.id)[:8]}",
                    kind="approvals",
                    title=labels["approvals_title"],
                    body=labels["approvals_body"].format(count=pending_approvals),
                    action_url="/admin/approvals",
                    created_at=latest_pending.created_at,
                    severity="warning",
                )
            )

        unread_messages = (
            db.query(Message)
            .filter(Message.direction == "in", Message.read_at.is_(None))
            .order_by(Message.sent_at.desc())
            .limit(8)
            .all()
        )
        for msg in unread_messages:
            items.append(
                _item(
                    item_id=f"message-{msg.id}",
                    kind="message",
                    title=msg.subject or labels["admin_message_title"],
                    body=labels["admin_message_body"],
                    action_url="/admin/messages",
                    created_at=msg.sent_at,
                )
            )
    else:
        investor_id = current_user.investor_id
        if investor_id:
            reports = (
                db.query(Report)
                .filter(
                    Report.investor_id == investor_id,
                    Report.format == "pdf",
                    Report.status.in_(("ready", "scheduled")),
                )
                .order_by(Report.available_at.desc().nullslast(), Report.generated_at.desc().nullslast())
                .limit(12)
                .all()
            )
            for report in reports:
                if report.status == "scheduled":
                    items.append(
                        _item(
                            item_id=f"scheduled-report-{report.id}",
                            kind="report_schedule",
                            title=labels["scheduled_report_title"],
                            body=labels["scheduled_report_body"],
                            action_url="/investor/reports",
                            created_at=report.available_at or report.created_at,
                            severity="schedule",
                        )
                    )
                elif report.published_at is not None:
                    items.append(
                        _item(
                            item_id=f"report-{report.id}",
                            kind="report",
                            title=labels["ready_report_title"],
                            body=labels["ready_report_body"],
                            action_url=f"/investor/reports/{report.id}",
                            created_at=report.published_at or report.generated_at,
                        )
                    )

            admin_messages = (
                db.query(Message)
                .filter(Message.investor_id == investor_id, Message.direction == "out")
                .order_by(Message.sent_at.desc())
                .limit(5)
                .all()
            )
            for msg in admin_messages:
                items.append(
                    _item(
                        item_id=f"message-{msg.id}",
                        kind="message",
                        title=msg.subject or labels["investor_message_title"],
                        body=labels["investor_message_body"],
                        action_url="/investor/messages",
                        created_at=msg.sent_at,
                    )
                )

    items.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    items = items[:20]
    return {"count": len(items), "items": items}
