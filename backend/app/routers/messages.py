import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.message import Message
from app.models.user import User
from app.models.investor import Investor
from app.dependencies.auth import get_current_user, admin_only

router = APIRouter(prefix="/api/messages", tags=["messages"])


class MessageCreate(BaseModel):
    subject: str
    body: str


class MessageReply(BaseModel):
    reply_body: str


class MessageBroadcast(BaseModel):
    """
    Broadcast d'un admin vers un ou plusieurs investisseurs.
    - `investor_ids` : liste d'IDs. Si vide et `to_all=True`, envoyé à tous les investisseurs actifs.
    - `to_all` : raccourci pour cibler tous les investisseurs actifs.
    """
    subject: str
    body: str
    investor_ids: list[uuid.UUID] = Field(default_factory=list)
    to_all: bool = False


def _serialize(db: Session, msg: Message) -> dict:
    """
    Sérialise un message en enrichissant avec les identités des deux parties :
      - `sender` : qui a envoyé le message initial (investisseur ou admin selon `direction`)
      - `replier` : qui a répondu (l'autre partie)
      - `read_by_user` : admin qui a marqué comme lu
    Le front utilise `direction` + `sender` pour afficher correctement qui a parlé.
    """
    investor = db.query(Investor).filter(Investor.id == msg.investor_id).first()

    # Helper: serialize a user reference
    def _user_ref(user_id):
        if not user_id:
            return None
        u = db.query(User).filter(User.id == user_id).first()
        if not u:
            return None
        return {"id": str(u.id), "full_name": u.full_name, "email": u.email}

    investor_ref = {
        "investor_id": str(investor.id) if investor else None,
        "full_name": investor.full_name if investor else "—",
        "email": investor.email if investor else None,
        "code": investor.code if investor else None,
        "role": "investor",
    }

    admin_sender_ref = _user_ref(msg.sender_admin_id)
    if admin_sender_ref:
        admin_sender_ref["role"] = "admin"

    direction = msg.direction or "in"
    if direction == "out":
        sender = admin_sender_ref or {"full_name": "Administration", "email": None, "role": "admin"}
        replier = _user_ref(msg.replied_by) if msg.replied_by else (investor_ref if msg.reply_body else None)
        # When investor replies, replied_by may be set to their user id; fall back to investor name.
        if msg.reply_body and not replier:
            replier = investor_ref
        if replier and "role" not in replier:
            replier["role"] = "investor" if (msg.replied_by and _user_ref(msg.replied_by) and _user_ref(msg.replied_by).get("email") == investor_ref.get("email")) else "admin"
    else:  # "in"
        sender = investor_ref
        replier = _user_ref(msg.replied_by)
        if replier:
            replier["role"] = "admin"

    return {
        "id": str(msg.id),
        "investor_id": str(msg.investor_id),
        "direction": direction,
        "subject": msg.subject,
        "body": msg.body,
        "sent_at": msg.sent_at.isoformat() if msg.sent_at else None,
        "read_at": msg.read_at.isoformat() if msg.read_at else None,
        "read_by_user": _user_ref(msg.read_by),
        "reply_body": msg.reply_body,
        "replied_at": msg.replied_at.isoformat() if msg.replied_at else None,
        "replied_by_user": replier,
        "sender": sender,
        # Always include the investor on the thread so the admin UI can label it.
        "investor": investor_ref,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Investor-initiated messages (direction = "in")
# ═══════════════════════════════════════════════════════════════════════════

@router.post("", status_code=201)
def send_message(
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Endpoint utilisé par l'investisseur pour contacter l'admin."""
    if not current_user.investor_id:
        raise HTTPException(400, "Aucun profil investisseur associé à ce compte")
    msg = Message(
        investor_id=current_user.investor_id,
        direction="in",
        **body.model_dump(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _serialize(db, msg)


# ═══════════════════════════════════════════════════════════════════════════
# Admin-initiated messages (direction = "out")
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/broadcast", status_code=201)
def broadcast_message(
    body: MessageBroadcast,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """
    Crée une copie du message pour chaque investisseur ciblé :
      - si `to_all=True` → tous les investisseurs actifs
      - sinon → uniquement ceux listés dans `investor_ids`
    Retourne le nombre de destinataires et les messages créés (sérialisés).
    """
    if body.to_all:
        targets = db.query(Investor).filter(Investor.status == "active").all()
    else:
        if not body.investor_ids:
            raise HTTPException(400, "Aucun destinataire sélectionné")
        targets = db.query(Investor).filter(Investor.id.in_(body.investor_ids)).all()

    if not targets:
        raise HTTPException(404, "Aucun investisseur correspondant n'a été trouvé")

    created: list[Message] = []
    for inv in targets:
        msg = Message(
            investor_id=inv.id,
            direction="out",
            sender_admin_id=current_user.id,
            subject=body.subject,
            body=body.body,
        )
        db.add(msg)
        created.append(msg)
    db.commit()
    for m in created:
        db.refresh(m)

    return {
        "recipient_count": len(created),
        "messages": [_serialize(db, m) for m in created],
    }


# ═══════════════════════════════════════════════════════════════════════════
# Listing
# ═══════════════════════════════════════════════════════════════════════════

@router.get("")
def list_messages(current_user: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Admin : liste tous les messages (entrants + sortants) avec identité des parties."""
    msgs = db.query(Message).order_by(Message.sent_at.desc()).all()
    return [_serialize(db, m) for m in msgs]


@router.get("/mine")
def list_my_messages(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Investisseur : liste ses propres messages (ceux qu'il a envoyés ET ceux reçus de l'admin),
    avec réponses et identités.
    """
    if not current_user.investor_id:
        return []
    msgs = (
        db.query(Message)
        .filter(Message.investor_id == current_user.investor_id)
        .order_by(Message.sent_at.desc())
        .all()
    )
    return [_serialize(db, m) for m in msgs]


# ═══════════════════════════════════════════════════════════════════════════
# Read / reply
# ═══════════════════════════════════════════════════════════════════════════

@router.put("/{msg_id}/read")
def mark_read(msg_id: uuid.UUID, current_user: User = Depends(admin_only), db: Session = Depends(get_db)):
    msg = db.query(Message).filter(Message.id == msg_id).first()
    if not msg:
        raise HTTPException(404, "Message introuvable")
    msg.read_at = datetime.now(timezone.utc)
    msg.read_by = current_user.id
    db.commit()
    db.refresh(msg)
    return _serialize(db, msg)


@router.put("/{msg_id}/reply")
def reply_message(
    msg_id: uuid.UUID,
    body: MessageReply,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Répond à un message. L'autorisation dépend de la direction :
      - direction="in"  → seul l'admin peut répondre
      - direction="out" → seul l'investisseur destinataire peut répondre
    """
    msg = db.query(Message).filter(Message.id == msg_id).first()
    if not msg:
        raise HTTPException(404, "Message introuvable")

    is_admin = current_user.role in ("admin", "analyst")
    if msg.direction == "in" and not is_admin:
        raise HTTPException(403, "Seul un administrateur peut répondre à ce message")
    if msg.direction == "out":
        if current_user.investor_id != msg.investor_id:
            raise HTTPException(403, "Ce message ne vous est pas adressé")

    msg.reply_body = body.reply_body
    msg.replied_at = datetime.now(timezone.utc)
    msg.replied_by = current_user.id
    if not msg.read_at:
        msg.read_at = datetime.now(timezone.utc)
        msg.read_by = current_user.id
    db.commit()
    db.refresh(msg)
    return _serialize(db, msg)
