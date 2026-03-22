"""Excel Exporter - Generates formatted daily trend report"""
import os
from datetime import datetime
from typing import Optional

import openpyxl
from openpyxl.styles import (
    Font, PatternFill, Alignment, Border, Side, numbers
)
from openpyxl.utils import get_column_letter

from .config import OUTPUT_DIR, APR_BRANDS


# Color palette
COLOR_HEADER_BG = "2F5496"      # Dark blue - header
COLOR_HEADER_FG = "FFFFFF"      # White - header text
COLOR_MEDICUBE_BG = "D6E4F7"    # Light blue - Medicube highlight
COLOR_MEDICUBE_FG = "1F3864"    # Dark navy - Medicube text
COLOR_APR_BG = "EBF3FB"         # Very light blue - other APR brands
COLOR_SUBHEADER_BG = "4472C4"   # Medium blue - sub-headers
COLOR_SUBHEADER_FG = "FFFFFF"
COLOR_ROW_ALT = "F5F9FF"        # Alternating row color
COLOR_BORDER = "B8CCE4"


def _thin_border():
    side = Side(style="thin", color=COLOR_BORDER)
    return Border(left=side, right=side, top=side, bottom=side)


def _style_header_cell(cell, text, bg_color=COLOR_HEADER_BG, fg_color=COLOR_HEADER_FG, bold=True, size=11):
    cell.value = text
    cell.font = Font(bold=bold, color=fg_color, size=size, name="맑은 고딕")
    cell.fill = PatternFill("solid", fgColor=bg_color)
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell.border = _thin_border()


def _style_data_cell(cell, value, bg_color=None, fg_color="000000", bold=False, align="center"):
    cell.value = value
    cell.font = Font(color=fg_color, bold=bold, size=10, name="맑은 고딕")
    if bg_color:
        cell.fill = PatternFill("solid", fgColor=bg_color)
    cell.alignment = Alignment(horizontal=align, vertical="center")
    cell.border = _thin_border()


def _create_amazon_sheet(wb: openpyxl.Workbook, amazon_data: dict):
    """Create the Amazon rankings sheet matching the image format."""
    ws = wb.create_sheet("Amazon 랭킹")

    countries = amazon_data.get("countries", [])
    brands = amazon_data.get("brands", APR_BRANDS)
    summary = amazon_data.get("summary", {})
    fetched_at = amazon_data.get("fetched_at", "")

    # Title row
    title = f"국가별 아마존 뷰티 Top 100 랭크 제품 갯수  (수집일시: {fetched_at})"
    ws.merge_cells(f"A1:{get_column_letter(len(countries) + 3)}1")
    title_cell = ws["A1"]
    title_cell.value = title
    title_cell.font = Font(bold=True, size=13, name="맑은 고딕")
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    title_cell.fill = PatternFill("solid", fgColor="1F3864")
    title_cell.font = Font(bold=True, size=13, color="FFFFFF", name="맑은 고딕")
    ws.row_dimensions[1].height = 28

    # Header row (순위, 브랜드명, country columns, 총합계)
    header_row = 2
    ws.cell(row=header_row, column=1).value = "순위"
    ws.cell(row=header_row, column=2).value = "브랜드명"
    for col_idx, country in enumerate(countries, 3):
        ws.cell(row=header_row, column=col_idx).value = country
    ws.cell(row=header_row, column=len(countries) + 3).value = "총합계"

    for col in range(1, len(countries) + 4):
        _style_header_cell(ws.cell(row=header_row, column=col), ws.cell(row=header_row, column=col).value)
    ws.row_dimensions[header_row].height = 22

    # Sort brands by total count (descending)
    brand_totals = []
    for brand in brands:
        total = summary.get(brand, {}).get("총합계", 0)
        brand_totals.append((brand, total))
    brand_totals.sort(key=lambda x: -x[1])

    # Compute rankings (ties share same rank)
    ranked = []
    rank = 1
    for i, (brand, total) in enumerate(brand_totals):
        if i > 0 and brand_totals[i][1] < brand_totals[i - 1][1]:
            rank = i + 1
        ranked.append((rank, brand, total))

    # Data rows
    for data_row_idx, (rank_num, brand, total) in enumerate(ranked):
        row = header_row + 1 + data_row_idx
        is_medicube = brand.lower() == "medicube"

        bg = COLOR_MEDICUBE_BG if is_medicube else (COLOR_APR_BG if data_row_idx % 2 == 0 else None)
        fg = COLOR_MEDICUBE_FG if is_medicube else "000000"
        bold = is_medicube

        _style_data_cell(ws.cell(row=row, column=1), rank_num, bg, fg, bold)
        _style_data_cell(ws.cell(row=row, column=2), brand, bg, fg, bold, align="left")
        for col_idx, country in enumerate(countries, 3):
            val = summary.get(brand, {}).get(country, 0)
            _style_data_cell(ws.cell(row=row, column=col_idx), val if val > 0 else "", bg, fg, bold)
        _style_data_cell(ws.cell(row=row, column=len(countries) + 3), total, bg, fg, bold)
        ws.row_dimensions[row].height = 20

    # Column widths
    ws.column_dimensions["A"].width = 8
    ws.column_dimensions["B"].width = 18
    for col_idx in range(3, len(countries) + 3):
        ws.column_dimensions[get_column_letter(col_idx)].width = 10
    ws.column_dimensions[get_column_letter(len(countries) + 3)].width = 10

    ws.freeze_panes = "C3"


def _create_google_trends_sheet(wb: openpyxl.Workbook, trends_data: dict):
    """Create Google Trends analysis sheet."""
    ws = wb.create_sheet("Google Trends")
    fetched_at = trends_data.get("fetched_at", "")

    # Title
    ws.merge_cells("A1:F1")
    _style_header_cell(ws["A1"], f"Google Trends - Medicube  (수집: {fetched_at})", size=13)
    ws.row_dimensions[1].height = 28

    # Current score section
    ws["A3"] = "현재 트렌드 점수 (0-100)"
    ws["A3"].font = Font(bold=True, size=11, name="맑은 고딕")
    ws["B3"] = trends_data.get("current_score", "N/A")
    ws["B3"].font = Font(bold=True, size=14, color="2F5496", name="맑은 고딕")
    ws["C3"] = f"기간: {trends_data.get('timeframe', '')} | 지역: {trends_data.get('geo', '전세계')}"
    ws["C3"].font = Font(size=10, name="맑은 고딕")

    # By region table
    by_region = trends_data.get("by_region", {})
    if by_region:
        row = 5
        _style_header_cell(ws.cell(row=row, column=1), "국가", "4472C4")
        _style_header_cell(ws.cell(row=row, column=2), "최근 점수", "4472C4")
        _style_header_cell(ws.cell(row=row, column=3), "평균 점수 (1개월)", "4472C4")

        for r_idx, (region, scores) in enumerate(by_region.items()):
            r = row + 1 + r_idx
            bg = COLOR_MEDICUBE_BG if r_idx % 2 == 0 else None
            _style_data_cell(ws.cell(row=r, column=1), region, bg, align="left")
            _style_data_cell(ws.cell(row=r, column=2), scores.get("latest_score", 0), bg)
            _style_data_cell(ws.cell(row=r, column=3), scores.get("avg_score", 0), bg)

    # Top countries
    top_countries = trends_data.get("top_countries", [])
    if top_countries:
        start_row = 5 + len(by_region) + 3 if by_region else 8
        ws.cell(row=start_row, column=1).value = "인기 국가 Top 20"
        ws.cell(row=start_row, column=1).font = Font(bold=True, size=11, name="맑은 고딕")
        _style_header_cell(ws.cell(row=start_row + 1, column=1), "국가", "4472C4")
        _style_header_cell(ws.cell(row=start_row + 1, column=2), "관심도 점수", "4472C4")
        for i, item in enumerate(top_countries[:20]):
            r = start_row + 2 + i
            bg = COLOR_ROW_ALT if i % 2 == 0 else None
            _style_data_cell(ws.cell(row=r, column=1), item.get("country", ""), bg, align="left")
            _style_data_cell(ws.cell(row=r, column=2), item.get("score", 0), bg)

    # Rising queries
    rising = trends_data.get("rising_queries", [])
    if rising:
        col_start = 4
        row = 5
        ws.cell(row=row, column=col_start).value = "급상승 검색어"
        ws.cell(row=row, column=col_start).font = Font(bold=True, size=11, name="맑은 고딕")
        _style_header_cell(ws.cell(row=row + 1, column=col_start), "검색어", "4472C4")
        _style_header_cell(ws.cell(row=row + 1, column=col_start + 1), "상승률", "4472C4")
        for i, q in enumerate(rising):
            r = row + 2 + i
            bg = COLOR_ROW_ALT if i % 2 == 0 else None
            _style_data_cell(ws.cell(row=r, column=col_start), q.get("query", ""), bg, align="left")
            _style_data_cell(ws.cell(row=r, column=col_start + 1), q.get("value", ""), bg)

    for col in ["A", "B", "C", "D", "E", "F"]:
        ws.column_dimensions[col].width = 20
    ws.freeze_panes = "A3"



COLOR_ANUA_BG = "E8F5E9"
COLOR_ANUA_FG = "1B5E20"


def _write_brand_block(ws, start_row: int, brand_name: str, products: list, bg_color: str):
    """Write a brand's product list block into the sheet."""
    ws.cell(row=start_row, column=1).value = f"{brand_name} 제품 목록"
    ws.cell(row=start_row, column=1).font = Font(bold=True, size=11, name="맑은 고딕", color="1F3864")
    headers = ["순위", "브랜드", "상품명", "가격", "URL"]
    for col, h in enumerate(headers, 1):
        _style_header_cell(ws.cell(row=start_row + 1, column=col), h, COLOR_SUBHEADER_BG)
    for i, p in enumerate(products):
        r = start_row + 2 + i
        _style_data_cell(ws.cell(row=r, column=1), p.get("rank", ""), bg_color, bold=True)
        _style_data_cell(ws.cell(row=r, column=2), p.get("brand", ""), bg_color, align="left")
        _style_data_cell(ws.cell(row=r, column=3), p.get("name", "")[:80], bg_color, align="left")
        _style_data_cell(ws.cell(row=r, column=4), p.get("price", ""), bg_color)
        _style_data_cell(ws.cell(row=r, column=5), p.get("url", ""), bg_color, align="left")
    return start_row + 2 + len(products)


def _create_platform_sheet(wb: openpyxl.Workbook, data: dict, sheet_name: str):
    """Generic sheet for Qoo10 / Olive Young - shows Medicube & Anua."""
    ws = wb.create_sheet(sheet_name)
    fetched_at = data.get("fetched_at", "")
    platform = data.get("platform", sheet_name)

    ws.merge_cells("A1:G1")
    _style_header_cell(ws["A1"], f"{platform} 베스트셀러  (수집: {fetched_at})", size=13)
    ws.row_dimensions[1].height = 28

    # Summary row
    ws["A3"] = "Medicube 제품 수"
    ws["A3"].font = Font(bold=True, size=11, name="맑은 고딕")
    ws["B3"] = data.get("medicube_count", 0)
    ws["B3"].font = Font(bold=True, size=14, color="2F5496", name="맑은 고딕")
    ws["C3"] = f"/ 전체 {data.get('total_scanned', 0)}개 중"
    ws["C3"].font = Font(size=10, name="맑은 고딕")

    ws["D3"] = "Anua 제품 수"
    ws["D3"].font = Font(bold=True, size=11, name="맑은 고딕")
    ws["E3"] = data.get("anua_count", 0)
    ws["E3"].font = Font(bold=True, size=14, color=COLOR_ANUA_FG, name="맑은 고딕")

    # Medicube products block
    medicube_products = data.get("medicube_products", [])
    next_row = 5
    if medicube_products:
        next_row = _write_brand_block(ws, next_row, "Medicube", medicube_products, COLOR_MEDICUBE_BG)
        next_row += 2  # gap

    # Anua products block
    anua_products = data.get("anua_products", [])
    if anua_products:
        next_row = _write_brand_block(ws, next_row, "Anua", anua_products, COLOR_ANUA_BG)
        next_row += 2  # gap

    # All top 20
    all_top = data.get("all_products_top20", [])
    if all_top:
        ws.cell(row=next_row, column=1).value = "전체 Top 20 제품"
        ws.cell(row=next_row, column=1).font = Font(bold=True, size=11, name="맑은 고딕")
        headers = ["순위", "브랜드", "상품명", "가격", "URL"]
        for col, h in enumerate(headers, 1):
            _style_header_cell(ws.cell(row=next_row + 1, column=col), h, "4472C4")
        for i, p in enumerate(all_top):
            r = next_row + 2 + i
            is_med = p.get("is_medicube", False)
            is_anua = p.get("is_anua", False)
            if is_med:
                bg = COLOR_MEDICUBE_BG
            elif is_anua:
                bg = COLOR_ANUA_BG
            else:
                bg = COLOR_ROW_ALT if i % 2 == 0 else None
            bold = is_med or is_anua
            _style_data_cell(ws.cell(row=r, column=1), p.get("rank", ""), bg, bold=bold)
            _style_data_cell(ws.cell(row=r, column=2), p.get("brand", ""), bg, align="left", bold=bold)
            _style_data_cell(ws.cell(row=r, column=3), p.get("name", "")[:80], bg, align="left", bold=bold)
            _style_data_cell(ws.cell(row=r, column=4), p.get("price", ""), bg, bold=bold)
            _style_data_cell(ws.cell(row=r, column=5), p.get("url", ""), bg, align="left")

    ws.column_dimensions["A"].width = 8
    ws.column_dimensions["B"].width = 15
    ws.column_dimensions["C"].width = 45
    ws.column_dimensions["D"].width = 15
    ws.column_dimensions["E"].width = 50


def _create_summary_sheet(wb: openpyxl.Workbook, all_data: dict, report_date: str):
    """Create a daily summary dashboard sheet."""
    ws = wb.create_sheet("일일 요약", 0)  # Insert at front

    # Title
    ws.merge_cells("A1:H1")
    _style_header_cell(ws["A1"], f"Medicube 일일 트렌드 대시보드  |  {report_date}", size=14)
    ws.row_dimensions[1].height = 32

    ws.merge_cells("A2:H2")
    ws["A2"] = "APR (에이피알)  |  브랜드: Medicube, d'alba, ANUA, celimax, BIODANCE"
    ws["A2"].font = Font(size=10, italic=True, color="666666", name="맑은 고딕")
    ws["A2"].alignment = Alignment(horizontal="center")

    # Google Trends
    row = 4
    _style_header_cell(ws.cell(row=row, column=1), "Google Trends", COLOR_SUBHEADER_BG)
    ws.merge_cells(f"A{row}:D{row}")
    trends = all_data.get("google_trends", {})
    score = trends.get("current_score", "N/A")
    by_region = trends.get("by_region", {})
    ws.cell(row=row + 1, column=1).value = "전세계 트렌드 점수"
    ws.cell(row=row + 1, column=1).font = Font(size=10, name="맑은 고딕")
    ws.cell(row=row + 1, column=2).value = score
    ws.cell(row=row + 1, column=2).font = Font(bold=True, size=16, color="2F5496", name="맑은 고딕")
    ws.cell(row=row + 1, column=3).value = "/ 100"
    ws.cell(row=row + 1, column=3).font = Font(size=10, name="맑은 고딕")

    if by_region:
        r = row + 2
        for region, scores in by_region.items():
            ws.cell(row=r, column=1).value = region
            ws.cell(row=r, column=1).font = Font(size=10, name="맑은 고딕")
            ws.cell(row=r, column=2).value = scores.get("latest_score", 0)
            ws.cell(row=r, column=2).font = Font(size=10, name="맑은 고딕")
            r += 1

    # Amazon summary
    amazon_row = row + max(len(by_region) + 3 if by_region else 3, 5)
    _style_header_cell(ws.cell(row=amazon_row, column=1), "Amazon 뷰티 Top 100 (Medicube 제품 수)", COLOR_SUBHEADER_BG)
    ws.merge_cells(f"A{amazon_row}:H{amazon_row}")
    amazon = all_data.get("amazon", {})
    medicube_summary = amazon.get("summary", {}).get("medicube", {})

    headers = ["미국", "영국", "독일", "스페인", "이탈리아", "프랑스", "총합계"]
    for col_idx, h in enumerate(headers, 1):
        _style_header_cell(ws.cell(row=amazon_row + 1, column=col_idx), h, "4472C4", size=10)
        val = medicube_summary.get(h, 0) if h != "총합계" else medicube_summary.get("총합계", 0)
        bg = COLOR_MEDICUBE_BG
        _style_data_cell(ws.cell(row=amazon_row + 2, column=col_idx), val, bg, COLOR_MEDICUBE_FG, True)

    # Qoo10 & OliveYoung summary
    last_row = amazon_row + 5
    platforms = [
        ("Qoo10 Japan", all_data.get("qoo10", {})),
        ("Olive Young Global", all_data.get("oliveyoung", {})),
    ]
    for p_idx, (platform_name, p_data) in enumerate(platforms):
        r = last_row + p_idx * 4
        _style_header_cell(ws.cell(row=r, column=1), platform_name, COLOR_SUBHEADER_BG)
        ws.merge_cells(f"A{r}:H{r}")
        # Medicube
        ws.cell(row=r + 1, column=1).value = "Medicube 제품 수"
        ws.cell(row=r + 1, column=1).font = Font(size=10, name="맑은 고딕")
        ws.cell(row=r + 1, column=2).value = p_data.get("medicube_count", "N/A")
        ws.cell(row=r + 1, column=2).font = Font(bold=True, size=14, color="2F5496", name="맑은 고딕")
        ws.cell(row=r + 1, column=3).value = f"/ 전체 {p_data.get('total_scanned', 0)}개"
        ws.cell(row=r + 1, column=3).font = Font(size=10, name="맑은 고딕")
        # Anua
        ws.cell(row=r + 2, column=1).value = "Anua 제품 수"
        ws.cell(row=r + 2, column=1).font = Font(size=10, name="맑은 고딕")
        ws.cell(row=r + 2, column=2).value = p_data.get("anua_count", "N/A")
        ws.cell(row=r + 2, column=2).font = Font(bold=True, size=14, color="1B5E20", name="맑은 고딕")

    # Column widths for summary
    for col in ["A", "B", "C", "D", "E", "F", "G", "H"]:
        ws.column_dimensions[col].width = 15
    ws.column_dimensions["A"].width = 22


def export_daily_report(all_data: dict, output_path: str = None) -> str:
    """
    Export all collected trend data to a formatted Excel file.
    Returns the path to the saved file.
    """
    report_date = datetime.now().strftime("%Y-%m-%d")
    report_time = datetime.now().strftime("%H%M%S")

    if output_path is None:
        filename = f"Medicube_트렌드_{report_date}_{report_time}.xlsx"
        output_path = os.path.join(OUTPUT_DIR, filename)

    wb = openpyxl.Workbook()
    # Remove default sheet
    if "Sheet" in wb.sheetnames:
        del wb["Sheet"]

    # Create sheets
    _create_summary_sheet(wb, all_data, report_date)

    if "amazon" in all_data and not all_data["amazon"].get("error"):
        _create_amazon_sheet(wb, all_data["amazon"])

    if "google_trends" in all_data and not all_data["google_trends"].get("error"):
        _create_google_trends_sheet(wb, all_data["google_trends"])

    if "qoo10" in all_data and not all_data["qoo10"].get("error"):
        _create_platform_sheet(wb, all_data["qoo10"], "Qoo10 Japan")

    if "oliveyoung" in all_data and not all_data["oliveyoung"].get("error"):
        _create_platform_sheet(wb, all_data["oliveyoung"], "Olive Young")

    wb.save(output_path)
    return output_path
