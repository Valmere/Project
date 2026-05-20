"""
Endpoints de la file d'approbation des actions sensibles.

- GET  /api/approvals          : liste (admin voit tout, caissier voit les siennes)
- GET  /api/approvals/pending-count : badge pour l'admin
- POST /api/approvals/{id}/approve : admin valide → l'action est exécutée
- POST /api/approvals/{id}/reject  : admin refuse
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.pending_action import PendingAction
from app.dependencies.auth import get_current_user, admin_only, admin_or_cashier
from app.services import approvals_service

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


class ReviewBody(BaseModel):
    notes: str | None = None


def _serialize(pa: PendingAction, users_by_id: dict[uuid.UUID, User]) -> dict:
    req = users_by_id.get(pa.requested_by)
    rev = users_by_id.get(pa.reviewed_by) if pa.reviewed_by else None
    return {
        "id": str(pa.id),
        "action_type": pa.action_type,
        "target_type": pa.target_type,
        "target_id": str(pa.target_id) if pa.target_id else None,
        "payload": pa.payload,
        "reason": pa.reason,
        "status": pa.status,
        "requested_by": {
            "id": str(req.id) if req else str(pa.requested_by),
            "full_name": req.full_name if req else None,
            "email": req.email if req else None,
        },
        "reviewed_by": (
            {
                "id": str(rev.id),
                "full_name": rev.full_name,
                "email": rev.email,
            }
            if rev
            else None
        ),
        "reviewed_at": pa.reviewed_at.isoformat() if pa.reviewed_at else None,
        "reviewer_notes": pa.reviewer_notes,
        "created_at": pa.created_at.isoformat() if pa.created_at else None,
    }


@router.get("")
def list_approvals(
    status: str | None = Query(None),
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    q = db.query(PendingAction)
    # Un caissier ne voit que ses propres demandes.
    if current_user.role != "admin":
        q = q.filter(PendingAction.requested_by == current_user.id)
    if status:
        q = q.filter(PendingAction.status == status)
    rows = q.order_by(PendingAction.created_at.desc()).all()

    # Hydrater les noms d'utilisateurs en une seule requête.
    user_ids: set[uuid.UUID] = set()
    for r in rows:
        user_ids.add(r.requested_by)
        if r.reviewed_by:
            user_ids.add(r.reviewed_by)
    users_by_id = {
        u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}

    return [_serialize(r, users_by_id) for r in rows]


@router.get("/pending-count")
def pending_count(
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """Utilisé par le badge de notification dans la topbar admin."""
    n = (
        db.query(PendingAction)
        .filter(PendingAction.status == "pending")
        .count()
    )
    return {"pending": n}


@router.post("/{pa_id}/approve")
def approve_action(
    pa_id: uuid.UUID,
    body: ReviewBody | None = None,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    pa = db.query(PendingAction).filter(PendingAction.id == pa_id).first()
    if not pa:
        raise HTTPException(404, "Demande introuvable")
    notes = body.notes if body else None
    pa = approvals_service.approve_and_execute(db, pa, reviewer=current_user, notes=notes)
    users_by_id = {
        u.id: u
        for u in db.query(User)
        .filter(User.id.in_([x for x in (pa.requested_by, pa.reviewed_by) if x]))
        .all()
    }
    return _serialize(pa, users_by_id)


@router.post("/{pa_id}/reject")
def reject_action(
    pa_id: uuid.UUID,
    body: ReviewBody | None = None,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    pa = db.query(PendingAction).filter(PendingAction.id == pa_id).first()
    if not pa:
        raise HTTPException(404, "Demande introuvable")
    notes = body.notes if body else None
    pa = approvals_service.reject(db, pa, reviewer=current_user, notes=notes)
    users_by_id = {
        u.id: u
        for u in db.query(User)
        .filter(User.id.in_([x for x in (pa.requested_by, pa.reviewed_by) if x]))
        .all()
    }
    return _serialize(pa, users_by_id)
