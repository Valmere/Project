import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, investors, investments, transactions, performances, reports, dashboard, messages, company, users, currency_rates, about, faq, accounting, approvals, notifications

app = FastAPI(title="Valmere & Co — Portail Investisseur", version="1.0.0")

# Lecture des origines CORS depuis l'environnement.
#   - En production (Render) : CORS_ORIGINS=https://valmere-co.netlify.app
#   - En local : on retombe sur localhost:5173 / 3000 par défaut.
# Plusieurs origines possibles : séparateur virgule. Espaces tolérés.
_default_origins = "http://localhost:5173,http://localhost:3000"
_cors_env = os.getenv("CORS_ORIGINS", _default_origins)
allow_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(company.router)
app.include_router(investors.router)
app.include_router(investments.router)
app.include_router(transactions.router)
app.include_router(performances.router)
app.include_router(reports.router)
app.include_router(dashboard.router)
app.include_router(messages.router)
app.include_router(currency_rates.router)
app.include_router(about.router)
app.include_router(faq.router)
app.include_router(accounting.router)
app.include_router(approvals.router)
app.include_router(notifications.router)


@app.api_route("/", methods=["GET", "HEAD"])
def root():
    # Accepte GET et HEAD pour que les services de monitoring (UptimeRobot,
    # Render health check, etc.) qui pingent en HEAD ne reçoivent pas 405.
    return {"message": "Valmere & Co API — en ligne"}


@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    # Endpoint dédié au monitoring : léger, sans accès DB.
    # À utiliser dans UptimeRobot comme URL surveillée.
    return {"status": "ok"}
