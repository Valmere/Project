import uuid
from datetime import date, datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import account, currency_rate, investor, journal_entry, transaction, user  # noqa: F401
from app.models.account import Account
from app.models.currency_rate import CurrencyRate
from app.models.journal_entry import JournalEntry, JournalLine
from app.services import ledger_service


def _db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_income_statement_keeps_original_amount_when_display_currency_matches():
    db = _db()
    try:
        bank = Account(code="5122", name="Banque USD", type="asset")
        gain = Account(code="767", name="Gains financiers investisseurs", type="revenue")
        db.add_all([bank, gain])
        db.add(CurrencyRate(from_currency="USD", to_currency="HTG", rate=150))
        db.flush()

        entry = JournalEntry(
            entry_date=date(2026, 4, 30),
            reference="TX-USD",
            description="Gain facture en USD",
            status="posted",
            posted_at=datetime.now(timezone.utc),
            source_type="transaction",
            source_id=uuid.uuid4(),
        )
        entry.lines = [
            JournalLine(
                account_id=bank.id,
                line_number=1,
                debit=13_049.77,
                credit=0,
                original_currency="USD",
                original_amount=100,
                fx_rate=130.4977,
            ),
            JournalLine(
                account_id=gain.id,
                line_number=2,
                debit=0,
                credit=13_049.77,
                original_currency="USD",
                original_amount=100,
                fx_rate=130.4977,
            ),
        ]
        db.add(entry)
        db.commit()

        statement = ledger_service.income_statement(
            db,
            start=date(2026, 1, 1),
            end=date(2026, 12, 31),
            display_currency="USD",
        )
        gain_line = next(line for line in statement["lines"] if line["code"] == "767")

        assert statement["currency"] == "USD"
        assert gain_line["amount"] == 100
        assert statement["revenue_total"] == 100
        assert statement["net_income"] == 100
    finally:
        db.close()


def test_trial_balance_keeps_original_amount_when_display_currency_matches():
    db = _db()
    try:
        bank = Account(code="5122", name="Banque USD", type="asset")
        gain = Account(code="767", name="Gains financiers investisseurs", type="revenue")
        db.add_all([bank, gain])
        db.add(CurrencyRate(from_currency="USD", to_currency="HTG", rate=150))
        db.flush()

        entry = JournalEntry(
            entry_date=date(2026, 4, 30),
            reference="TX-USD",
            description="Gain facture en USD",
            status="posted",
            posted_at=datetime.now(timezone.utc),
        )
        entry.lines = [
            JournalLine(
                account_id=bank.id,
                line_number=1,
                debit=13_049.77,
                credit=0,
                original_currency="USD",
                original_amount=100,
                fx_rate=130.4977,
            ),
            JournalLine(
                account_id=gain.id,
                line_number=2,
                debit=0,
                credit=13_049.77,
                original_currency="USD",
                original_amount=100,
                fx_rate=130.4977,
            ),
        ]
        db.add(entry)
        db.commit()

        balance = ledger_service.trial_balance(
            db,
            as_of=date(2026, 4, 30),
            display_currency="USD",
        )

        assert balance["currency"] == "USD"
        assert balance["total_debit"] == 100
        assert balance["total_credit"] == 100
        assert balance["is_balanced"] is True
        assert next(line for line in balance["lines"] if line["code"] == "5122")["debit"] == 100
        assert next(line for line in balance["lines"] if line["code"] == "767")["credit"] == 100
    finally:
        db.close()
