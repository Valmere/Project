import uuid
from datetime import date
from types import SimpleNamespace

from app.routers.investors import (
    _invested_from_transactions,
    _portfolio_values_from_transactions,
)
from app.services.portfolio_math import portfolio_totals_by_investor


class DummyRates:
    def convert(self, amount, *_args, **_kwargs):
        return float(amount or 0)


def _tx(investment_id, investor_id, tx_type, amount, *, display_amount=None, day=1):
    return SimpleNamespace(
        id=uuid.uuid4(),
        investment_id=investment_id,
        investor_id=investor_id,
        type=tx_type,
        amount=amount,
        currency="HTG",
        display_amount=display_amount,
        display_currency="HTG" if display_amount is not None else None,
        transaction_date=date(2026, 1, day),
        created_at=None,
    )


def test_investor_values_use_bailout_as_current_value_reset():
    investor_id = uuid.uuid4()
    investment_id = uuid.uuid4()
    investment = SimpleNamespace(
        id=investment_id,
        investor_id=investor_id,
        initial_capital=0,
        currency="HTG",
    )
    txs = [
        _tx(investment_id, investor_id, "deposit", 10_000, day=1),
        _tx(investment_id, investor_id, "loss", 20_000, day=2),
        _tx(investment_id, investor_id, "bailout", 70_000, display_amount=50_000, day=3),
        _tx(investment_id, investor_id, "gain", 5_000, day=4),
    ]

    current_by_inv, initial_by_inv = _portfolio_values_from_transactions(
        [investment],
        txs,
        DummyRates(),
        "HTG",
    )
    invested_by_inv = _invested_from_transactions(txs, DummyRates(), "HTG")
    totals = portfolio_totals_by_investor([investment], txs, DummyRates(), "HTG")

    assert initial_by_inv[investor_id] == 0
    assert current_by_inv[investor_id] == 55_000
    assert invested_by_inv[investor_id] == 60_000
    assert totals["pnl_by_investor"][investor_id] == 5_000


def test_company_bailout_resets_current_value_like_investors():
    company_id = uuid.uuid4()
    investment_id = uuid.uuid4()
    investment = SimpleNamespace(
        id=investment_id,
        investor_id=company_id,
        initial_capital=0,
        currency="HTG",
    )
    txs = [
        _tx(investment_id, company_id, "company_bailout", 1_000, day=1),
        _tx(investment_id, company_id, "bailout", 700, display_amount=500, day=2),
        _tx(investment_id, company_id, "loss", 200, day=3),
    ]

    totals = portfolio_totals_by_investor(
        [investment],
        txs,
        DummyRates(),
        "HTG",
        company_investor_ids={company_id},
    )

    assert totals["current_by_investor"][company_id] == 300
    assert totals["invested_by_investor"][company_id] == 1_500
    assert totals["pnl_by_investor"][company_id] == -200
