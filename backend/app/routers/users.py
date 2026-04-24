import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.user import User
from app.dependencies.auth import get_current_user, admin_only
from app.services.auth_service import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

VALID_ROLES = {"admin", "analyst", "investor"}


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "investor"
    investor_id: uuid.UUID | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None
    role: str | None = None
    investor_id: uuid.UUID | None = None


class PasswordChange(BaseModel):
    new_password: str


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "investor_id": current_user.investor_id,
        "must_change_password": bool(current_user.must_change_password),
    }


@router.get("")
def list_users(current_user: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [_user_dict(u) for u in db.query(User).all()]


@router.post("", status_code=201)
def create_user(
    body: UserCreate,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"Rôle invalide. Valeurs acceptées : {', '.join(VALID_ROLES)}")
    if len(body.password) < 8:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 8 caractères")
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(409, "Un compte avec cet email existe déjà")

    user = User(
        email=body.email,
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
    # Use exclude_unset so explicit `null` values (e.g. unlinking an investor)
    # are applied, while fields the client didn't send are left alone.
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(user, field, val)
    db.commit()
    db.refresh(user)
    return _user_dict(user)


@router.put("/{user_id}/deactivate")
def deactivate_user(user_id: uuid.UUID, current_user: User = Depends(admin_only), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    user.is_active = False
    db.commit()
    return {"message": "Compte désactivé"}


def _user_dict(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "investor_id": str(user.investor_id) if user.investor_id else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
