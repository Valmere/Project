from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, investors, investments, transactions, performances, reports, dashboard, messages, company, users, currency_rates, about, faq, accounting

app = FastAPI(title="Valmere & Co — Portail Investisseur", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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


@app.get("/")
def root():
    return {"message": "Valmere & Co API — en ligne"}
