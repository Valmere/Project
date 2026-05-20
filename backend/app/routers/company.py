from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional

from app.database import get_db
from app.models.company_settings import CompanySettings
from app.models.user import User
from app.dependencies.auth import get_current_user, admin_only
from app.services import storage_service
from app.config import settings as app_settings

router = APIRouter(prefix="/api/company", tags=["company"])


class ProfitPolicyUpdate(BaseModel):
    # Ratios entre 0 et 1, doivent sommer à 1.0 (à 1e-6 près).
    profit_share_company: float = Field(..., ge=0, le=1)
    profit_share_investors: float = Field(..., ge=0, le=1)


class TransparencyUpdate(BaseModel):
    show_fx_rate_to_investors: bool


def _get_or_create(db: Session) -> CompanySettings:
    company = db.query(CompanySettings).first()
    if not company:
        company = CompanySettings()
        db.add(company)
        db.commit()
        db.refresh(company)
    return company


@router.get("")
def get_company(db: Session = Depends(get_db)):
    return _get_or_create(db)


@router.put("")
async def update_company(
    company_name: Optional[str] = Form(None),
    company_type: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    primary_color: Optional[str] = Form(None),
    secondary_color: Optional[str] = Form(None),
    logo: Optional[UploadFile] = File(None),
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    company = _get_or_create(db)

    fields = {
        "company_name": company_name,
        "company_type": company_type,
        "location": location,
        "email": email,
        "phone": phone,
        "primary_color": primary_color,
        "secondary_color": secondary_color,
    }
    for field, value in fields.items():
        if value is not None:
            setattr(company, field, value)

    if logo and logo.filename:
        ext = logo.filename.rsplit(".", 1)[-1] if "." in logo.filename else "png"
        path = f"logo.{ext}"
        file_bytes = await logo.read()
        storage_service.upload_file(app_settings.SUPABASE_LOGO_BUCKET, path, file_bytes, logo.content_type or "image/png")
        company.logo_url = storage_service.get_public_url(app_settings.SUPABASE_LOGO_BUCKET, path)

    company.updated_by = current_user.id
    db.commit()
    db.refresh(company)
    return company


@router.put("/profit-policy")
def update_profit_policy(
    body: ProfitPolicyUpdate,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """
    Met à jour la politique de répartition des bénéfices/pertes :
    quel ratio va à la société (personne morale Valmere & Co) vs à la
    distribution pro-rata aux investisseurs. La somme doit faire 1.0.
    """
    if abs((body.profit_share_company + body.profit_share_investors) - 1.0) > 1e-6:
        raise HTTPException(
            400,
            "Les deux ratios doivent sommer à 1 (100%). "
            f"Reçu : {body.profit_share_company} + {body.profit_share_investors} "
            f"= {body.profit_share_company + body.profit_share_investors:.4f}",
        )
    company = _get_or_create(db)
    company.profit_share_company = body.profit_share_company
    company.profit_share_investors = body.profit_share_investors
    company.updated_by = current_user.id
    db.commit()
    db.refresh(company)
    return {
        "profit_share_company": float(company.profit_share_company),
        "profit_share_investors": float(company.profit_share_investors),
    }


@router.put("/transparency")
def update_transparency(
    body: TransparencyUpdate,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    """
    Pilote la visibilité, côté investisseur, du taux de change figé au
    moment de chaque transaction. Désactivé par défaut.
    """
    company = _get_or_create(db)
    company.show_fx_rate_to_investors = bool(body.show_fx_rate_to_investors)
    company.updated_by = current_user.id
    db.commit()
    db.refresh(company)
    return {"show_fx_rate_to_investors": bool(company.show_fx_rate_to_investors)}
