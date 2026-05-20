import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import account, investor, investment, journal_entry, transaction, user  # noqa: F401
from app.models.account import Account
from app.models.investment import Investment
from app.models.investor import Investor
from app.models.transaction import Transaction
from app.models.journal_entry import JournalEntry, JournalLine
from app.routers.transactions import VALID_TYPES
from app.services.accounting_posting import (
    AccountCache,
    SUPPORTED_TRANSACTION_TYPES,
    _build_entry_for_transaction,
    _repair_bailout_entry_if_needed,
    _repair_entry_if_needed,
    ensure_posted_for_transaction,
)


INVESTOR_ID = uuid.uuid4()
INVESTMENT_ID = uuid.uuid4()


class DummyInvestmentQuery:
    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return SimpleNamespace(investor_id=INVESTOR_ID)


class DummyInvestorQuery:
    def __init__(self, is_company=False):
        self.is_company = is_company

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return SimpleNamespace(id=INVESTOR_ID, is_company=self.is_company)


class DummyDb:
    def __init__(self, is_company=False):
        self.is_company = is_company

    def query(self, *_args, **_kwargs):
        if _args and _args[0] is Investor:
            return DummyInvestorQuery(self.is_company)
        return DummyInvestmentQuery()


class DummyJournalEntryQuery:
    def __init__(self, entry):
        self.entry = entry

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self.entry


class DummyRepairDb:
    def __init__(self, entry):
        self.entry = entry

    def query(self, *args, **_kwargs):
        if args and args[0] is JournalEntry:
            return DummyJournalEntryQuery(self.entry)
        return DummyInvestmentQuery()

    def delete(self, _obj):
        return None

    def flush(self):
        return None

    def add(self, _obj):
        return None


class DummyRates:
    def get(self, *_args, **_kwargs):
        return 1.0

    def convert(self, amount, *_args, **_kwargs):
        return float(amount)


class DummyAccounts:
    def __init__(self):
        self.by_code = {
            code: SimpleNamespace(id=uuid.uuid4(), code=code, name=code)
            for code in ("101", "421", "5121", "666", "667", "766", "767", "706")
        }

    def get(self, code):
        return self.by_code[code]

    def bank(self, _currency):
        return self.by_code["5121"]


def _transaction(tx_type: str) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        investment_id=INVESTMENT_ID,
        investor_id=INVESTOR_ID,
        type=tx_type,
        amount=100,
        currency="HTG",
        transaction_date=date(2026, 1, 1),
    )


def _posted_account_codes(tx_type: str, *, is_company: bool = False) -> tuple[str, str]:
    accounts = DummyAccounts()
    id_to_code = {account.id: code for code, account in accounts.by_code.items()}
    entry = _build_entry_for_transaction(
        DummyDb(is_company=is_company),
        _transaction(tx_type),
        DummyRates(),
        accounts,
        posted_by=uuid.uuid4(),
    )
    debit_line = next(line for line in entry.lines if float(line.debit or 0) > 0)
    credit_line = next(line for line in entry.lines if float(line.credit or 0) > 0)
    return id_to_code[debit_line.account_id], id_to_code[credit_line.account_id]


def _posted_lines(tx: Transaction):
    entry = _build_entry_for_transaction(
        DummyDb(),
        tx,
        DummyRates(),
        DummyAccounts(),
        posted_by=uuid.uuid4(),
    )
    return sorted(entry.lines, key=lambda line: line.line_number)


def test_accounting_supports_every_api_transaction_type():
    assert VALID_TYPES <= SUPPORTED_TRANSACTION_TYPES


@pytest.mark.parametrize(
    ("tx_type", "expected_debit", "expected_credit"),
    [
        ("deposit", "5121", "421"),
        ("initial", "5121", "421"),
        ("initial_capital", "5121", "421"),
        ("bailout", "5121", "421"),
        ("company_bailout", "5121", "101"),
        ("withdrawal", "421", "5121"),
        ("company_withdrawal", "101", "5121"),
        ("gain", "5121", "767"),
        ("loss", "667", "5121"),
        ("fee", "421", "706"),
    ],
)
def test_accounting_posting_maps_all_transaction_types(
    tx_type,
    expected_debit,
    expected_credit,
):
    assert _posted_account_codes(tx_type) == (expected_debit, expected_credit)


@pytest.mark.parametrize(
    ("tx_type", "expected_debit", "expected_credit"),
    [
        ("gain", "5121", "766"),
        ("loss", "666", "5121"),
        ("fee", "5121", "706"),
        ("bailout", "5121", "101"),
    ],
)
def test_company_accounting_updates_company_balance_accounts(
    tx_type,
    expected_debit,
    expected_credit,
):
    assert _posted_account_codes(tx_type, is_company=True) == (expected_debit, expected_credit)


def test_bailout_accounting_uses_entered_target_not_internal_delta():
    tx = _transaction("bailout")
    tx.amount = 161_504
    tx.currency = "HTG"
    tx.display_amount = 50_000
    tx.display_currency = "HTG"

    debit_line, credit_line = _posted_lines(tx)

    assert float(debit_line.debit) == 50_000
    assert float(credit_line.credit) == 50_000
    assert float(debit_line.original_amount) == 50_000
    assert float(credit_line.original_amount) == 50_000


def test_bailout_accounting_falls_back_to_entered_amount_in_description():
    tx = _transaction("bailout")
    tx.amount = 545.7331
    tx.currency = "USD"
    tx.description = "Nouvelle valeur : 500.00 USD"

    debit_line, credit_line = _posted_lines(tx)

    assert float(debit_line.debit) == 500
    assert float(credit_line.credit) == 500
    assert debit_line.original_currency == "USD"
    assert float(debit_line.original_amount) == 500


def test_backfill_repair_updates_existing_bailout_entry_to_entered_target():
    accounts = DummyAccounts()
    tx = _transaction("bailout")
    tx.amount = 161_504
    tx.currency = "HTG"
    tx.display_amount = 50_000
    tx.display_currency = "HTG"

    old_tx = _transaction("bailout")
    old_tx.id = tx.id
    old_tx.investment_id = tx.investment_id
    old_tx.investor_id = tx.investor_id
    old_tx.amount = tx.amount
    old_tx.currency = tx.currency
    old_tx.transaction_date = tx.transaction_date
    old_entry = _build_entry_for_transaction(
        DummyDb(),
        old_tx,
        DummyRates(),
        accounts,
        posted_by=uuid.uuid4(),
    )
    assert any(float(line.debit or 0) == 161_504 for line in old_entry.lines)

    repaired = _repair_bailout_entry_if_needed(
        DummyRepairDb(old_entry),
        tx,
        DummyRates(),
        accounts,
        posted_by=uuid.uuid4(),
    )

    assert repaired is True
    debit_line, credit_line = sorted(old_entry.lines, key=lambda line: line.line_number)
    assert float(debit_line.debit) == 50_000
    assert float(credit_line.credit) == 50_000
    assert float(debit_line.original_amount) == 50_000
    assert float(credit_line.original_amount) == 50_000


def test_repair_updates_existing_loss_entry_to_expense_mapping():
    accounts = DummyAccounts()
    tx = _transaction("loss")
    old_entry = JournalEntry(
        id=uuid.uuid4(),
        entry_date=tx.transaction_date,
        reference=f"TX-{str(tx.id)[:8]}",
        description="Distribution loss",
        status="posted",
        source_type="transaction",
        source_id=tx.id,
    )
    old_entry.lines = [
        JournalLine(
            account_id=accounts.by_code["421"].id,
            line_number=1,
            debit=100,
            credit=0,
            original_currency="HTG",
            original_amount=100,
            fx_rate=1,
            investor_id=tx.investor_id,
        ),
        JournalLine(
            account_id=accounts.by_code["766"].id,
            line_number=2,
            debit=0,
            credit=100,
            original_currency="HTG",
            original_amount=100,
            fx_rate=1,
            investor_id=tx.investor_id,
        ),
    ]

    repaired = _repair_entry_if_needed(
        DummyRepairDb(old_entry),
        tx,
        DummyRates(),
        accounts,
        posted_by=uuid.uuid4(),
    )

    assert repaired is True
    id_to_code = {account.id: code for code, account in accounts.by_code.items()}
    debit_line, credit_line = sorted(old_entry.lines, key=lambda line: line.line_number)
    assert id_to_code[debit_line.account_id] == "667"
    assert id_to_code[credit_line.account_id] == "5121"


def test_ensure_posted_repairs_existing_bailout_entry():
    accounts = DummyAccounts()
    tx = _transaction("bailout")
    tx.amount = 161_504
    tx.currency = "HTG"
    tx.display_amount = 50_000
    tx.display_currency = "HTG"

    old_tx = _transaction("bailout")
    old_tx.id = tx.id
    old_tx.investment_id = tx.investment_id
    old_tx.investor_id = tx.investor_id
    old_tx.amount = tx.amount
    old_tx.currency = tx.currency
    old_tx.transaction_date = tx.transaction_date
    old_entry = _build_entry_for_transaction(
        DummyDb(),
        old_tx,
        DummyRates(),
        accounts,
        posted_by=uuid.uuid4(),
    )

    returned = ensure_posted_for_transaction(
        DummyRepairDb(old_entry),
        tx,
        rates=DummyRates(),
        accounts=accounts,
        posted_by=uuid.uuid4(),
        commit=False,
    )

    assert returned is old_entry
    debit_line, credit_line = sorted(old_entry.lines, key=lambda line: line.line_number)
    assert float(debit_line.debit) == 50_000
    assert float(credit_line.credit) == 50_000


def test_bailout_repair_persists_replacement_lines_in_database_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        accounts = [
            Account(code="101", name="Capital social", type="equity"),
            Account(code="421", name="Comptes investisseurs", type="liability"),
            Account(code="5121", name="Banque HTG", type="asset"),
            Account(code="666", name="Pertes financieres", type="expense"),
            Account(code="667", name="Pertes financieres investisseurs", type="expense"),
            Account(code="766", name="Gains financiers", type="revenue"),
            Account(code="767", name="Gains financiers investisseurs", type="revenue"),
            Account(code="706", name="Commissions", type="revenue"),
        ]
        invr_id = uuid.uuid4()
        port_id = uuid.uuid4()
        tx_id = uuid.uuid4()
        invr = Investor(
            id=invr_id,
            code="INV-TEST",
            full_name="Test Investor",
            entry_date=date(2026, 1, 1),
        )
        port = Investment(
            id=port_id,
            investor_id=invr_id,
            name="Test Portfolio",
            currency="HTG",
            initial_capital=0,
            current_value=0,
            start_date=date(2026, 1, 1),
        )
        tx = Transaction(
            id=tx_id,
            investment_id=port_id,
            investor_id=invr_id,
            type="bailout",
            amount=161_504,
            currency="HTG",
            display_amount=50_000,
            display_currency="HTG",
            transaction_date=date(2026, 1, 2),
            status="active",
        )
        db.add_all([*accounts, invr, port, tx])
        db.flush()

        old_tx = Transaction(
            id=tx_id,
            investment_id=port_id,
            investor_id=invr_id,
            type="bailout",
            amount=161_504,
            currency="HTG",
            transaction_date=date(2026, 1, 2),
            status="active",
        )
        old_entry = _build_entry_for_transaction(
            db,
            old_tx,
            DummyRates(),
            AccountCache(db),
            posted_by=uuid.uuid4(),
        )
        db.add(old_entry)
        db.commit()

        repaired = _repair_bailout_entry_if_needed(
            db,
            tx,
            DummyRates(),
            AccountCache(db),
            posted_by=uuid.uuid4(),
        )
        assert repaired is True
        db.commit()
        db.close()

        db = Session()
        persisted = (
            db.query(JournalEntry)
            .filter(
                JournalEntry.source_type == "transaction",
                JournalEntry.source_id == tx_id,
            )
            .one()
        )
        lines = sorted(persisted.lines, key=lambda line: line.line_number)
        assert len(lines) == 2
        assert float(lines[0].debit) == 50_000
        assert float(lines[1].credit) == 50_000
        assert float(lines[0].original_amount) == 50_000
        assert float(lines[1].original_amount) == 50_000
    finally:
        db.close()
