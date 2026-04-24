import io
from datetime import date
from fpdf import FPDF


# Map Unicode punctuation → Latin-1 fallbacks so built-in Helvetica can render them.
_REPLACEMENTS = str.maketrans({
    "\u2014": "-",   # em dash
    "\u2013": "-",   # en dash
    "\u2212": "-",   # minus sign
    "\u2192": "->",  # right arrow
    "\u2190": "<-",  # left arrow
    "\u2026": "...", # ellipsis
    "\u2018": "'", "\u2019": "'",  # curly single quotes
    "\u201C": '"', "\u201D": '"',  # curly double quotes
    "\u00A0": " ",   # nbsp
    "\u202F": " ",   # narrow nbsp
    "\u2022": "*",   # bullet
})


def _s(value) -> str:
    """Stringify + sanitize for PDF output (latin-1 safe)."""
    if value is None:
        return "-"
    text = str(value).translate(_REPLACEMENTS)
    return text.encode("latin-1", "replace").decode("latin-1")

PRIMARY = (26, 58, 92)      # #1A3A5C
GOLD = (201, 168, 76)       # #C9A84C
LIGHT_BG = (240, 244, 248)  # #F0F4F8
WHITE = (255, 255, 255)
DARK = (51, 51, 51)
GRAY = (120, 130, 150)

TYPE_COLORS = {
    "deposit": (22, 163, 74),
    "withdrawal": (220, 38, 38),
    "gain": (5, 150, 105),
    "loss": (185, 28, 28),
    "fee": (100, 116, 139),
}


class StatementPDF(FPDF):
    def header(self):
        pass

    # Sanitize every text call globally so no un-wrapped Unicode can crash the PDF.
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
        self.cell(0, 10, "Document confidentiel - Valmere & Co", align="L")
        self.cell(0, 10, f"Page {self.page_no()}", align="R")

    def _section_title(self, text: str):
        self.set_fill_color(*PRIMARY)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 10)
        self.cell(0, 8, _s(f"  {text}"), fill=True, ln=True)
        self.ln(2)

    def _kv_row(self, label: str, value: str, shaded=False):
        if shaded:
            self.set_fill_color(*LIGHT_BG)
        else:
            self.set_fill_color(*WHITE)
        self.set_text_color(*GRAY)
        self.set_font("Helvetica", "", 9)
        self.cell(60, 6, _s(label), fill=True)
        self.set_text_color(*DARK)
        self.set_font("Helvetica", "B", 9)
        self.cell(0, 6, _s(value), fill=True, ln=True)


def generate_statement(investor, investment, transactions, performances, period_start=None, period_end=None) -> bytes:
    pdf = StatementPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # ── Header ──────────────────────────────────────────────────────────────
    pdf.set_fill_color(*PRIMARY)
    pdf.rect(10, 10, 190, 20, "F")
    pdf.set_xy(12, 13)
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*WHITE)
    pdf.cell(120, 7, _s("Valmere & Co"), ln=False)
    pdf.set_font("Helvetica", "", 8)
    today = date.today().strftime("%d/%m/%Y")
    pdf.set_xy(160, 13)
    pdf.cell(40, 4, _s(f"Genere le {today}"), align="R", ln=False)
    if period_start:
        pdf.set_xy(160, 18)
        pdf.cell(40, 4, _s(f"Periode : {period_start} -> {period_end}"), align="R")
    pdf.ln(25)

    # ── Investor info ────────────────────────────────────────────────────────
    pdf.set_fill_color(*LIGHT_BG)
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(0.5)
    pdf.rect(10, pdf.get_y(), 190, 16, "FD")
    pdf.set_x(14)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*PRIMARY)
    pdf.cell(0, 6, _s(investor.full_name), ln=True)
    pdf.set_x(14)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*GRAY)
    meta = f"Code : {investor.code}   |   Entree : {investor.entry_date}   |   Statut : {investor.status.upper()}"
    if investor.email:
        meta += f"   |   {investor.email}"
    pdf.cell(0, 5, _s(meta), ln=True)
    pdf.ln(6)

    # ── Summary boxes ────────────────────────────────────────────────────────
    initial = float(investment.initial_capital)
    current = float(investment.current_value)
    pnl = current - initial
    roi = (pnl / initial * 100) if initial else 0.0

    boxes = [
        ("Capital initial (HTG)", f"{initial:,.2f}"),
        ("Valeur actuelle (HTG)", f"{current:,.2f}"),
        ("ROI", f"{roi:+.2f}%"),
        ("Gain / Perte (HTG)", f"{pnl:+,.2f}"),
    ]
    box_w = 44
    start_x = 12
    y = pdf.get_y()
    for i, (label, value) in enumerate(boxes):
        x = start_x + i * (box_w + 3)
        pdf.set_xy(x, y)
        pdf.set_fill_color(*WHITE)
        pdf.set_draw_color(220, 228, 240)
        pdf.set_line_width(0.3)
        pdf.rect(x, y, box_w, 16, "FD")
        pdf.set_xy(x + 2, y + 2)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(*GRAY)
        pdf.cell(box_w - 4, 4, _s(label), ln=True)
        pdf.set_xy(x + 2, y + 7)
        pdf.set_font("Helvetica", "B", 10)
        color = (22, 163, 74) if (i >= 2 and (roi if i == 2 else pnl) >= 0) else (185, 28, 28) if i >= 2 else PRIMARY
        pdf.set_text_color(*color)
        pdf.cell(box_w - 4, 6, _s(value))
    pdf.ln(22)

    # ── Transactions ─────────────────────────────────────────────────────────
    if transactions:
        pdf._section_title("Historique des transactions")
        col_w = [28, 22, 32, 65, 30]
        headers = ["Date", "Type", "Montant (HTG)", "Description", "Reference"]
        pdf.set_fill_color(*GOLD)
        pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 8)
        for i, (h, w) in enumerate(zip(headers, col_w)):
            pdf.cell(w, 7, _s(h), fill=True, border=0)
        pdf.ln()

        for idx, tx in enumerate(transactions):
            pdf.set_fill_color(*LIGHT_BG if idx % 2 == 0 else WHITE)
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*DARK)
            type_color = TYPE_COLORS.get(tx.type, DARK)
            row_data = [
                str(tx.transaction_date),
                tx.type.upper(),
                f"{float(tx.amount):,.2f}",
                (tx.description or "-")[:38],
                (tx.reference or "-")[:18],
            ]
            for i, (val, w) in enumerate(zip(row_data, col_w)):
                if i == 1:
                    pdf.set_text_color(*type_color)
                    pdf.set_font("Helvetica", "B", 7)
                else:
                    pdf.set_text_color(*DARK)
                    pdf.set_font("Helvetica", "", 8)
                pdf.cell(w, 6, _s(val), fill=True)
            pdf.ln()
        pdf.ln(4)

    # ── Performances ─────────────────────────────────────────────────────────
    if performances:
        pdf._section_title("Performances par periode")
        p_col_w = [30, 28, 28, 28, 36, 36]
        p_headers = ["Periode", "Debut", "Fin", "ROI (%)", "Gain brut", "Drawdown max"]
        pdf.set_fill_color(*GOLD)
        pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 8)
        for h, w in zip(p_headers, p_col_w):
            pdf.cell(w, 7, _s(h), fill=True)
        pdf.ln()

        for idx, p in enumerate(performances):
            pdf.set_fill_color(*LIGHT_BG if idx % 2 == 0 else WHITE)
            roi_val = float(p.roi_pct) if p.roi_pct else 0.0
            gross = float(p.gross_gain) if p.gross_gain else 0.0
            dd = float(p.max_drawdown_pct) if p.max_drawdown_pct else 0.0
            row = [
                p.period_type,
                str(p.period_start) if p.period_start else "-",
                str(p.period_end) if p.period_end else "-",
                f"{roi_val:+.2f}%",
                f"{gross:+,.2f}",
                f"{dd:.2f}%",
            ]
            for i, (val, w) in enumerate(zip(row, p_col_w)):
                if i == 3:
                    pdf.set_text_color(*(22, 163, 74) if roi_val >= 0 else (185, 28, 28))
                    pdf.set_font("Helvetica", "B", 8)
                elif i == 4:
                    pdf.set_text_color(*(22, 163, 74) if gross >= 0 else (185, 28, 28))
                    pdf.set_font("Helvetica", "B", 8)
                else:
                    pdf.set_text_color(*DARK)
                    pdf.set_font("Helvetica", "", 8)
                pdf.cell(w, 6, _s(val), fill=True)
            pdf.ln()

    buffer = io.BytesIO()
    pdf.output(buffer)
    return buffer.getvalue()
