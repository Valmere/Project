"""Lance ce script une seule fois pour créer le compte admin initial."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models.user import User
from app.services.auth_service import hash_password

EMAIL = "admin@valmere.com"
PASSWORD = "Admin@2024!"
FULL_NAME = "Administrateur Valmere"

db = SessionLocal()
existing = db.query(User).filter(User.email == EMAIL).first()
if existing:
    print(f"Admin déjà créé : {EMAIL}")
else:
    admin = User(
        email=EMAIL,
        hashed_password=hash_password(PASSWORD),
        full_name=FULL_NAME,
        role="admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    print(f"Admin créé avec succès !")
    print(f"  Email    : {EMAIL}")
    print(f"  Mot de passe : {PASSWORD}")
    print(f"  Changez ce mot de passe après la première connexion.")
db.close()
