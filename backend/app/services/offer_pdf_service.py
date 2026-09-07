"""Pre-acceptance PDF: only the stored anonymous offer, never customer documents."""
from html import escape
from datetime import timezone
from io import BytesIO
import re

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from app.services.pdf_service import LOGO_PATH

OFFER_TITLE = 'Indicative Motor Insurance Quotation'
OFFER_NOTICE = 'This quotation has not yet been accepted and does not constitute an active insurance policy.'


def filename(offer):
    insurer = re.sub(r"[^A-Za-z0-9-]+", "-", offer.snapshot_data["insurer_name"]).strip("-")
    return f"Imoth-Motor-Quote-{insurer}-{offer.id}.pdf"


def render_offer_pdf(offer, company):
    buf = BytesIO()
    blue = colors.HexColor('#183D79')
    red = colors.HexColor('#E2231A')
    ink = colors.HexColor('#243248')
    muted = colors.HexColor('#627086')
    pale = colors.HexColor('#F1F5FA')
    line = colors.HexColor('#DCE4EE')
    width = 178*mm
    styles = {
        'BodyText': ParagraphStyle('Body', fontName='Helvetica', fontSize=8.5, leading=12, textColor=ink),
        'Small': ParagraphStyle('Small', fontName='Helvetica', fontSize=7.3, leading=10, textColor=muted),
        'Label': ParagraphStyle('Label', fontName='Helvetica-Bold', fontSize=7, leading=10, textColor=muted, spaceAfter=3),
        'Brand': ParagraphStyle('Brand', fontName='Helvetica-Bold', fontSize=14, leading=18, textColor=blue),
        'Title': ParagraphStyle('Title', fontName='Helvetica-Bold', fontSize=19, leading=23, textColor=blue),
        'Heading2': ParagraphStyle('Section', fontName='Helvetica-Bold', fontSize=10, leading=14, textColor=blue, spaceBefore=12, spaceAfter=6, keepWithNext=True),
        'White': ParagraphStyle('White', fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=colors.white),
        'WhiteSmall': ParagraphStyle('WhiteSmall', fontName='Helvetica', fontSize=8, leading=12, textColor=colors.HexColor('#DCE8FA')),
        'Price': ParagraphStyle('Price', fontName='Helvetica-Bold', fontSize=22, leading=28, textColor=colors.white, alignment=2),
        'Right': ParagraphStyle('Right', fontName='Helvetica', fontSize=8.5, leading=12, textColor=ink, alignment=2),
        'Total': ParagraphStyle('Total', fontName='Helvetica-Bold', fontSize=10, leading=14, textColor=blue),
        'TotalRight': ParagraphStyle('TotalRight', fontName='Helvetica-Bold', fontSize=10, leading=14, textColor=blue, alignment=2),
    }
    def p(value, style='BodyText'):
        text = str(value if value is not None else 'Not provided')
        # Core PDF fonts lack reliable mathematical-symbol glyphs on some viewers.
        text = text.translate(str.maketrans({'\u2264': '<=', '\u2265': '>=', '\u2013': '-', '\u2014': '-'}))
        return Paragraph(escape(text), styles[style])
    def cash(value):
        return f"KES {float(value):,.2f}"
    snapshot = offer.snapshot_data
    brand = [p(company.get('name') or 'Imoth Insurance Brokers', 'Brand'),
             p('INSURANCE  /  HEALTH  /  PENSION', 'Small')]
    logo = Image(str(LOGO_PATH), width=23*mm, height=17.6*mm) if LOGO_PATH.exists() else ''
    header = Table([[logo, brand]], colWidths=[30*mm, width-30*mm])
    header.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'), ('LEFTPADDING',(0,0),(-1,-1),0),
                               ('BOTTOMPADDING',(0,0),(-1,-1),10), ('LINEBELOW',(0,0),(-1,-1),1,red)]))
    story = [header, Spacer(1, 12), p(OFFER_TITLE, 'Title'), Spacer(1, 8)]
    notice = Table([[p(OFFER_NOTICE)]], colWidths=[width])
    notice.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),pale), ('LINEBEFORE',(0,0),(0,0),3,red),
                               ('LEFTPADDING',(0,0),(-1,-1),10), ('TOPPADDING',(0,0),(-1,-1),8), ('BOTTOMPADDING',(0,0),(-1,-1),8)]))
    story += [notice, Spacer(1, 10)]
    hero = Table([[[p('YOUR INSURER', 'WhiteSmall'), p(snapshot['insurer_name'], 'White'),
                   p(offer.cover_type.replace('_', ' ').title(), 'WhiteSmall')],
                  [p(cash(offer.total_premium), 'Price'),
                   Paragraph('Total premium · Includes levies &amp; stamp duty',
                             ParagraphStyle('HeroCaption', parent=styles['WhiteSmall'], alignment=2))]]],
                 colWidths=[width*.52, width*.48])
    hero.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),blue), ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                             ('LEFTPADDING',(0,0),(-1,-1),12), ('RIGHTPADDING',(0,0),(-1,-1),12),
                             ('TOPPADDING',(0,0),(-1,-1),12), ('BOTTOMPADDING',(0,0),(-1,-1),12)]))
    story += [hero, Spacer(1, 8), p(f'Quote reference: {offer.id}', 'Small'),
              p('Prepared for: Prospective Client', 'Small')]
    dates = Table([[[p('DATE GENERATED', 'Label'), p(offer.created_at.astimezone(timezone.utc).strftime('%d %b %Y, %H:%M UTC'))],
                    [p('VALID UNTIL', 'Label'), p(offer.expires_at.astimezone(timezone.utc).strftime('%d %b %Y, %H:%M UTC'))]]],
                  colWidths=[width/2]*2)
    dates.setStyle(TableStyle([('LEFTPADDING',(0,0),(-1,-1),0), ('TOPPADDING',(0,0),(-1,-1),8), ('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    story += [dates, p('Vehicle & cover details', 'Heading2')]
    fields = [('Registration', offer.registration_no),
              ('Make / model', ' '.join(filter(None, [offer.make, offer.model])) or 'Not provided'),
              ('Year / age', f"{offer.year_of_manufacture} / {snapshot['calculated_age_years']} years"),
              ('Vehicle class', offer.vehicle_class_label), ('Sum insured', cash(offer.sum_insured))]
    for key, label in [('commercial_use', 'Commercial sub-branch'), ('tonnage', 'Tonnage'),
                       ('institution_type', 'Institution'), ('institutional_vehicle_type', 'Institutional vehicle type'),
                       ('passenger_category', 'Passenger category'), ('pll_seats', 'Passenger seats (excluding driver)')]:
        if offer.options.get(key):
            fields.append((label, str(offer.options[key]).replace('_', ' ')))
    cells = [[p(label.upper(), 'Label'), p(value)] for label, value in fields]
    while len(cells) % 3:
        cells.append('')
    details = Table([cells[i:i+3] for i in range(0,len(cells),3)], colWidths=[width/3]*3)
    details.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),pale), ('VALIGN',(0,0),(-1,-1),'TOP'),
                                ('LEFTPADDING',(0,0),(-1,-1),9), ('RIGHTPADDING',(0,0),(-1,-1),9),
                                ('TOPPADDING',(0,0),(-1,-1),7), ('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    story += [details, p('Premium breakdown', 'Heading2')]
    rows = [[p('PREMIUM COMPONENT', 'Label'), p('AMOUNT (KES)', 'Label')],
            [p('Basic premium'), p(cash(offer.basic_premium), 'Right')]]
    rows += [[p('Extension: ' + item['label']), p(cash(item['amount']), 'Right')] for item in offer.items[1:]]
    if len(offer.items) < 2:
        rows.append([p('Extensions'), p('None separately charged', 'Right')])
    rows += [[p(label), p(cash(value), 'Right')] for label, value in
             [('Subtotal', offer.subtotal), ('Levies', offer.levies), ('Stamp duty', offer.stamp_duty)]]
    rows.append([p('Total premium', 'Total'), p(cash(offer.total_premium), 'TotalRight')])
    table = Table(rows, colWidths=[width*.66, width*.34], repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'), ('BACKGROUND',(0,0),(-1,0),pale),
                               ('BACKGROUND',(0,-1),(-1,-1),pale), ('TOPPADDING',(0,0),(-1,-1),5),
                               ('BOTTOMPADDING',(0,0),(-1,-1),5), ('LEFTPADDING',(0,0),(-1,-1),9),
                               ('RIGHTPADDING',(0,0),(-1,-1),9), ('LINEBELOW',(0,0),(-1,-1),0.3,line)]))
    story.append(table)
    story.append(p('Cover highlights & insurer terms', 'Heading2'))
    for key, label in [('benefits','Benefits'), ('excess','Excesses'), ('limits','Important insurer limits')]:
        values = snapshot.get(key) or ['As per insurer terms.']
        if isinstance(values, str):
            values = [values]
        story.append(p(f'{label}: {values[0]}'))
        story += [p(value) for value in values[1:]]
        story.append(Spacer(1, 5))
    for key, label in [('insurer_note','Important insurer notes'), ('insurer_disclaimer','Insurer disclaimer')]:
        if snapshot.get(key):
            story += [p(f'{label}: {snapshot[key]}'), Spacer(1, 5)]
    story += [KeepTogether([Spacer(1, 5), p('Ready when you are', 'Total'),
              p('Review and compare your options. Return to the quotation portal and choose Accept This Quote when you are ready to provide your details and documents.', 'Small'),
              Spacer(1, 5), p('Subject to insurer terms, underwriting approval and required documents. This quotation provides no insurance cover and is valid only until the expiry shown above.', 'Small')])]

    def page_frame(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(line)
        canvas.line(16*mm, 15*mm, A4[0]-16*mm, 15*mm)
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(muted)
        canvas.drawString(16*mm, 11*mm, 'IMOTH  /  INDICATIVE QUOTATION  /  NOT AN ACTIVE POLICY')
        canvas.drawRightString(A4[0]-16*mm, 11*mm, f'Page {doc.page}')
        canvas.restoreState()

    SimpleDocTemplate(buf, pagesize=A4, leftMargin=16*mm, rightMargin=16*mm, topMargin=12*mm, bottomMargin=22*mm,
                      title=OFFER_TITLE, author='Imoth Insurance Brokers').build(story, onFirstPage=page_frame, onLaterPages=page_frame)
    return buf.getvalue()
