import base64
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

import webauthn
from webauthn.helpers.structs import PublicKeyCredentialDescriptor

from app.database import get_db
from app.models.user import User
from app.models.webauthn_credential import WebAuthnCredential
from app.services.auth_service import verify_password, create_access_token, hash_password
from app.dependencies.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

# In-memory challenge store (use Redis in production for multi-instance)
_challenges: dict[str, bytes] = {}


class LoginRequest(BaseModel):
    email: str
    password: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class WebAuthnRegisterBeginRequest(BaseModel):
    device_name: str = "Mon appareil"


class WebAuthnRegisterCompleteRequest(BaseModel):
    credential: dict
    device_name: str = "Mon appareil"


class WebAuthnLoginBeginRequest(BaseModel):
    email: str


class WebAuthnLoginCompleteRequest(BaseModel):
    email: str
    credential: dict


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email, User.is_active == True).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe incorrect")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "full_name": user.full_name,
        "must_change_password": bool(user.must_change_password),
    }


@router.post("/change-password")
def change_password(
    body: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Changement de mot de passe utilisé :
      - à la 1ʳᵉ connexion quand `must_change_password=True` (obligatoire)
      - depuis les paramètres à tout moment (volontaire)
    """
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(400, "Mot de passe actuel incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(400, "Le nouveau mot de passe doit contenir au moins 8 caractères")
    if body.new_password == body.current_password:
        raise HTTPException(400, "Le nouveau mot de passe doit être différent de l'actuel")

    current_user.hashed_password = hash_password(body.new_password)
    current_user.must_change_password = False
    db.commit()
    return {"message": "Mot de passe modifié avec succès"}


@router.post("/webauthn/register/begin")
def webauthn_register_begin(
    body: WebAuthnRegisterBeginRequest,
    current_user: User = Depends(get_current_user),
):
    options = webauthn.generate_registration_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=str(current_user.id).encode(),
        user_name=current_user.email,
        user_display_name=current_user.full_name,
    )
    _challenges[current_user.email] = options.challenge
    return json.loads(webauthn.options_to_json(options))


@router.post("/webauthn/register/complete")
def webauthn_register_complete(
    body: WebAuthnRegisterCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    challenge = _challenges.pop(current_user.email, None)
    if not challenge:
        raise HTTPException(status_code=400, detail="Challenge expiré, recommencez")

    try:
        credential_str = json.dumps(body.credential)
        verification = webauthn.verify_registration_response(
            credential=webauthn.parse_registration_credential_json(credential_str),
            expected_challenge=challenge,
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=settings.WEBAUTHN_ORIGIN,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Enregistrement biométrique échoué: {e}")

    cred = WebAuthnCredential(
        user_id=current_user.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        device_name=body.device_name,
    )
    db.add(cred)
    db.commit()
    return {"message": "Biométrie enregistrée avec succès"}


@router.post("/webauthn/login/begin")
def webauthn_login_begin(body: WebAuthnLoginBeginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    credentials = db.query(WebAuthnCredential).filter(WebAuthnCredential.user_id == user.id).all()
    if not credentials:
        raise HTTPException(status_code=404, detail="Aucun appareil biométrique enregistré")

    allow_credentials = [PublicKeyCredentialDescriptor(id=c.credential_id) for c in credentials]
    options = webauthn.generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        allow_credentials=allow_credentials,
    )
    _challenges[body.email] = options.challenge
    return json.loads(webauthn.options_to_json(options))


@router.post("/webauthn/login/complete")
def webauthn_login_complete(body: WebAuthnLoginCompleteRequest, db: Session = Depends(get_db)):
    challenge = _challenges.pop(body.email, None)
    if not challenge:
        raise HTTPException(status_code=400, detail="Challenge expiré, recommencez")

    user = db.query(User).filter(User.email == body.email, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    credential_str = json.dumps(body.credential)
    parsed = webauthn.parse_authentication_credential_json(credential_str)

    cred = db.query(WebAuthnCredential).filter(
        WebAuthnCredential.user_id == user.id,
        WebAuthnCredential.credential_id == parsed.raw_id,
    ).first()
    if not cred:
        raise HTTPException(status_code=400, detail="Appareil non reconnu")

    try:
        verification = webauthn.verify_authentication_response(
            credential=parsed,
            expected_challenge=challenge,
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=settings.WEBAUTHN_ORIGIN,
            credential_public_key=cred.public_key,
            credential_current_sign_count=cred.sign_count,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Authentification biométrique échouée: {e}")

    cred.sign_count = verification.new_sign_count
    cred.last_used_at = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"access_token": token, "token_type": "bearer", "role": user.role, "full_name": user.full_name}
