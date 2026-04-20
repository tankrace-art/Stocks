"""사용자 엑셀 포맷 출력 빌더

시트 구성:
  1. 종합요약 - 연간 재무 요약 + 투자지표 + 차트
  2. 분기재무 - 1Q~4Q 단일분기 + 차트
  3. 재고자산 - 세부 품목·회전율·QoQ
  4. 사업부문매출 - 사업부문/브랜드별
  5. 매입처 - 원재료 매입 정보
  6. 판매채널 - 내수/수출, 온/오프라인
  7. 임직원추이 - 사람인 월별 데이터
  8. 원본_재무상태표 / 원본_손익계산서 / 원본_현금흐름표
  9. 원본_사업내용_YYYY

차트:
  - 매출원가율/판관비율 추이 (연간)
  - 영업이익 QoQ 추이
  - 재고자산 vs 매출 QoQ 상관관계
"""

from __future__ import annotations

import os
import re

import pandas as pd
from openpyxl.chart import LineChart, BarChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


HEADER_FILL = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
HEADER_FONT = Font(name="맑은 고딕", bold=True, color="FFFFFF", size=11)
SECTION_FILL = PatternFill(start_color="D6E4F0", end_color="D6E4F0", fill_type="solid")
SECTION_FONT = Font(name="맑은 고딕", bold=True, size=11)
DATA_FONT = Font(name="맑은 고딕", size=10)
THIN_BORDER = Border(
    left=Side(style="thin", color="D0D0D0"),
    right=Side(style="thin", color="D0D0D0"),
    top=Side(style="thin", color="D0D0D0"),
    bottom=Side(style="thin", color="D0D0D0"),
)


def save_user_format_excel(
    filepath: str,
    company_name: str,
    company_info: dict,
    annual_summary: pd.DataFrame,
    quarterly_summary: pd.DataFrame,
    inventory_detail: pd.DataFrame,
    segment_sales: pd.DataFrame,
    purchase_sources: pd.DataFrame,
    sales_channels: pd.DataFrame,
    employee_trend: pd.DataFrame,
    metrics_df: pd.DataFrame | None,
    cross_tables: dict[str, pd.DataFrame],
    business_data: dict[int, dict[str, list[pd.DataFrame]]],
    start_year: int,
    end_year: int,
    competitor_data: dict[str, pd.DataFrame] | None = None,
    news_summary: pd.DataFrame | None = None,
    study_notes: pd.DataFrame | None = None,
) -> str:
    """사용자 엑셀 포맷으로 저장"""
    os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)

    with pd.ExcelWriter(filepath, engine="openpyxl") as writer:
        # ── 1. 종합요약 ──
        if annual_summary is not None and not annual_summary.empty:
            annual_summary.to_excel(writer, sheet_name="연간요약", index=False)

        # ── 2. 분기재무 ──
        if quarterly_summary is not None and not quarterly_summary.empty:
            quarterly_summary.to_excel(writer, sheet_name="분기재무", index=False)

        # ── 3. 재고자산 ──
        if inventory_detail is not None and not inventory_detail.empty:
            inventory_detail.to_excel(writer, sheet_name="재고자산", index=False)

        # ── 4. 사업부문매출 ──
        if segment_sales is not None and not segment_sales.empty:
            segment_sales.to_excel(writer, sheet_name="사업부문매출", index=False)

        # ── 5. 매입처 ──
        if purchase_sources is not None and not purchase_sources.empty:
            purchase_sources.to_excel(writer, sheet_name="매입처", index=False)

        # ── 6. 판매채널 ──
        if sales_channels is not None and not sales_channels.empty:
            sales_channels.to_excel(writer, sheet_name="판매채널", index=False)

        # ── 7. 임직원추이 ──
        if employee_trend is not None and not employee_trend.empty:
            employee_trend.to_excel(writer, sheet_name="임직원추이", index=False)

        # ── 투자지표 ──
        if metrics_df is not None and not metrics_df.empty:
            metrics_df.to_excel(writer, sheet_name="투자지표", index=False)

        # ── 경쟁사 비교 (Phase 2) ──
        if competitor_data:
            for label, df in competitor_data.items():
                if df is None or df.empty:
                    continue
                sheet_name = f"경쟁_{label}"[:31]
                df.to_excel(writer, sheet_name=sheet_name, index=False)

        # ── 뉴스/IR 요약 (Phase 3) ──
        if news_summary is not None and not news_summary.empty:
            news_summary.to_excel(writer, sheet_name="뉴스_IR요약", index=False)

        # ── 공부 노트 (Phase 4) ──
        if study_notes is not None and not study_notes.empty:
            study_notes.to_excel(writer, sheet_name="공부노트", index=False)

        # ── 원본 재무제표 ──
        stmt_order = ["재무상태표", "손익계산서", "포괄손익계산서", "현금흐름표", "자본변동표"]
        for stmt_name in stmt_order:
            if stmt_name in cross_tables:
                df = cross_tables[stmt_name]
                if not df.empty:
                    df.to_excel(writer, sheet_name=f"원본_{stmt_name}"[:31], index=False)

        # ── 원본 사업내용 ──
        if business_data:
            from .report_parser import INVESTMENT_SECTIONS
            for year in sorted(business_data.keys()):
                sections = business_data[year]
                rows = []
                for section_key, tables in sections.items():
                    section_desc = INVESTMENT_SECTIONS.get(section_key, {}).get(
                        "description", section_key
                    )
                    rows.append(pd.DataFrame([{"구분": f"▶ {section_desc}"}]))
                    for df in tables:
                        rows.append(df)
                        rows.append(pd.DataFrame([{}]))
                if rows:
                    combined = pd.concat(rows, ignore_index=True)
                    sn = f"원본_사업내용_{year}"[:31]
                    combined.to_excel(writer, sheet_name=sn, index=False)

        # ── 스타일 + 차트 ──
        wb = writer.book
        _apply_styles(wb)
        _add_charts(wb)

    return filepath


def _apply_styles(wb):
    """전체 시트 스타일링"""
    for ws in wb.worksheets:
        if ws.max_row < 1:
            continue
        # 헤더 행
        for cell in ws[1]:
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = THIN_BORDER

        # 데이터 행
        for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
            for cell in row:
                cell.font = DATA_FONT
                cell.border = THIN_BORDER
                if cell.column == 1:
                    cell.alignment = Alignment(horizontal="left", vertical="center")
                    val = str(cell.value or "")
                    if val.startswith("【") or val.startswith("▶"):
                        for c in row:
                            c.fill = SECTION_FILL
                            c.font = SECTION_FONT
                else:
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                    # 숫자 서식
                    if isinstance(cell.value, (int, float)):
                        cell.number_format = "#,##0"

        # 열 너비
        for col_idx in range(1, ws.max_column + 1):
            col_letter = get_column_letter(col_idx)
            max_len = 10
            for row in ws.iter_rows(min_col=col_idx, max_col=col_idx):
                for cell in row:
                    if cell.value is None:
                        continue
                    s = str(cell.value)
                    korean = len(re.findall(r'[가-힣]', s))
                    max_len = max(max_len, len(s) + korean)
            ws.column_dimensions[col_letter].width = min(max_len + 3, 50)
        ws.column_dimensions["A"].width = max(
            ws.column_dimensions["A"].width, 25
        )
        ws.freeze_panes = "B2"


def _add_charts(wb):
    """주요 시트에 차트 자동 생성"""
    # 연간 요약에 매출원가율/판관비율 차트
    if "연간요약" in wb.sheetnames:
        ws = wb["연간요약"]
        _try_add_ratio_chart(ws, "매출원가율(%)", "매출원가율 추이", "F2")
        _try_add_ratio_chart(ws, "판매비와관리비율(%)", "판관비율 추이", "F20")
        _try_add_ratio_chart(ws, "영업이익률(%)", "영업이익률 추이", "F38")

    # 분기재무에 OPM% 차트
    if "분기재무" in wb.sheetnames:
        ws = wb["분기재무"]
        _try_add_ratio_chart(ws, "OPM%", "분기별 영업이익률(OPM%)", "O2")
        _try_add_value_chart(ws, "매출액", "분기별 매출액", "O20")

    # 임직원 추이
    if "임직원추이" in wb.sheetnames:
        ws = wb["임직원추이"]
        if ws.max_row > 2:
            chart = LineChart()
            chart.title = "임직원 수 추이"
            chart.height = 8
            chart.width = 16
            data_ref = Reference(ws, min_col=2, min_row=1, max_row=ws.max_row, max_col=2)
            cats_ref = Reference(ws, min_col=1, min_row=2, max_row=ws.max_row)
            chart.add_data(data_ref, titles_from_data=True)
            chart.set_categories(cats_ref)
            chart.dataLabels = DataLabelList(showVal=True)
            ws.add_chart(chart, "D2")


def _find_row_by_label(ws, label: str) -> int | None:
    """A열에서 label이 있는 행 번호 반환"""
    for row in ws.iter_rows(min_col=1, max_col=1, values_only=False):
        cell = row[0]
        if str(cell.value or "").strip() == label:
            return cell.row
    return None


def _try_add_ratio_chart(ws, label: str, title: str, anchor: str):
    """특정 비율 행의 데이터로 꺾은선 차트"""
    row_idx = _find_row_by_label(ws, label)
    if row_idx is None or ws.max_column < 3:
        return
    # 첫 행의 헤더를 카테고리로 사용
    try:
        chart = LineChart()
        chart.title = title
        chart.height = 8
        chart.width = 16
        # 숫자 셀로 변환 시도 (비율 문자열 → 숫자)
        for col in range(2, ws.max_column + 1):
            cell = ws.cell(row=row_idx, column=col)
            v = cell.value
            if isinstance(v, str) and v.endswith("%"):
                try:
                    cell.value = float(v.rstrip("%")) / 100
                    cell.number_format = "0%"
                except ValueError:
                    pass
        data_ref = Reference(
            ws, min_col=2, max_col=ws.max_column,
            min_row=row_idx, max_row=row_idx,
        )
        cats_ref = Reference(ws, min_col=2, max_col=ws.max_column, min_row=1, max_row=1)
        chart.add_data(data_ref, titles_from_data=False)
        chart.set_categories(cats_ref)
        chart.dataLabels = DataLabelList(showVal=True)
        ws.add_chart(chart, anchor)
    except Exception:
        pass


def _try_add_value_chart(ws, label: str, title: str, anchor: str):
    """특정 값 행의 데이터로 막대 차트"""
    row_idx = _find_row_by_label(ws, label)
    if row_idx is None or ws.max_column < 3:
        return
    try:
        chart = BarChart()
        chart.title = title
        chart.height = 8
        chart.width = 16
        data_ref = Reference(
            ws, min_col=2, max_col=ws.max_column,
            min_row=row_idx, max_row=row_idx,
        )
        cats_ref = Reference(ws, min_col=2, max_col=ws.max_column, min_row=1, max_row=1)
        chart.add_data(data_ref, titles_from_data=False)
        chart.set_categories(cats_ref)
        ws.add_chart(chart, anchor)
    except Exception:
        pass
