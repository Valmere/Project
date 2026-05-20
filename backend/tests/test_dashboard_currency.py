import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.routers.dashboard import (
    _aggregate_transactions,
    _build_chart_from_transactions,
    _current_values_by_investment,
)


class FakeRates:
    def convert(self, amount, from_currency, to_currency, *, strict=True, missing=None):
        fc = (from_currency or "HTG").upper()
        tc = (to_currency or "HTG").upper()
        value = float(amount or 0)
        if fc == tc:
            return value
        if fc == "HTG" and tc == "USD":
            return value / 130
        if fc == "USD" and tc == "HTG":
            return value * 130
        if missing is not None:
            missing.add(f"{fc}->{tc}")
        return value


def _tx(investment_id, tx_type, amount, currency, day, **extra):
    return SimpleNamespace(
        id=uuid.uuid4(),
        investment_id=investment_id,
        type=tx_type,
        amount=amount,
        currency=currency,
        transaction_date=day,
        created_at=datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc),
        **extra,
    )


def test_bailout_resets_current_value_to_entered_amount():
    investment_id = uuid.uuid4()
    investment = SimpleNamespace(id=investment_id, initial_capital=0, currency="USD")
    txs = [
        _tx(investment_id, "loss", 910_001.3, "HTG", date(2026, 1, 1)),
        _tx(
            investment_id,
            "bailout",
            15_000,
            "USD",
            date(2026, 1, 2),
            display_amount=8_000,
            display_currency="USD",
        ),
    ]

    current = _current_values_by_investment(
        [investment], txs, FakeRates(), "USD", set()
    )

    assert current[investment_id] == 8_000


def test_chart_uses_bailout_as_current_value_reset():
    investment_id = uuid.uuid4()
    investment = SimpleNamespace(id=investment_id, initial_capital=0, currency="USD")
    txs = [
        _tx(investment_id, "loss", 910_001.3, "HTG", date(2026, 1, 1)),
        _tx(
            investment_id,
            "bailout",
            15_000,
            "USD",
            date(2026, 1, 2),
            display_amount=8_000,
            display_currency="USD",
        ),
    ]

    chart = _build_chart_from_transactions(
        [investment],
        txs,
        FakeRates(),
        "USD",
        set(),
        date(2026, 1, 1),
        date(2026, 1, 2),
        "day",
    )

    assert chart[-1]["closing_value"] == 8_000


def test_chart_roi_restarts_after_bailout():
    investment_id = uuid.uuid4()
    investment = SimpleNamespace(id=investment_id, initial_capital=0, currency="USD")
    txs = [
        _tx(investment_id, "loss", 200, "USD", date(2026, 1, 1)),
        _tx(
            investment_id,
            "bailout",
            300,
            "USD",
            date(2026, 1, 2),
            display_amount=100,
            display_currency="USD",
        ),
        _tx(investment_id, "gain", 5, "USD", date(2026, 1, 3)),
    ]

    chart = _build_chart_from_transactions(
        [investment],
        txs,
        FakeRates(),
        "USD",
        set(),
        date(2026, 1, 1),
        date(2026, 1, 3),
        "day",
    )

    assert chart[-1]["closing_value"] == 105
    assert chart[-1]["roi_pct"] == 4.76


def test_dashboard_pnl_period_ignores_losses_before_latest_bailout():
    investment_id = uuid.uuid4()
    txs = [
        _tx(investment_id, "loss", 200, "USD", date(2026, 1, 1)),
        _tx(
            investment_id,
            "bailout",
            300,
            "USD",
            date(2026, 1, 2),
            display_amount=100,
            display_currency="USD",
        ),
        _tx(investment_id, "gain", 5, "USD", date(2026, 1, 3)),
    ]

    agg = _aggregate_transactions(
        txs,
        FakeRates(),
        date(2026, 1, 1),
        date(2026, 1, 3),
        date(2026, 1, 1),
        "day",
        set(),
        target_ccy="USD",
    )

    assert agg["realized_total"] == 5
    assert agg["pnl_period"] == 5
