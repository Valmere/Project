from app.routers.investors import (
    _company_share_from_investor_global_shares,
    _share_base,
)


def test_company_share_is_100_minus_investor_global_shares():
    investor_values = [1000.0, -500.0, 500.0]
    company_value = 500.0

    investor_share_bases = [_share_base(value) for value in investor_values]

    assert _company_share_from_investor_global_shares(
        investor_share_bases,
        _share_base(company_value),
    ) == 25.0

