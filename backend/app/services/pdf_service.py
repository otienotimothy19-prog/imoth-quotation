"""Server-side PDF generation for quotations and risk notes. The quotation
follows Imoth's standard quote sheet (logo header, vehicle/class/insurer
block, cover basis and rates applied, premium table, limits/benefits in two
columns, conditions and payment details), without the client's name.
"""
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

IMOTH_BLUE = colors.HexColor("#1b3f8b")
IMOTH_RED = colors.HexColor("#e2231a")
INK = colors.HexColor("#1c1c1c")
MUTED = colors.HexColor("#5a5f6a")
PANEL = colors.HexColor("#f4f6fb")

# Display labels for commercial_use values -- generic title-casing would
# wrongly render "commercial_tuktuk" as "Commercial Tuktuk".
_COMMERCIAL_USE_LABELS = {
    "own_goods": "Own Goods",
    "general_cartage": "General Cartage",
    "commercial_institutional": "Commercial Institutional",
    "commercial_tuktuk": "Commercial Tuk Tuk",
    "hybrid": "Hybrid",
    "private_hire": "Private Hire",
    "online_hailed": "Online-Hailed",
    "tanker": "Tanker",
}


def _commercial_use_label(value: str | None) -> str:
    if not value:
        return ""
    return _COMMERCIAL_USE_LABELS.get(value, value.replace("_", " ").title())

LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "imoth_logo.jpg"

_styles = getSampleStyleSheet()
STYLE_TITLE = ParagraphStyle("ImothTitle", parent=_styles["Normal"], fontSize=15, textColor=IMOTH_BLUE, fontName="Helvetica-Bold")
STYLE_SUB = ParagraphStyle("ImothSub", parent=_styles["Normal"], fontSize=8.5, textColor=MUTED)
STYLE_RIGHT_INSURER = ParagraphStyle("ImothInsurer", parent=_styles["Normal"], fontSize=12, textColor=IMOTH_RED, fontName="Helvetica-Bold", alignment=2)
STYLE_RIGHT = ParagraphStyle("ImothRight", parent=_styles["Normal"], fontSize=9.5, textColor=INK, alignment=2)
STYLE_RIGHT_MUTED = ParagraphStyle("ImothRightMuted", parent=_styles["Normal"], fontSize=8.5, textColor=MUTED, alignment=2)
STYLE_H3 = ParagraphStyle("ImothH3", parent=_styles["Normal"], fontSize=9.5, textColor=IMOTH_BLUE, fontName="Helvetica-Bold", spaceAfter=4)
STYLE_LI = ParagraphStyle("ImothLi", parent=_styles["Normal"], fontSize=8.3, textColor=colors.HexColor("#333333"), leading=12)
STYLE_FOOT = ParagraphStyle("ImothFoot", parent=_styles["Normal"], fontSize=7.6, textColor=MUTED, leading=11)
STYLE_WARN = ParagraphStyle("ImothWarn", parent=_styles["Normal"], fontSize=8.5, textColor=colors.HexColor("#7a5200"))

STYLE_CELL = ParagraphStyle("ImothCell", parent=_styles["Normal"], fontSize=9, textColor=INK, leading=12)
STYLE_CELL_R = ParagraphStyle("ImothCellR", parent=STYLE_CELL, alignment=2)
STYLE_CELL_BLUE = ParagraphStyle("ImothCellBlue", parent=STYLE_CELL, textColor=IMOTH_BLUE, fontName="Helvetica-Bold")
STYLE_CELL_BOLD = ParagraphStyle("ImothCellBold", parent=STYLE_CELL, fontName="Helvetica-Bold", fontSize=9.5)
STYLE_CELL_BOLD_R = ParagraphStyle("ImothCellBoldR", parent=STYLE_CELL_BOLD, alignment=2)
STYLE_CELL_BALANCE_DUE = ParagraphStyle("ImothBalanceDue", parent=STYLE_CELL_BOLD_R, textColor=IMOTH_RED)
STYLE_TH = ParagraphStyle("ImothTh", parent=STYLE_CELL, textColor=colors.white, fontName="Helvetica-Bold", fontSize=8.5)
STYLE_TH_R = ParagraphStyle("ImothThR", parent=STYLE_TH, alignment=2)
STYLE_FOOT_R = ParagraphStyle("ImothFootR", parent=STYLE_FOOT, alignment=2)
STYLE_SHEET_TITLE = ParagraphStyle("ImothSheetTitle", parent=STYLE_TITLE, fontSize=14, leading=17)
STYLE_SHEET_INSURER = ParagraphStyle("ImothSheetInsurer", parent=STYLE_RIGHT_INSURER, fontSize=10.5, leading=13)


def quotation_pdf_filename(quotation) -> str:
    """Imoth_Quote_CIC_General_Insurance_Ltd_KDW534A_25_November_2026.pdf"""
    import re

    when = getattr(quotation, "generated_at", None) or getattr(quotation, "created_at", None)
    insurer = getattr(getattr(quotation, "insurer", None), "name", "")
    vehicle = getattr(quotation, "vehicle", None)
    parts = [insurer, getattr(vehicle, "registration_no", "") or "", when.strftime("%d_%B_%Y") if when else ""]
    cleaned = [re.sub(r"[^A-Za-z0-9]+", "_", x).strip("_") for x in parts]
    return "Imoth_Quote_" + "_".join(x for x in cleaned if x) + ".pdf"


def _split_address(address: str) -> tuple[str, str]:
    """"P.O. Box 23280 – 00100, Nairobi, Wabera Street, Salama House, Suite 305"
    -> ("P.O. Box 23280 – 00100, Nairobi", "Wabera Street, Salama House, Suite 305, Nairobi"):
    postal address in the header, office location next to the payment line."""
    parts = [x.strip() for x in (address or "").split(",") if x.strip()]
    for i, part in enumerate(parts):
        if "nairobi" in part.lower():
            rest = parts[i + 1:]
            return ", ".join(parts[: i + 1]), (", ".join(rest + [part]) if rest else "")
    return address or "", ""


def _money(n: float) -> str:
    return f"Kshs {n:,.0f}"


def _header_table(company: dict, right_lines: list[tuple[str, ParagraphStyle]]):
    logo = Image(str(LOGO_PATH), width=28 * mm, height=21.4 * mm) if LOGO_PATH.exists() else Spacer(1, 1)
    mid = [
        Paragraph(company.get("name", "Imoth Insurance Brokers Limited"), STYLE_TITLE),
        Paragraph(
            f"{company.get('address', '')} &nbsp;|&nbsp; Tel: {company.get('phone', '')} &nbsp;|&nbsp; {company.get('email', '')}",
            STYLE_SUB,
        ),
    ]
    right = [Paragraph(text, style) for text, style in right_lines]
    tbl = Table([[logo, mid, right]], colWidths=[32 * mm, 90 * mm, 68 * mm])
    tbl.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LINEBELOW", (0, 0), (-1, 0), 2, IMOTH_BLUE),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
                ("TOPPADDING", (0, 0), (-1, 0), 0),
            ]
        )
    )
    return tbl


def _premium_table(rows: list[list], total_row_indices: set[int], section_row_indices: set[int]):
    tbl = Table(rows, colWidths=[95 * mm, 55 * mm, 40 * mm], repeatRows=1)
    style = [
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, PANEL),
        ("BACKGROUND", (0, 0), (-1, 0), IMOTH_BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (2, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in total_row_indices:
        style += [
            ("LINEABOVE", (0, i), (-1, i), 1.2, IMOTH_BLUE),
            ("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"),
            ("BACKGROUND", (0, i), (-1, i), colors.HexColor("#fbfcfe")),
        ]
    for i in section_row_indices:
        style += [
            ("BACKGROUND", (0, i), (-1, i), PANEL),
            ("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, i), (-1, i), IMOTH_BLUE),
        ]
    tbl.setStyle(TableStyle(style))
    return tbl


def _bullet_list(items: list[str]):
    if not items:
        items = ["Per insurer's standard policy wording"]
    return ListFlowable(
        [ListItem(Paragraph(x, STYLE_LI), leftIndent=8) for x in items],
        bulletType="bullet",
        start="circle",
        leftIndent=10,
    )


def _num(n: float) -> str:
    return f"{n:,.0f}"


def _cover_basis_line(name: str, included: bool, not_offered: bool) -> str:
    if not_offered:
        return f"<b>{name}:</b> Not offered for this class"
    if included:
        return f"<b>{name}:</b> Included in the rate &#10003;"
    return f"<b>{name}:</b> Not included"


def _cover_lines(snapshot: dict, sum_insured: float) -> tuple[str | None, str | None]:
    """The "Excess Protector / PVT" and "Rate(s) Applied" lines of the
    quote sheet, rebuilt from the pricing snapshot saved with the quotation."""
    calc = snapshot.get("calculation") or {}
    band = calc.get("band_used")
    opts = snapshot.get("options_used") or {}
    if band:
        basis = (
            _cover_basis_line("Excess Protector (Own Damage)", band.get("ep_included"), band.get("ep_not_offered"))
            + " &nbsp;|&nbsp; "
            + _cover_basis_line("PVT", band.get("pvt_included"), band.get("pvt_not_offered"))
        )
        if band.get("age_rule_applied"):
            basis += " &nbsp;<i>(vehicle over age limit &mdash; EP/PVT not offered)</i>"
        parts = [f"Basic Rate: <b>{band['rate'] * 100:.2f}%</b> of SI (Min Kshs {_num(band['min_premium'])})"]
        if band.get("ep_included"):
            parts.append("Excess Protector: included in basic rate")
        elif not band.get("ep_not_offered") and (opts.get("ep") or band.get("ep_mandatory")) and band.get("ep_rate"):
            parts.append(f"Excess Protector: <b>{band['ep_rate'] * 100:.2f}%</b> (Min Kshs {_num(band.get('ep_min') or 0)})")
        if band.get("pvt_included"):
            parts.append("PVT: included in basic rate")
        elif not band.get("pvt_not_offered") and opts.get("pvt") and band.get("pvt_rate"):
            parts.append(f"PVT: <b>{band['pvt_rate'] * 100:.2f}%</b> (Min Kshs {_num(band.get('pvt_min') or 0)})")
        if calc.get("pll_rate") and not calc.get("pll_included"):
            parts.append(f"PLL: <b>Kshs {_num(calc['pll_rate'])}</b>/person")
        if opts.get("pv_terror"):
            parts.append("Political Violence &amp; Terrorism: <b>0.25%</b>")
        return basis, "<b>Rate(s) Applied:</b> " + " &nbsp;|&nbsp; ".join(parts)

    flat = snapshot.get("flat_only")
    if flat:
        basis = "<b>Cover Basis:</b> Third Party Only &mdash; Excess Protector / PVT / Own Damage not applicable"
        if flat.get("rate_on_si") is not None:
            rate = f"<b>{flat['rate_on_si'] * 100:.2f}%</b> of SI (Min Kshs {_num(flat.get('min_premium') or 0)})"
        else:
            rate = f"Flat annual premium of <b>Kshs {_num(flat.get('premium') or 0)}</b>"
        return basis, "<b>Rate(s) Applied:</b> " + rate
    return None, None


def _sheet_bullets(items: list[str]):
    return ListFlowable(
        [ListItem(Paragraph(x, STYLE_LI), leftIndent=10, value="•") for x in (items or ["Per insurer's standard policy wording"])],
        bulletType="bullet",
        start="•",
        bulletFontSize=8,
        bulletColor=MUTED,
        leftIndent=10,
    )


def _condition_lines(footer_text: str, conditions: list[str], validity_days: int | None) -> list[str]:
    """Bold first line, then each condition once: the footer text and the
    conditions list (both admin-editable) overlap, and a generic "valid for
    the validity period" line is replaced by the actual number of days."""
    sentences = [x.strip().rstrip(".") + "." for x in (footer_text or "").split(". ") if x.strip()]
    lines = [f"<b>** {sentences[0]}</b>"] if sentences else []
    seen = {x.lower() for x in sentences[:1]}
    rest = sentences[1:]
    if validity_days:
        rest.insert(0, f"Valid for {validity_days} days from the date of this quotation.")
    for c in rest + list(conditions or []):
        text = c.strip()
        key = text.lower().rstrip(".") + "."
        if not text or key in seen or (validity_days and text.lower().startswith("valid for the validity period")):
            continue
        seen.add(key)
        lines.append(f"** {text}")
    return lines


def _card_border(canvas, doc):
    """The rounded card outline around the whole quote sheet."""
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d9dde6"))
    canvas.setLineWidth(0.8)
    x = doc.leftMargin - 7 * mm
    y = doc.bottomMargin - 7 * mm
    w = doc.width + 14 * mm
    h = doc.height + 14 * mm
    canvas.roundRect(x, y, w, h, 4 * mm, stroke=1, fill=0)
    canvas.restoreState()


def render_quotation_pdf(*, quotation, company: dict, footer_text: str, conditions: list[str]) -> bytes:
    """The quote sheet, laid out like Imoth's standard quotation: header,
    vehicle/class/insurer block, cover basis and rates, premium table,
    limits and benefits, then conditions and payment details. The client's
    name is deliberately not printed.

    `quotation` is the SQLAlchemy Quotation ORM instance (with .items,
    .vehicle, .insurer, .snapshot eager-loaded)."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=18 * mm, rightMargin=18 * mm,
        title=f"Imoth Quote {quotation.quotation_number}", author=company.get("name", "Imoth Insurance Brokers Limited"),
    )
    width = doc.width
    snapshot = quotation.snapshot.data if quotation.snapshot else {}
    reg = quotation.vehicle.registration_no or "TO BE ADVISED"
    class_label = quotation.vehicle_class_label
    postal, physical = _split_address(company.get("address", ""))
    story = []

    # Header: logo | company | insurer, registration, date
    date_str = (quotation.generated_at or quotation.created_at).strftime("%d %B %Y")
    logo = Image(str(LOGO_PATH), width=24 * mm, height=18.3 * mm) if LOGO_PATH.exists() else Spacer(1, 1)
    company_cell = [
        Paragraph(company.get("name", "Imoth Insurance Brokers Limited"), STYLE_SHEET_TITLE),
        Spacer(1, 3),
        Paragraph(
            f"{postal} &nbsp;|&nbsp; Tel: {company.get('phone', '')} &nbsp;|&nbsp; {company.get('email', '')}",
            STYLE_SUB,
        ),
    ]
    right_cell = [
        Paragraph(quotation.insurer.name.upper(), STYLE_SHEET_INSURER),
        Spacer(1, 3),
        Paragraph(f"<b>{reg}</b>", STYLE_RIGHT),
        Paragraph(f"Quote Date: {date_str}", STYLE_RIGHT_MUTED),
        Paragraph(f"Quote No: {quotation.quotation_number}", STYLE_RIGHT_MUTED),
    ]
    header = Table([[logo, company_cell, right_cell]], colWidths=[25 * mm, width - 25 * mm - 65 * mm, 65 * mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 2, IMOTH_BLUE),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING", (1, 0), (1, 0), 4),
        ("RIGHTPADDING", (1, 0), (1, 0), 2),
        ("RIGHTPADDING", (-1, 0), (-1, 0), 0),
    ]))
    story.append(header)
    story.append(Spacer(1, 8))

    if quotation.insurer.disclaimer:
        story.append(Paragraph(f"<b>Note:</b> {quotation.insurer.disclaimer}", STYLE_WARN))
        story.append(Spacer(1, 6))

    # Vehicle / class / insurer block
    vehicle_desc = " ".join(x for x in [reg, quotation.vehicle.make, quotation.vehicle.model] if x)
    label_lower = (class_label or "").lower()
    is_third_party = (
        (quotation.cover_type or "").lower() in ("tpo", "third_party")
        or bool(snapshot.get("flat_only"))
        or "tpo" in label_lower
        or "third party" in label_lower
    )
    cover_text = "Third Party Only" if is_third_party else "Comprehensive on Vehicle"
    third = width / 3
    info_rows = [
        [Paragraph(f"<b>Vehicle</b>: {vehicle_desc}", STYLE_CELL), Paragraph(f"<b>Class</b>: {class_label}", STYLE_CELL),
         Paragraph(f"<b>Insurer</b>: {quotation.insurer.name}", STYLE_CELL)],
        [Paragraph("CLASS", STYLE_CELL_BLUE), Paragraph(class_label, STYLE_CELL_BLUE), ""],
        [Paragraph("Interests Insured", STYLE_CELL), Paragraph(reg, STYLE_CELL), Paragraph(cover_text, STYLE_CELL)],
    ]
    info_style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.6, colors.HexColor("#e8ebf2")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, 1), (-1, 1), PANEL),
        ("SPAN", (1, 1), (2, 1)),
    ]
    basis, rates = _cover_lines(snapshot, float(quotation.sum_insured))
    options_used = snapshot.get("options_used") or {}
    if options_used.get("commercial_use"):
        bits = [f"<b>Commercial Use:</b> {_commercial_use_label(options_used['commercial_use'])}"]
        if options_used.get("tonnage"):
            bits.append(f"<b>Tonnage:</b> {options_used['tonnage']:,g} tons")
        if options_used.get("institution_type"):
            bits.append(f"<b>Institution Type:</b> {options_used['institution_type'].title()}")
            bits.append(f"<b>Vehicle Type:</b> {(options_used.get('institutional_vehicle_type') or '').title()}")
            bits.append(f"<b>Passenger Category:</b> {(options_used.get('passenger_category') or '').replace('_', ' ').title()}")
        if options_used.get("pll_seats"):
            bits.append(f"<b>Passenger Seats (excl. driver):</b> {options_used['pll_seats']}")
        info_rows.append([Paragraph(" &nbsp;|&nbsp; ".join(bits), STYLE_CELL), "", ""])
        info_style.append(("SPAN", (0, len(info_rows) - 1), (2, len(info_rows) - 1)))
    for line in (basis, rates):
        if line:
            info_rows.append([Paragraph(line, STYLE_CELL), "", ""])
            info_style.append(("SPAN", (0, len(info_rows) - 1), (2, len(info_rows) - 1)))
    info = Table(info_rows, colWidths=[third, third, third])
    info.setStyle(TableStyle(info_style))
    story.append(info)

    # Premium table
    rows = [[Paragraph("ITEM", STYLE_TH), Paragraph("SUM INSURED (KSHS)", STYLE_TH_R),
             Paragraph("PREMIUM (KSHS)", STYLE_TH_R), Paragraph("NOTES", STYLE_TH)]]
    for i, item in enumerate(quotation.items):
        rows.append([
            Paragraph(class_label if i == 0 else item.label, STYLE_CELL),
            Paragraph(_num(float(quotation.sum_insured)) if i == 0 else "", STYLE_CELL_R),
            Paragraph(_num(float(item.amount)), STYLE_CELL_R),
            "",
        ])
    rows.append([Paragraph("Sub-total", STYLE_CELL), "", Paragraph(_num(float(quotation.subtotal)), STYLE_CELL_R), ""])
    rows.append([Paragraph("Levies (PHCF 0.25% + Training Levy 0.20%)", STYLE_CELL), "",
                 Paragraph(_num(float(quotation.levies)), STYLE_CELL_R), ""])
    rows.append([Paragraph("Stamp Duty", STYLE_CELL), "", Paragraph(_num(float(quotation.stamp_duty)), STYLE_CELL_R), ""])
    total_idx = len(rows)
    rows.append([Paragraph("TOTAL PREMIUM", STYLE_CELL_BOLD), "",
                 Paragraph(_num(float(quotation.total_premium)), STYLE_CELL_BOLD_R), ""])
    rows.append([Paragraph("Amount Paid", STYLE_CELL), "", Paragraph(_num(float(quotation.amount_paid)), STYLE_CELL_R), ""])
    balance_idx = len(rows)
    balance = float(quotation.balance)
    balance_label = "BALANCE DUE" if balance > 0 else ("OVERPAYMENT" if balance < 0 else "BALANCE &mdash; PAID IN FULL")
    balance_style = STYLE_CELL_BALANCE_DUE if balance > 0 else STYLE_CELL_BOLD_R
    rows.append([Paragraph(balance_label, STYLE_CELL_BOLD), "", Paragraph(_num(abs(balance)), balance_style), ""])

    premium = Table(rows, colWidths=[width * 0.44, width * 0.22, width * 0.20, width * 0.14], repeatRows=1)
    premium.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, 0), IMOTH_BLUE),
        ("LINEBELOW", (0, 1), (-1, -1), 0.6, colors.HexColor("#e8ebf2")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEABOVE", (0, total_idx), (-1, total_idx), 1.2, IMOTH_BLUE),
        ("BACKGROUND", (0, total_idx), (-1, total_idx), colors.HexColor("#fbfcfe")),
        ("LINEABOVE", (0, balance_idx), (-1, balance_idx), 1.2, IMOTH_BLUE),
        ("BACKGROUND", (0, balance_idx), (-1, balance_idx), colors.HexColor("#fbfcfe")),
    ]))
    story.append(premium)
    story.append(Spacer(1, 14))

    # Limits | Excess & benefits
    def column(title, items):
        heading = Table([[Paragraph(title, STYLE_H3)]], colWidths=[width / 2 - 8 * mm])
        heading.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, -1), 0.6, colors.HexColor("#e8ebf2")),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        return [heading, Spacer(1, 4), _sheet_bullets(items)]

    benefit_items = list(snapshot.get("excess", [])) + list(snapshot.get("benefits", []))
    two_col = Table(
        [[column("LIMITS OF COVER", snapshot.get("limits", [])), column("EXCESS &amp; BENEFITS / REMARKS", benefit_items)]],
        colWidths=[width / 2, width / 2],
    )
    two_col.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
    ]))
    story.append(two_col)
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", color=colors.HexColor("#e8ebf2"), thickness=0.8))
    story.append(Spacer(1, 6))

    # Conditions and payment
    validity_days = quotation.expires_at and (quotation.expires_at - quotation.created_at).days
    story.append(Paragraph("<br/>".join(_condition_lines(footer_text, conditions, validity_days)), STYLE_FOOT))
    story.append(Spacer(1, 8))
    payment = Table(
        [[Paragraph(f"Payment: Paybill {company.get('paybill', '')}, Account No: Vehicle Registration Number", STYLE_FOOT),
          Paragraph(physical, STYLE_FOOT_R)]],
        colWidths=[width * 0.55, width * 0.45],
    )
    payment.setStyle(TableStyle([("LEFTPADDING", (0, 0), (0, 0), 0), ("RIGHTPADDING", (-1, 0), (-1, 0), 0)]))
    story.append(payment)

    doc.build(story, onFirstPage=_card_border, onLaterPages=_card_border)
    return buf.getvalue()


def render_risk_note_pdf(*, risk_note, quotation, company: dict, conditions: list[str]) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, topMargin=14 * mm, bottomMargin=14 * mm, leftMargin=16 * mm, rightMargin=16 * mm
    )
    story = []

    story.append(
        _header_table(
            company,
            [
                ("RISK NOTE", STYLE_RIGHT_INSURER),
                (risk_note.risk_note_number, STYLE_RIGHT),
                (f"Linked Quotation: {quotation.quotation_number}", STYLE_RIGHT_MUTED),
                (f"Date Issued: {risk_note.generated_at.strftime('%d %B %Y')}", STYLE_RIGHT_MUTED),
            ],
        )
    )
    story.append(Spacer(1, 10))

    rows = [
        ["Field", "Details"],
        ["Insured / Client Name", quotation.client.full_name],
        ["Vehicle Registration", quotation.vehicle.registration_no],
        ["Vehicle Make/Model", f"{quotation.vehicle.make or '—'} {quotation.vehicle.model or ''}".strip()],
        ["Insurance Company", quotation.insurer.name],
        ["Cover Type", quotation.cover_type.title()],
        ["Class of Business", quotation.vehicle_class_label],
        ["Sum Insured", _money(float(risk_note.sum_insured))],
        ["Premium", _money(float(risk_note.premium))],
        ["Period of Insurance", f"{risk_note.cover_start_date.strftime('%d %b %Y')} — {risk_note.cover_end_date.strftime('%d %b %Y') if risk_note.cover_end_date else 'Ongoing'}"],
        ["Effective / Start Date", risk_note.cover_start_date.strftime("%d %B %Y")],
        ["Quotation Accepted On", risk_note.quotation_accepted_at.strftime("%d %B %Y, %H:%M")],
        ["Status", risk_note.status.value],
    ]
    options_used = (quotation.snapshot.data.get("options_used") if quotation.snapshot else None) or {}
    if options_used.get("commercial_use"):
        rows.append(["Commercial Use", _commercial_use_label(options_used["commercial_use"])])
        if options_used.get("tonnage"):
            rows.append(["Tonnage", f"{options_used['tonnage']:,g} tons"])
        if options_used.get("institution_type"):
            rows.append(["Institution Type", options_used["institution_type"].title()])
            rows.append(["Vehicle Type", (options_used.get("institutional_vehicle_type") or "").title()])
            rows.append(["Passenger Category", (options_used.get("passenger_category") or "").replace("_", " ").title()])
            if options_used.get("pll_seats"):
                rows.append(["Passenger Seats (excl. driver)", str(options_used["pll_seats"])])

    tbl = Table(rows, colWidths=[55 * mm, 130 * mm])
    tbl.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BACKGROUND", (0, 0), (-1, 0), IMOTH_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, PANEL),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(tbl)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Relevant Conditions", STYLE_H3))
    story.append(_bullet_list(conditions))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", color=PANEL, thickness=1))
    story.append(Spacer(1, 4))
    story.append(
        Paragraph(
            f"This Risk Note is issued by {company.get('name', 'Imoth Insurance Brokers Limited')}, "
            f"{company.get('address', '')}. Tel: {company.get('phone', '')} | {company.get('email', '')}.",
            STYLE_FOOT,
        )
    )

    doc.build(story)
    return buf.getvalue()
