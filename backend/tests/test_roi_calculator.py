from app.services.roi_calculator import apply_transaction_to_value, compute_roi_from_pnl


def test_company_bailout_increases_company_balance():
    assert apply_transaction_to_value(100.0, "company_bailout", 25.0) == 125.0


def test_company_withdrawal_decreases_company_balance():
    assert apply_transaction_to_value(100.0, "company_withdrawal", 25.0) == 75.0


def test_roi_unavailable_when_pnl_and_current_value_are_negative():
    assert compute_roi_from_pnl(-35815.09, -7000.0) is None


def test_roi_keeps_negative_value_when_current_value_is_positive():
    assert compute_roi_from_pnl(-10.0, 100.0) == -10.0
