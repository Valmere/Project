import base64
import io
import os
import tempfile
from datetime import date

from fpdf import FPDF
from PIL import Image, ImageChops

from app.services.portfolio_math import (
    TX_SIGNS,
    is_effective_pnl_tx,
    is_initial_capital_tx,
    latest_bailout_key_by_investment,
    transaction_business_amount_and_currency,
    tx_sort_key,
)
from app.services.roi_calculator import compute_roi_from_pnl


_REPLACEMENTS = str.maketrans({
    "\u2014": "-",
    "\u2013": "-",
    "\u2212": "-",
    "\u2192": "->",
    "\u2190": "<-",
    "\u2026": "...",
    "\u2018": "'",
    "\u2019": "'",
    "\u201C": '"',
    "\u201D": '"',
    "\u00A0": " ",
    "\u202F": " ",
    "\u2022": "*",
})


def _s(value) -> str:
    if value is None:
        return "-"
    text = str(value).translate(_REPLACEMENTS)
    return text.encode("latin-1", "replace").decode("latin-1")


PRIMARY = (26, 39, 64)
PRIMARY_2 = (36, 55, 87)
GOLD = (201, 162, 73)
GOLD_LIGHT = (229, 197, 122)
IVORY = (232, 228, 216)
PAPER = (250, 250, 247)
CREAM = (253, 249, 238)
LIGHT_BG = (247, 248, 250)
WHITE = (255, 255, 255)
DARK = (51, 51, 51)
GRAY = (120, 130, 150)

TYPE_COLORS = {
    "initial": (30, 64, 175),
    "deposit": (22, 163, 74),
    "withdrawal": (220, 38, 38),
    "gain": (5, 150, 105),
    "loss": (185, 28, 28),
    "fee": (100, 116, 139),
    "bailout": (146, 64, 14),
}

LABELS = {
    "fr": {
        "confidential": "Document confidentiel",
        "statement": "Releve de compte",
        "investor": "Investisseur",
        "initial": "Apport initial",
        "initial_deposit": "Apport initial a l'ouverture du compte",
        "generated": "Genere le",
        "period": "Periode",
        "all_transactions": "Toutes les transactions",
        "entry": "Entree",
        "status": "Statut",
        "invested": "Capital investi",
        "current": "Valeur actuelle",
        "roi": "ROI",
        "pnl": "Gain / Perte",
        "history": "Historique des transactions",
        "performances": "Performances par periode",
        "date": "Date",
        "type": "Type",
        "amount": "Montant",
        "description": "Description",
        "reference": "Reference",
        "signature": "Signature de l'administrateur",
        "signed_by": "Signe par",
    },
    "en": {
        "confidential": "Confidential document",
        "statement": "Account statement",
        "investor": "Investor",
        "initial": "Initial capital",
        "initial_deposit": "Initial deposit at account opening",
        "generated": "Generated on",
        "period": "Period",
        "all_transactions": "All transactions",
        "entry": "Entry",
        "status": "Status",
        "invested": "Invested capital",
        "current": "Current value",
        "roi": "ROI",
        "pnl": "Gain / Loss",
        "history": "Transaction history",
        "performances": "Performance by period",
        "date": "Date",
        "type": "Type",
        "amount": "Amount",
        "description": "Description",
        "reference": "Reference",
        "signature": "Administrator signature",
        "signed_by": "Signed by",
    },
    "es": {
        "confidential": "Documento confidencial",
        "statement": "Estado de cuenta",
        "investor": "Inversor",
        "initial": "Capital inicial",
        "initial_deposit": "Aporte inicial al abrir la cuenta",
        "generated": "Generado el",
        "period": "Periodo",
        "all_transactions": "Todas las transacciones",
        "entry": "Entrada",
        "status": "Estado",
        "invested": "Capital invertido",
        "current": "Valor actual",
        "roi": "ROI",
        "pnl": "Ganancia / Perdida",
        "history": "Historial de transacciones",
        "performances": "Rendimiento por periodo",
        "date": "Fecha",
        "type": "Tipo",
        "amount": "Importe",
        "description": "Descripcion",
        "reference": "Referencia",
        "signature": "Firma del administrador",
        "signed_by": "Firmado por",
    },
}


def _labels(lang: str | None) -> dict[str, str]:
    return LABELS.get((lang or "fr").lower(), LABELS["fr"])


def _signature_tempfile(data_url: str | None) -> str | None:
    if not data_url or "," not in data_url:
        return None
    header, payload = data_url.split(",", 1)
    if "image/png" in header:
        suffix = ".png"
    elif "image/jpeg" in header or "image/jpg" in header:
        suffix = ".jpg"
    else:
        return None
    try:
        raw = base64.b64decode(payload, validate=True)
    except Exception:
        return None
    if not raw:
        return None
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGBA")
        full_box = (0, 0, image.width, image.height)
        alpha_bbox = image.getchannel("A").getbbox()
        bg = Image.new("RGBA", image.size, (255, 255, 255, 255))
        diff_bbox = ImageChops.difference(image, bg).getbbox()
        bbox = alpha_bbox if alpha_bbox and alpha_bbox != full_box else diff_bbox
        if bbox:
            pad = 10
            left = max(0, bbox[0] - pad)
            top = max(0, bbox[1] - pad)
            right = min(image.width, bbox[2] + pad)
            bottom = min(image.height, bbox[3] + pad)
            image = image.crop((left, top, right, bottom))
        image.save(tmp.name, "PNG")
        return tmp.name
    finally:
        tmp.close()


def _image_tempfile_from_bytes(raw: bytes | None) -> str | None:
    if not raw:
        return None
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGBA")
        image.thumbnail((360, 180))
        image.save(tmp.name, "PNG")
        return tmp.name
    except Exception:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        return None
    finally:
        tmp.close()


def _logo_tempfile(url: str | None) -> str | None:
    if not url:
        return None
    try:
        import urllib.request
        with urllib.request.urlopen(url, timeout=5) as response:
            return _image_tempfile_from_bytes(response.read())
    except Exception:
        return None


class StatementPDF(FPDF):
    def header(self):
        pass

    def cell(self, w=0, h=0, text="", *args, **kwargs):
        return super().cell(w, h, _s(text), *args, **kwargs)

    def multi_cell(self, w=0, h=0, text="", *args, **kwargs):
        return super().multi_cell(w, h, _s(text), *args, **kwargs)

    def text(self, x, y, text=""):
        return super().text(x, y, _s(text))

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(*GRAY)
        self.cell(0, 10, self.footer_left, align="L")
        self.cell(0, 10, f"Page {self.page_no()}", align="R")

    def _section_title(self, text: str):
        self.set_fill_color(*WHITE)
        self.set_draw_color(*IVORY)
        self.set_text_color(*PRIMARY)
        self.set_font("Times", "B", 12)
        self.cell(0, 9, f"  {text}", fill=True, border=1, ln=True)
        self.ln(2)


def generate_statement(
    investor,
    investment,
    transactions,
    performances,
    period_start=None,
    period_end=None,
    *,
    lang: str = "fr",
    display_currency: str | None = None,
    db=None,
    company=None,
    signature_data_url: str | None = None,
    signed_by: str | None = None,
) -> bytes:
    from app.services.currency import convert_amount

    labels = _labels(lang)
    company_name = getattr(company, "company_name", None) or "Valmere & Co"
    display_ccy = (display_currency or getattr(investment, "currency", None) or "HTG").upper()
    inv_ccy = (getattr(investment, "currency", None) or display_ccy).upper()
    today = date.today().strftime("%d/%m/%Y")
    period_text = (
        f"{labels['period']} : {period_start or '-'} -> {period_end or '-'}"
        if period_start or period_end
        else labels["all_transactions"]
    )

    def convert(value, from_currency):
        value = float(value or 0)
        if db is None:
            return value
        return convert_amount(db, value, (from_currency or inv_ccy).upper(), display_ccy)

    def tx_amount(tx):
        native, currency = transaction_business_amount_and_currency(tx)
        return convert(native, currency)

    def money(value, *, sign=False):
        prefix = "+" if sign and float(value or 0) >= 0 else ""
        return f"{prefix}{float(value or 0):,.2f} {display_ccy}"

    pdf = StatementPDF()
    pdf.footer_left = f"{labels['generated']} {today} - {labels['confidential']} - {company_name}"
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_fill_color(*PAPER)
    pdf.rect(0, 0, 210, 297, "F")

    pdf.set_fill_color(*PRIMARY)
    pdf.rect(20, 10, 170, 52, "F")
    logo_path = _logo_tempfile(getattr(company, "logo_url", None))
    try:
        if logo_path:
            pdf.image(logo_path, x=95, y=14, w=20)
        else:
            pdf.set_fill_color(*WHITE)
            pdf.rect(95, 14, 20, 16, "F")
            pdf.set_xy(95, 16)
            pdf.set_font("Times", "B", 16)
            pdf.set_text_color(*GOLD)
            pdf.cell(20, 10, "V", align="C")
    finally:
        if logo_path:
            try:
                os.unlink(logo_path)
            except OSError:
                pass
    pdf.set_xy(20, 34)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*WHITE)
    pdf.cell(170, 8, company_name, align="C", ln=True)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*GOLD_LIGHT)
    pdf.set_x(20)
    pdf.cell(170, 6, _s(labels["statement"]).upper(), align="C", ln=True)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(225, 230, 240)
    pdf.set_x(20)
    pdf.cell(170, 5, period_text, align="C", ln=True)
    pdf.set_y(70)

    pdf.set_fill_color(*WHITE)
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(0.5)
    pdf.rect(20, pdf.get_y(), 170, 23, "FD")
    pdf.set_x(24)
    pdf.set_y(pdf.get_y() + 3)
    pdf.set_x(24)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(*GRAY)
    pdf.cell(80, 4, _s(labels["investor"]).upper(), ln=True)
    pdf.set_x(24)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*PRIMARY)
    pdf.cell(0, 6, investor.full_name, ln=True)
    pdf.set_x(24)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*GRAY)
    meta = f"Code : {investor.code}   |   {labels['entry']} : {investor.entry_date}   |   {labels['status']} : {str(investor.status).upper()}"
    if investor.email:
        meta += f"   |   {investor.email}"
    pdf.cell(0, 5, meta, ln=True)
    pdf.ln(6)

    txs = transactions or []
    initial = convert(float(investment.initial_capital or 0), inv_ccy)
    has_initial_tx = any(is_initial_capital_tx(t) for t in txs)
    invested_seed = 0.0 if has_initial_tx else initial
    invested_from_tx = sum(
        tx_amount(t) * (
            1 if (t.type or "").lower() in ("deposit", "bailout", "company_bailout", "initial", "initial_capital")
            else (-1 if (t.type or "").lower() in ("withdrawal", "company_withdrawal") else 0)
        )
        for t in txs
    )
    invested = invested_seed + invested_from_tx
    latest_bailouts = latest_bailout_key_by_investment(txs)
    pnl = sum(
        tx_amount(t) * (
            1 if (t.type or "").lower() == "gain"
            else (-1 if (t.type or "").lower() in ("loss", "fee") else 0)
        )
        for t in txs
        if is_effective_pnl_tx(t, latest_bailouts)
    )
    current = invested_seed
    for tx in sorted(txs, key=tx_sort_key):
        amount = tx_amount(tx)
        if (tx.type or "").lower() == "bailout":
            current = amount
        else:
            current += TX_SIGNS.get((tx.type or "").lower(), 0) * amount
    roi = compute_roi_from_pnl(pnl, current)

    boxes = [
        (f"{labels['invested']} ({display_ccy})", money(invested)),
        (f"{labels['current']} ({display_ccy})", money(current)),
        (labels["roi"], f"{roi:+.2f}%" if roi is not None else "N/A"),
        (f"{labels['pnl']} ({display_ccy})", money(pnl, sign=True)),
    ]
    box_w = 40
    y = pdf.get_y()
    for i, (label, value) in enumerate(boxes):
        x = 20 + i * (box_w + 3.3)
        pdf.set_xy(x, y)
        pdf.set_fill_color(*(CREAM if i == 1 else WHITE))
        pdf.set_draw_color(*(GOLD if i == 1 else IVORY))
        pdf.set_line_width(0.3)
        pdf.rect(x, y, box_w, 18, "FD")
        if i == 1:
            pdf.set_fill_color(*GOLD)
            pdf.rect(x, y, 1.2, 18, "F")
        pdf.set_xy(x + 2, y + 2)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(*GRAY)
        pdf.cell(box_w - 4, 4, label, ln=True)
        pdf.set_xy(x + 2, y + 7)
        pdf.set_font("Times", "B", 11)
        if i == 2:
            color = (185, 28, 28) if roi is None or roi < 0 else (22, 163, 74)
        elif i == 3:
            color = (22, 163, 74) if pnl >= 0 else (185, 28, 28)
        else:
            color = PRIMARY
        pdf.set_text_color(*color)
        pdf.cell(box_w - 4, 6, value)
    pdf.ln(25)

    history_rows = [{
        "date": getattr(investment, "start_date", None) or investor.entry_date or date.today(),
        "type": "initial",
        "amount": initial,
        "description": labels["initial_deposit"],
        "reference": "-",
    }]
    for tx in txs:
        history_rows.append({
            "date": tx.transaction_date,
            "type": (tx.type or "").lower(),
            "amount": tx_amount(tx),
            "description": tx.description or "-",
            "reference": tx.reference or "-",
        })

    pdf._section_title(labels["history"])
    col_w = [27, 28, 34, 55, 26]
    headers = [labels["date"], labels["type"], f"{labels['amount']} ({display_ccy})", labels["description"], labels["reference"]]
    pdf.set_fill_color(*CREAM)
    pdf.set_text_color(*GRAY)
    pdf.set_font("Helvetica", "B", 8)
    for header, width in zip(headers, col_w):
        pdf.cell(width, 7, _s(header).upper(), fill=True, border=0)
    pdf.ln()

    for idx, row_data in enumerate(history_rows):
        pdf.set_fill_color(*(LIGHT_BG if idx % 2 == 0 else WHITE))
        tx_type = row_data["type"]
        type_color = TYPE_COLORS.get(tx_type, DARK)
        row = [
            str(row_data["date"]),
            labels["initial"] if tx_type == "initial" else tx_type.upper(),
            money(row_data["amount"]),
            str(row_data["description"])[:36],
            str(row_data["reference"])[:16],
        ]
        for i, (value, width) in enumerate(zip(row, col_w)):
            if i == 1:
                pdf.set_text_color(*type_color)
                pdf.set_font("Helvetica", "B", 7)
            else:
                pdf.set_text_color(*DARK)
                pdf.set_font("Helvetica", "", 8)
            pdf.cell(width, 6, value, fill=True)
        pdf.ln()
    pdf.ln(4)

    if performances:
        pdf._section_title(labels["performances"])
        p_col_w = [30, 28, 28, 28, 36, 36]
        p_headers = ["Periode", "Debut", "Fin", "ROI (%)", "Gain brut", "Drawdown max"]
        pdf.set_fill_color(*CREAM)
        pdf.set_text_color(*GRAY)
        pdf.set_font("Helvetica", "B", 8)
        for header, width in zip(p_headers, p_col_w):
            pdf.cell(width, 7, _s(header).upper(), fill=True)
        pdf.ln()

        for idx, perf in enumerate(performances):
            pdf.set_fill_color(*LIGHT_BG if idx % 2 == 0 else WHITE)
            roi_val = float(perf.roi_pct) if perf.roi_pct is not None else None
            gross = float(perf.gross_gain) if perf.gross_gain else 0.0
            dd = float(perf.max_drawdown_pct) if perf.max_drawdown_pct else 0.0
            row = [
                perf.period_type,
                str(perf.period_start) if perf.period_start else "-",
                str(perf.period_end) if perf.period_end else "-",
                f"{roi_val:+.2f}%" if roi_val is not None else "N/A",
                f"{gross:+,.2f}",
                f"{dd:.2f}%",
            ]
            for i, (value, width) in enumerate(zip(row, p_col_w)):
                if i == 3:
                    pdf.set_text_color(*(185, 28, 28) if roi_val is None or roi_val < 0 else (22, 163, 74))
                    pdf.set_font("Helvetica", "B", 8)
                elif i == 4:
                    pdf.set_text_color(*(22, 163, 74) if gross >= 0 else (185, 28, 28))
                    pdf.set_font("Helvetica", "B", 8)
                else:
                    pdf.set_text_color(*DARK)
                    pdf.set_font("Helvetica", "", 8)
                pdf.cell(width, 6, value, fill=True)
            pdf.ln()

    if pdf.get_y() > 235:
        pdf.add_page()
        pdf.set_fill_color(*PAPER)
        pdf.rect(0, 0, 210, 297, "F")

    line_y = max(pdf.get_y() + 26, 266)
    if line_y > 276:
        pdf.add_page()
        pdf.set_fill_color(*PAPER)
        pdf.rect(0, 0, 210, 297, "F")
        line_y = 266
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(0.4)
    pdf.line(118, line_y, 190, line_y)

    signature_path = _signature_tempfile(signature_data_url)
    try:
        if signature_path:
            max_w = 58
            max_h = 20
            with Image.open(signature_path) as sig_img:
                sig_w, sig_h = sig_img.size
            if sig_w > 0 and sig_h > 0:
                scale = min(max_w / sig_w, max_h / sig_h)
                draw_w = sig_w * scale
                draw_h = sig_h * scale
                draw_x = 118 + (72 - draw_w) / 2
                draw_y = line_y - draw_h - 1.5
                pdf.image(signature_path, x=draw_x, y=draw_y, w=draw_w, h=draw_h)
    finally:
        if signature_path:
            try:
                os.unlink(signature_path)
            except OSError:
                pass

    pdf.set_xy(118, line_y + 4)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*PRIMARY)
    pdf.cell(72, 5, labels["signature"], ln=True, align="C")

    if signed_by:
        pdf.set_x(118)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*GRAY)
        pdf.cell(72, 5, f"{labels['signed_by']} : {signed_by}", ln=True, align="C")

    buffer = io.BytesIO()
    pdf.output(buffer)
    return buffer.getvalue()
