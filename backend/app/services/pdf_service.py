"""Server-side PDF generation for quotations and risk notes, mirroring the
layout of the legacy client-side "IMOTH MOTOR QUOTE" sheet (logo header,
client/vehicle/insurer block, premium breakdown table, limits/benefits two
columns, footnote conditions).
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


def render_quotation_pdf(*, quotation, company: dict, footer_text: str, conditions: list[str]) -> bytes:
    """`quotation` is the SQLAlchemy Quotation ORM instance (with .items,
    .client, .vehicle, .insurer, .motor_class, .snapshot eager-loaded)."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, topMargin=14 * mm, bottomMargin=14 * mm, leftMargin=16 * mm, rightMargin=16 * mm
    )
    story = []

    date_str = quotation.generated_at.strftime("%d %B %Y") if quotation.generated_at else quotation.created_at.strftime("%d %B %Y")
    story.append(
        _header_table(
            company,
            [
                (quotation.insurer.name.upper(), STYLE_RIGHT_INSURER),
                (quotation.vehicle.registration_no, STYLE_RIGHT),
                (f"Quote No: {quotation.quotation_number}", STYLE_RIGHT_MUTED),
                (f"Quote Date: {date_str}", STYLE_RIGHT_MUTED),
            ],
        )
    )
    story.append(Spacer(1, 8))

    if quotation.insurer.disclaimer:
        story.append(Paragraph(f"&#9888; {quotation.insurer.disclaimer}", STYLE_WARN))
        story.append(Spacer(1, 6))

    story.append(
        Paragraph(
            f"<b>Client:</b> {quotation.client.full_name} &nbsp;&nbsp; "
            f"<b>Class:</b> {quotation.vehicle_class_label} &nbsp;&nbsp; "
            f"<b>Insurer:</b> {quotation.insurer.name}",
            STYLE_LI,
        )
    )
    story.append(Spacer(1, 8))

    rows = [["Item", "Sum Insured (Kshs)", "Premium (Kshs)"]]
    rows.append(["CLASS: " + quotation.vehicle_class_label, "", ""])
    section_rows = {1}
    for i, item in enumerate(quotation.items):
        si_col = f"{quotation.sum_insured:,.0f}" if i == 0 else ""
        rows.append([item.label, si_col, _money(item.amount)])
    rows.append(["Sub-total", "", _money(quotation.subtotal)])
    rows.append(["Levies (PHCF 0.25% + Training Levy 0.20%)", "", _money(quotation.levies)])
    rows.append(["Stamp Duty", "", _money(quotation.stamp_duty)])
    total_idx = len(rows)
    rows.append(["TOTAL PREMIUM", "", _money(quotation.total_premium)])
    rows.append(["Amount Paid", "", _money(quotation.amount_paid)])
    balance_idx = len(rows)
    balance_label = "BALANCE DUE" if quotation.balance > 0 else ("OVERPAYMENT" if quotation.balance < 0 else "BALANCE — PAID IN FULL")
    rows.append([balance_label, "", _money(abs(quotation.balance))])

    story.append(_premium_table(rows, {total_idx, balance_idx}, section_rows))
    story.append(Spacer(1, 10))

    two_col = Table(
        [
            [
                [Paragraph("Limits of Cover", STYLE_H3), _bullet_list(quotation.snapshot.data.get("limits", []))],
                [Paragraph("Excess &amp; Benefits / Remarks", STYLE_H3), _bullet_list(
                    quotation.snapshot.data.get("excess", []) + quotation.snapshot.data.get("benefits", [])
                )],
            ]
        ],
        colWidths=[95 * mm, 95 * mm],
    )
    two_col.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(two_col)
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", color=PANEL, thickness=1))
    story.append(Spacer(1, 4))

    validity_days = quotation.expires_at and (quotation.expires_at - quotation.created_at).days
    cond_lines = [f"<b>** {footer_text}</b>"]
    if validity_days:
        cond_lines.append(f"** Valid for {validity_days} days from the date of this quotation (expires {quotation.expires_at.strftime('%d %B %Y')}).")
    for c in conditions:
        cond_lines.append(f"** {c}")
    story.append(Paragraph("<br/>".join(cond_lines), STYLE_FOOT))
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            f"Payment: Paybill {company.get('paybill', '')}, Account No: Vehicle Registration Number &nbsp;&nbsp;|&nbsp;&nbsp; {company.get('address', '')}",
            STYLE_FOOT,
        )
    )

    doc.build(story)
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
