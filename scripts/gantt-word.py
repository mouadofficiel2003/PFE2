"""Gantt plein (barre continue) pour insertion Word."""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
STAGE_START = date(2026, 3, 6)
STAGE_END = date(2026, 6, 6)

PHASES = [
    ("Cahier des charges", date(2026, 3, 6), date(2026, 3, 19), "#C4A574", "2 sem."),
    ("Conception UML", date(2026, 3, 20), date(2026, 4, 19), "#5B9BD5", "1 mois"),
    ("Réalisation", date(2026, 4, 20), date(2026, 5, 24), "#70AD47", "5 sem."),
    ("Tests", date(2026, 5, 25), date(2026, 6, 6), "#ED7D31", "2 sem."),
]


def weeks() -> list[tuple[int, date, date]]:
    items = []
    d = STAGE_START
    i = 1
    while d <= STAGE_END:
        wend = min(d + timedelta(days=6), STAGE_END)
        items.append((i, d, wend))
        d = wend + timedelta(days=1)
        i += 1
    return items


def overlap_days(a1: date, a2: date, b1: date, b2: date) -> int:
    start = max(a1, b1)
    end = min(a2, b2)
    if end < start:
        return 0
    return (end - start).days + 1


def phase_for_week(wstart: date, wend: date) -> int | None:
    best_i = None
    best = 0
    for i, (_n, p1, p2, _c, _d) in enumerate(PHASES):
        o = overlap_days(wstart, wend, p1, p2)
        if o > best:
            best = o
            best_i = i
    return best_i


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "calibrib.ttf" if bold else "calibri.ttf"
    path = Path(r"C:\Windows\Fonts") / name
    if not path.exists():
        path = Path(r"C:\Windows\Fonts\arial.ttf")
    return ImageFont.truetype(str(path), size)


def draw_png() -> None:
    ws = weeks()
    n_weeks = len(ws)
    left = 28
    right_m = 28
    col_w = 88
    bar_h = 120
    header_y = 108
    month_h = 36
    week_h = 30
    week_y = header_y + month_h
    bar_y = week_y + week_h
    table_y = bar_y + bar_h + 32
    row_h = 44
    width = left + n_weeks * col_w + right_m
    height = table_y + 5 * row_h + 24
    chart_right = left + n_weeks * col_w

    img = Image.new("RGB", (width, height), "#ffffff")
    draw = ImageDraw.Draw(img)
    f_title = font(34, True)
    f_sub = font(17)
    f_month = font(16, True)
    f_week = font(13, True)
    f_bar = font(17, True)
    f_table = font(16, True)
    f_small = font(15)

    title = "Diagramme de Gantt du projet"
    bbox = draw.textbbox((0, 0), title, font=f_title)
    draw.text(((width - (bbox[2] - bbox[0])) / 2, 18), title, fill="#1f1f1f", font=f_title)
    sub = "Stage du 6 mars au 6 juin 2026"
    bbox = draw.textbbox((0, 0), sub, font=f_sub)
    draw.text(((width - (bbox[2] - bbox[0])) / 2, 62), sub, fill="#555555", font=f_sub)

    month_names = {3: "Mars", 4: "Avril", 5: "Mai", 6: "Juin"}
    i = 0
    while i < n_weeks:
        m = ws[i][1].month
        j = i
        while j < n_weeks and ws[j][1].month == m:
            j += 1
        x1 = left + i * col_w
        x2 = left + j * col_w
        draw.rectangle([x1, header_y, x2, week_y], fill="#2F4F6F")
        label = month_names[m]
        bb = draw.textbbox((0, 0), label, font=f_month)
        draw.text((x1 + (x2 - x1 - (bb[2] - bb[0])) / 2, header_y + 7), label, fill="white", font=f_month)
        i = j

    for k, (_n, w1, w2) in enumerate(ws):
        x = left + k * col_w
        draw.rectangle([x, week_y, x + col_w, bar_y], fill="#3E5E7E")
        label = f"S{k + 1}"
        bb = draw.textbbox((0, 0), label, font=f_week)
        draw.text((x + (col_w - (bb[2] - bb[0])) / 2, week_y + 6), label, fill="white", font=f_week)

    for k, (_n, w1, w2) in enumerate(ws):
        x = left + k * col_w
        idx = phase_for_week(w1, w2)
        color = PHASES[idx][3] if idx is not None else "#CCCCCC"
        draw.rectangle([x, bar_y, x + col_w, bar_y + bar_h], fill=color)

    for r, (name, p1, p2, color, dur) in enumerate(PHASES):
        ks = [k for k, (_n, w1, w2) in enumerate(ws) if phase_for_week(w1, w2) == r]
        if not ks:
            continue
        x1 = left + ks[0] * col_w
        x2 = left + (ks[-1] + 1) * col_w
        l1 = name if (ks[-1] - ks[0]) >= 3 else (name.split()[0] if name != "Cahier des charges" else "CDC")
        l2 = f"({dur})"
        bb1 = draw.textbbox((0, 0), l1, font=f_bar)
        bb2 = draw.textbbox((0, 0), l2, font=f_small)
        cx = (x1 + x2) / 2
        draw.text((cx - (bb1[2] - bb1[0]) / 2, bar_y + 32), l1, fill="#1f1f1f", font=f_bar)
        draw.text((cx - (bb2[2] - bb2[0]) / 2, bar_y + 64), l2, fill="#1f1f1f", font=f_small)

    for k in range(n_weeks + 1):
        x = left + k * col_w
        draw.line([(x, header_y), (x, bar_y + bar_h)], fill="#5C6B78", width=1)
    draw.rectangle([left, header_y, chart_right, bar_y + bar_h], outline="#2F4F6F", width=2)

    headers = ["Phase", "Début", "Fin", "Durée"]
    col_x = [left, left + 520, left + 780, left + 1040]
    draw.rectangle([left, table_y, chart_right, table_y + row_h], fill="#2F4F6F")
    for i, h in enumerate(headers):
        draw.text((col_x[i] + 16, table_y + 12), h, fill="white", font=f_table)

    for r, (name, p1, p2, color, dur) in enumerate(PHASES):
        y = table_y + (r + 1) * row_h
        draw.rectangle([left, y, chart_right, y + row_h], fill="#F4F6F8" if r % 2 == 0 else "#FFFFFF")
        draw.rectangle([left + 10, y + 12, left + 32, y + 34], fill=color)
        vals = [name, p1.strftime("%d/%m/%Y"), p2.strftime("%d/%m/%Y"), dur]
        for i, v in enumerate(vals):
            draw.text((col_x[i] + (42 if i == 0 else 16), y + 12), v, fill="#1f1f1f", font=f_small)

    for r in range(6):
        y = table_y + r * row_h
        draw.line([(left, y), (chart_right, y)], fill="#8A96A3", width=1)
    draw.rectangle([left, table_y, chart_right, table_y + 5 * row_h], outline="#5C6B78", width=2)

    out = ROOT / "diagramme-gantt.png"
    img.save(out, "PNG", dpi=(300, 300))
    print("Wrote", out, img.size)


def draw_xlsx() -> None:
    ws_weeks = weeks()
    wb = Workbook()
    ws = wb.active
    ws.title = "Gantt"

    thin = Border(
        left=Side(style="thin", color="9AA7B2"),
        right=Side(style="thin", color="9AA7B2"),
        top=Side(style="thin", color="9AA7B2"),
        bottom=Side(style="thin", color="9AA7B2"),
    )
    header_fill = PatternFill("solid", fgColor="2F4F6F")
    header_font = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)

    n = len(ws_weeks)
    last = get_column_letter(1 + n)
    ws.merge_cells(f"A1:{last}1")
    ws["A1"] = "Diagramme de Gantt du projet — Stage du 6 mars au 6 juin 2026"
    ws["A1"].font = Font(name="Calibri", bold=True, size=14)
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 24

    month_names = {3: "Mars", 4: "Avril", 5: "Mai", 6: "Juin"}
    for k, (_n, w1, _w2) in enumerate(ws_weeks, start=1):
        cell = ws.cell(2, k, month_names[w1.month])
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center
        cell.border = thin
        wk = ws.cell(3, k, f"S{k}")
        wk.fill = PatternFill("solid", fgColor="3E5E7E")
        wk.font = header_font
        wk.alignment = center
        wk.border = thin
        ws.column_dimensions[get_column_letter(k)].width = 8

    ws.row_dimensions[2].height = 20
    ws.row_dimensions[3].height = 18
    ws.row_dimensions[4].height = 36
    fills = [PatternFill("solid", fgColor=p[3][1:]) for p in PHASES]

    for k, (_n, w1, w2) in enumerate(ws_weeks, start=1):
        idx = phase_for_week(w1, w2)
        c = ws.cell(4, k, "")
        c.border = thin
        c.alignment = center
        c.font = Font(name="Calibri", bold=True, size=10)
        if idx is not None:
            c.fill = fills[idx]
            first = next(i for i, w in enumerate(ws_weeks, start=1) if phase_for_week(w[1], w[2]) == idx)
            if k == first:
                c.value = f"{PHASES[idx][0]} ({PHASES[idx][4]})"

    ws["A6"] = "Phase"
    ws["B6"] = "Début"
    ws["C6"] = "Fin"
    ws["D6"] = "Durée"
    for col in range(1, 5):
        cell = ws.cell(6, col)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center
        cell.border = thin
    for r, (name, p1, p2, color, dur) in enumerate(PHASES):
        row = 7 + r
        vals = [name, p1.strftime("%d/%m/%Y"), p2.strftime("%d/%m/%Y"), dur]
        for col, val in enumerate(vals, start=1):
            cell = ws.cell(row, col, val)
            cell.border = thin
            cell.alignment = Alignment(vertical="center")
            if col == 1:
                cell.fill = PatternFill("solid", fgColor=color[1:])
                cell.font = Font(name="Calibri", bold=True, size=11)
            else:
                cell.font = Font(name="Calibri", size=11)
        ws.row_dimensions[row].height = 22

    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1

    out = ROOT / "diagramme-gantt.xlsx"
    wb.save(out)
    print("Wrote", out)


if __name__ == "__main__":
    draw_png()
    draw_xlsx()
