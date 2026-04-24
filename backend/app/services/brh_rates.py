"""
BRH (Banque de la République d'Haïti) reference rate scraper.

The BRH homepage (https://www.brh.ht/) publishes a daily reference rate for
USD→HTG in a block like:

    <div class="taux_ref">
        <div class="value"> 130.6550</div>
        <div class="t_title">Taux de Référence</div>
    </div>

For EUR, when available, it appears in an `.autre_data` block with a "Euro"
label and Achat/Vente values. When not published live, we fall back to
deriving EUR→HTG via the ECB EUR/USD cross rate.

This module is intentionally defensive: any failure returns partial results
or an empty list — the caller decides how to surface that to the user.
"""
from __future__ import annotations

import re
from typing import Optional

import httpx

BRH_URL = "https://www.brh.ht/"
ECB_URL = "https://api.frankfurter.app/latest?from=EUR&to=USD"

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def _fetch(url: str, timeout: float = 12.0) -> str:
    with httpx.Client(
        timeout=timeout,
        headers={"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml,*/*"},
        follow_redirects=True,
    ) as client:
        r = client.get(url)
        r.raise_for_status()
        return r.text


def _parse_usd_htg(html: str) -> Optional[float]:
    """
    Extract the USD→HTG reference rate from the BRH homepage.
    """
    # Grab the `<div class="taux_ref"> ... <div class="value"> 130.6550</div>` block
    m = re.search(
        r'class="taux_ref".*?class="value"[^>]*>\s*([0-9]+(?:\.[0-9]+)?)',
        html,
        flags=re.DOTALL,
    )
    if not m:
        return None
    try:
        val = float(m.group(1))
        return val if val > 0 else None
    except ValueError:
        return None


def _parse_eur_htg(html: str) -> Optional[float]:
    """
    Try to extract the EUR→HTG rate (Euro Achat) from the .autre_data block.
    BRH sometimes ships this field commented out — we return None in that case.
    """
    # Find the Euro devise block, then read the first uncommented numeric value.
    m = re.search(
        r'Euro:.*?</div>',  # stops at the closing of the devise block
        html,
        flags=re.DOTALL,
    )
    if not m:
        return None
    block = m.group(0)
    # Strip HTML comments so we only match live values
    block_no_comments = re.sub(r"<!--.*?-->", "", block, flags=re.DOTALL)
    vals = re.findall(r"([0-9]+\.[0-9]{2,6})", block_no_comments)
    if not vals:
        return None
    try:
        v = float(vals[0])
        return v if 50 < v < 500 else None  # sanity bounds for EUR→HTG
    except ValueError:
        return None


def _fallback_eur_htg_via_ecb(usd_htg: float) -> Optional[float]:
    """
    EUR→HTG ≈ (EUR→USD from ECB) × (USD→HTG from BRH).
    """
    try:
        text = _fetch(ECB_URL, timeout=8.0)
    except Exception:
        return None
    m = re.search(r'"USD"\s*:\s*([0-9]+\.[0-9]+)', text)
    if not m:
        return None
    try:
        eur_usd = float(m.group(1))
    except ValueError:
        return None
    return round(eur_usd * usd_htg, 4)


def fetch_brh_rates() -> dict:
    """
    Returns a dict of rates anchored to HTG:

        {
            "USD_HTG": 130.655,
            "EUR_HTG": 149.7018,   # may be missing
            "source": "BRH" | "BRH+ECB",
            "date": "22 Avril 2026",
        }

    Raises RuntimeError if BRH cannot be reached or the USD rate cannot be parsed.
    """
    try:
        html = _fetch(BRH_URL)
    except Exception as e:
        raise RuntimeError(f"BRH unreachable: {e}") from e

    usd_htg = _parse_usd_htg(html)
    if not usd_htg:
        raise RuntimeError("BRH: USD→HTG reference rate not found on homepage")

    eur_htg = _parse_eur_htg(html)
    source = "BRH"
    if not eur_htg:
        derived = _fallback_eur_htg_via_ecb(usd_htg)
        if derived:
            eur_htg = derived
            source = "BRH+ECB"

    # Date shown next to the rate block, e.g. "22 Avril 2026".
    # BRH keeps a commented-out placeholder date in the markup — strip all
    # HTML comments before matching so we only see the live date.
    html_live = re.sub(r"<!--.*?-->", "", html, flags=re.DOTALL)
    date_m = re.search(
        r'class="date"[^>]*>.*?([0-9]{1,2}\s+[A-Za-zéèêûôàî]+\s+[0-9]{4})',
        html_live,
        flags=re.DOTALL,
    )
    date_str = date_m.group(1).strip() if date_m else None

    return {
        "USD_HTG": round(usd_htg, 4),
        "EUR_HTG": round(eur_htg, 4) if eur_htg else None,
        "source": source,
        "date": date_str,
    }
