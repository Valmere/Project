def compute_roi(opening_value: float, closing_value: float, net_deposits: float = 0) -> float:
    """Méthode Dietz modifiée — tient compte des dépôts/retraits en cours de période."""
    if opening_value == 0:
        return 0.0
    return round(((closing_value - opening_value - net_deposits) / opening_value) * 100, 4)


def compute_max_drawdown(value_series: list[float]) -> float:
    """Plus grande chute depuis un pic (en %)."""
    if not value_series:
        return 0.0
    peak = value_series[0]
    max_dd = 0.0
    for v in value_series:
        if v > peak:
            peak = v
        if peak > 0:
            dd = (peak - v) / peak * 100
            if dd > max_dd:
                max_dd = dd
    return round(max_dd, 4)


def compute_pnl(opening_value: float, closing_value: float) -> float:
    return round(closing_value - opening_value, 4)


SIGN_MAP = {"deposit": 1, "gain": 1, "withdrawal": -1, "loss": -1, "fee": -1}


def apply_transaction_to_value(current_value: float, tx_type: str, amount: float) -> float:
    sign = SIGN_MAP.get(tx_type, 0)
    return round(current_value + sign * amount, 4)
