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


@app.get("/")
def root():
    return {"message": "Valmere & Co API — en ligne"}
