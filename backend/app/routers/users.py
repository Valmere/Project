import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.user import User
from app.dependencies.auth import get_current_user, admin_only, admin_or_cashier
from app.services.auth_service import hash_password
from app.services.user_identity import generate_temp_password, make_unique_username, normalize_username
from app.services import approvals_service

router = APIRouter(prefix="/api/users", tags=["users"])

VALID_ROLES = {"admin", "cashier", "investor"}


class UserCreate(BaseModel):
    email: str
    username: str | None = None
    password: str
    full_name: str
    role: str = "investor"
    investor_id: uuid.UUID | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    username: str | None = None
    is_active: bool | None = None
    role: str | None = None
    investor_id: uuid.UUID | None = None


class CurrentUserUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    username: str | None = None


class PasswordChange(BaseModel):
    new_password: str


class AdminPasswordReset(BaseModel):
    # Si `new_password` est omis, on génère un mot de passe temporaire et on
    # le renvoie à l'admin (pour qu'il le communique à l'utilisateur).
    new_password: str | None = None
    force_change_on_next_login: bool = True


def _user_by_email(db: Session, email: str, exclude_user_id: uuid.UUID | None = None) -> User | None:
    normalized = email.strip().lower()
    query = db.query(User).filter(func.lower(func.trim(User.email)) == normalized)
    if exclude_user_id is not None:
        query = query.filter(User.id != exclude_user_id)
    return query.first()


def _apply_user_profile_update(
    db: Session,
    user: User,
    body: UserUpdate | CurrentUserUpdate,
) -> None:
    data = body.model_dump(exclude_unset=True)

    if "full_name" in data:
        full_name = (data["full_name"] or "").strip()
        if not full_name:
            raise HTTPException(400, "Le nom complet est requis")
        user.full_name = full_name

    if "email" in data:
        email = (data["email"] or "").strip().lower()
        if not email:
            raise HTTPException(400, "L'email est requis")
        if _user_by_email(db, email, exclude_user_id=user.id):
            raise HTTPException(409, "Un compte avec cet email existe deja")
        user.email = email

    if "username" in data:
        try:
            username = normalize_username(data["username"])
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        if not username:
            raise HTTPException(400, "L'identifiant est requis")
        existing = (
            db.query(User)
            .filter(func.lower(User.username) == username.lower(), User.id != user.id)
            .first()
        )
        if existing:
            raise HTTPException(409, "Un compte avec cet identifiant existe deja")
        user.username = username


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "investor_id": str(current_user.investor_id) if current_user.investor_id else None,
        "must_change_password": bool(current_user.must_change_password),
    }


@router.put("/me")
def update_me(
    body: CurrentUserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _apply_user_profile_update(db, current_user, body)
    db.commit()
    db.refresh(current_user)
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "investor_id": str(current_user.investor_id) if current_user.investor_id else None,
        "must_change_password": bool(current_user.must_change_password),
    }


@router.get("")
def list_users(current_user: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [_user_dict(u) for u in db.query(User).all()]


@router.post("", status_code=201)
def create_user(
    body: UserCreate,
    current_user: User = Depends(admin_or_cashier),
    db: Session = Depends(get_db),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"Rôle invalide. Valeurs acceptées : {', '.join(VALID_ROLES)}")
    if len(body.password) < 8:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 8 caractères")
    email = body.email.strip().lower()
    existing = _user_by_email(db, email)
    if existing:
        raise HTTPException(409, "Un compte avec cet email existe déjà")

    # Caissier : mise en file d'attente, l'admin valide la création.
    username = make_unique_username(db, body.username, email, body.full_name)

    if current_user.role != "admin":
        payload = {
            "email": email,
            "username": username,
            "password": body.password,
            "full_name": body.full_name,
            "role": body.role,
            "investor_id": str(body.investor_id) if body.investor_id else None,
        }
        pa = approvals_service.queue_action(
            db,
            requested_by=current_user,
            action_type=approvals_service.ACTION_CREATE_USER,
            target_type="user",
            payload=payload,
            reason=f"Création du compte {body.email}",
        )
        return {
            "queued": True,
            "pending_action_id": str(pa.id),
            "message": "Demande de création envoyée à l'administrateur.",
        }

    user = User(
        email=email,
        username=username,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        investor_id=body.investor_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_dict(user)


@router.put("/{user_id}")
def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    if body.role and body.role not in VALID_ROLES:
        raise HTTPException(400, f"Rôle invalide")
    _apply_user_profile_update(db, user, body)
    # Use exclude_unset so explicit `null` values (e.g. unlinking an investor)
    # are applied, while fields the client didn't send are left alone.
    data = body.model_dump(exclude_unset=True)
    for field in ("is_active", "role", "investor_id"):
        if field in data:
            setattr(user, field, data[field])
    db.commit()
    db.refresh(user)
    return _user_dict(user)


@router.put("/{user_id}/password")
def reset_user_password(
    user_id: uuid.UUID,
    body: AdminPasswordReset,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """
    Réinitialise (admin) le mot de passe d'un utilisateur. Si `new_password`
    est omis, on en génère un aléatoire et on le renvoie au front pour que
    l'admin puisse le communiquer à l'utilisateur. Par défaut on marque le
    compte `must_change_password=True` afin que la prochaine connexion force
    la définition d'un nouveau mot de passe.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")

    new_password = body.new_password or generate_temp_password()
    if len(new_password) < 8:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 8 caractères")

    user.hashed_password = hash_password(new_password)
    user.must_change_password = bool(body.force_change_on_next_login)
    db.commit()

    return {
        "user_id": str(user.id),
        "email": user.email,
        # On ne renvoie le clair que si on l'a généré, pour éviter l'écho
        # du mot de passe saisi par l'admin dans les logs/XHR.
        "temp_password": new_password if not body.new_password else None,
        "must_change_password": user.must_change_password,
    }


@router.put("/{user_id}/deactivate")
def deactivate_user(user_id: uuid.UUID, current_user: User = Depends(admin_only), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    user.is_active = False
    db.commit()
    return {"message": "Compte désactivé"}


@router.delete("/{user_id}")
def delete_user(
    user_id: uuid.UUID,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """
    Suppression DÉFINITIVE d'un compte utilisateur.

    Garde-fous :
      - Un admin ne peut pas se supprimer lui-même (risque de verrouillage).
      - On refuse de supprimer le DERNIER admin actif — sinon plus personne
        ne pourrait administrer la plateforme.
      - Si l'utilisateur a des transactions/comptes liés (created_by, etc.),
        on les met à NULL pour préserver l'audit côté investisseur, plutôt
        que de tout casser en cascade.

    Pour conserver la traçabilité, préférez `/deactivate` qui désactive sans
    perdre l'historique. La suppression dure est utile pour purger les
    comptes de test ou les doublons.
    """
    if user_id == current_user.id:
        raise HTTPException(400, "Vous ne pouvez pas supprimer votre propre compte.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")

    if user.role == "admin":
        # Ne jamais laisser la plateforme sans aucun admin actif.
        remaining_admins = (
            db.query(User)
            .filter(User.role == "admin", User.is_active == True, User.id != user_id)
            .count()
        )
        if remaining_admins == 0:
            raise HTTPException(
                400,
                "Impossible de supprimer le dernier administrateur actif. "
                "Créez ou activez un autre admin d'abord.",
            )

    # Détache les références sortantes (transactions créées, etc.) — on garde
    # leur historique mais la FK passe à NULL. Préférable à un cascade DELETE
    # qui effacerait des opérations comptables légitimes.
    from app.models.transaction import Transaction
    from app.models.investor import Investor
    from app.models.investment import Investment
    from app.models.journal_entry import JournalEntry
    from app.models.message import Message
    from app.models.report import Report
    from app.models.performance import Performance
    from app.models.currency_rate import CurrencyRate
    from app.models.audit_log import AuditLog
    from app.models.pending_action import PendingAction

    db.query(Transaction).filter(Transaction.created_by == user_id).update(
        {"created_by": None}, synchronize_session=False
    )
    db.query(Transaction).filter(Transaction.confirmed_by == user_id).update(
        {"confirmed_by": None}, synchronize_session=False
    )
    for field in ("voided_by", "restored_by", "replayed_by", "last_modified_by"):
        if hasattr(Transaction, field):
            db.query(Transaction).filter(getattr(Transaction, field) == user_id).update(
                {field: None}, synchronize_session=False
            )
    db.query(Investor).filter(Investor.created_by == user_id).update(
        {"created_by": None}, synchronize_session=False
    )
    db.query(Investment).filter(Investment.created_by == user_id).update(
        {"created_by": None}, synchronize_session=False
    )
    db.query(JournalEntry).filter(JournalEntry.posted_by == user_id).update(
        {"posted_by": None}, synchronize_session=False
    )
    db.query(JournalEntry).filter(JournalEntry.created_by == user_id).update(
        {"created_by": None}, synchronize_session=False
    )

    # Identifiants WebAuthn de l'utilisateur — suppression explicite.
    db.query(Message).filter(Message.sender_admin_id == user_id).update(
        {"sender_admin_id": None}, synchronize_session=False
    )
    db.query(Message).filter(Message.read_by == user_id).update(
        {"read_by": None}, synchronize_session=False
    )
    db.query(Message).filter(Message.replied_by == user_id).update(
        {"replied_by": None}, synchronize_session=False
    )
    db.query(Report).filter(Report.generated_by == user_id).update(
        {"generated_by": None}, synchronize_session=False
    )
    db.query(Performance).filter(Performance.calculated_by == user_id).update(
        {"calculated_by": None}, synchronize_session=False
    )
    db.query(CurrencyRate).filter(CurrencyRate.updated_by == user_id).update(
        {"updated_by": None}, synchronize_session=False
    )
    db.query(AuditLog).filter(AuditLog.changed_by == user_id).update(
        {"changed_by": None}, synchronize_session=False
    )
    db.query(PendingAction).filter(PendingAction.reviewed_by == user_id).update(
        {"reviewed_by": None}, synchronize_session=False
    )
    db.query(PendingAction).filter(PendingAction.requested_by == user_id).update(
        {"requested_by": current_user.id}, synchronize_session=False
    )

    from app.models.webauthn_credential import WebAuthnCredential
    db.query(WebAuthnCredential).filter(WebAuthnCredential.user_id == user_id).delete(
        synchronize_session=False
    )

    db.delete(user)
    db.commit()
    return {"deleted": True, "user_id": str(user_id)}


def _user_dict(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "investor_id": str(user.investor_id) if user.investor_id else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
