"""스모크 테스트 - DART API 호출 없이 전체 데이터 파이프라인 검증

가짜 크로스 테이블을 만들어 다음을 검증합니다:
  - build_annual_summary → 사용자 포맷 연간 요약
  - extract_quarterly_summary → 분기 요약
  - build_inventory_detail → 재고자산 세부
  - save_user_format_excel → 엑셀 저장 + 차트

실행: python -m tests.smoke_test
"""

import os
import sys
import tempfile

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dart_scraper.annual_summary import build_annual_summary, build_inventory_detail
from dart_scraper.analyzer import calculate_investment_metrics, build_clean_statement
from dart_scraper.competitors import build_comparison_table
from dart_scraper.excel_builder import save_user_format_excel
from dart_scraper.notes_classifier import classify_notes
from dart_scraper.quarterly import extract_quarterly_summary, QUARTER_REPORTS
from dart_scraper.segment_parser import (
    extract_purchase_sources, extract_sales_channels, extract_segment_sales,
)


def _make_bs(years):
    rows = []
    base = 50_000_000_000
    for i, y in enumerate(years):
        mult = (i + 1)
        rows.append(("자산총계", mult * base, y))
        rows.append(("현금및현금성자산", mult * base // 10, y))
        rows.append(("매출채권및기타채권", mult * base // 5, y))
        rows.append(("재고자산", mult * base // 8, y))
        rows.append(("부채총계", mult * base // 2, y))
        rows.append(("매입채무및기타채무", mult * base // 10, y))
        rows.append(("단기차입금", mult * 7_000_000_000, y))
        rows.append(("자본총계", mult * base // 2, y))
    df = pd.DataFrame(rows, columns=["계정과목", "amount", "year"])
    return df.pivot(index="계정과목", columns="year", values="amount").reset_index().rename_axis(None, axis=1)


def _make_is(years):
    rows = []
    base = 100_000_000_000
    for i, y in enumerate(years):
        mult = (i + 1) * 1.5
        rev = int(mult * base)
        cogs = int(rev * 0.3)
        sga = int(rev * 0.6)
        oi = rev - cogs - sga
        ni = int(oi * 0.8)
        rows.append(("매출액", rev, y))
        rows.append(("매출원가", cogs, y))
        rows.append(("판매비와관리비", sga, y))
        rows.append(("영업이익(손실)", oi, y))
        rows.append(("당기순이익(손실)", ni, y))
    df = pd.DataFrame(rows, columns=["계정과목", "amount", "year"])
    return df.pivot(index="계정과목", columns="year", values="amount").reset_index().rename_axis(None, axis=1)


def _make_cf(years):
    rows = []
    for i, y in enumerate(years):
        mult = (i + 1)
        rows.append(("영업활동현금흐름", mult * 20_000_000_000, y))
        rows.append(("투자활동현금흐름", -mult * 5_000_000_000, y))
        rows.append(("유형자산의 증가", -mult * 3_000_000_000, y))
        rows.append(("무형자산의 증가", -mult * 500_000_000, y))
        rows.append(("재무활동현금흐름", mult * 1_000_000_000, y))
    df = pd.DataFrame(rows, columns=["계정과목", "amount", "year"])
    return df.pivot(index="계정과목", columns="year", values="amount").reset_index().rename_axis(None, axis=1)


def run_smoke():
    start_year, end_year = 2018, 2025
    years = [str(y) for y in range(start_year, end_year + 1)]
    cross_tables = {
        "재무상태표": _make_bs(years),
        "손익계산서": _make_is(years),
        "현금흐름표": _make_cf(years),
    }

    # 1. 연간 요약
    annual = build_annual_summary(cross_tables, start_year, end_year)
    assert not annual.empty, "연간 요약 비어있음"
    print(f"[OK] 연간요약: {annual.shape} / 샘플=")
    print(annual.head(8).to_string(index=False))

    # 2. 투자지표
    metrics = calculate_investment_metrics(cross_tables, start_year, end_year)
    assert not metrics.empty
    print(f"\n[OK] 투자지표: {metrics.shape}")

    # 3. 분기 요약 (가짜 분기 테이블)
    qcols = [f"{i}Q{str(y)[-2:]}" for y in range(2023, 2026) for i in (1, 2, 3, 4)]
    q_bs = pd.DataFrame({
        "계정과목": ["자산총계", "재고자산"],
        **{c: [700_000_000_000, 150_000_000_000] for c in qcols}
    })
    q_is = pd.DataFrame({
        "계정과목": ["매출액", "매출원가", "판매비와관리비", "영업이익(손실)", "당기순이익(손실)"],
        **{c: [200_000_000_000, 50_000_000_000, 80_000_000_000, 70_000_000_000, 55_000_000_000] for c in qcols}
    })
    quarterly = extract_quarterly_summary(
        {"재무상태표": q_bs, "손익계산서": q_is},
        qcols
    )
    assert not quarterly.empty
    print(f"\n[OK] 분기요약: {quarterly.shape}")

    # 4. 재고자산 (business_data 없이 회전율만)
    inventory = build_inventory_detail({}, cross_tables, start_year, end_year)
    print(f"\n[OK] 재고자산: {inventory.shape}")

    # 5. 엑셀 저장
    with tempfile.TemporaryDirectory() as tmp:
        fp = os.path.join(tmp, "smoke_test.xlsx")
        clean = {k: build_clean_statement(v, k) for k, v in cross_tables.items()}
        save_user_format_excel(
            filepath=fp,
            company_name="테스트회사",
            company_info={},
            annual_summary=annual,
            quarterly_summary=quarterly,
            inventory_detail=inventory,
            segment_sales=pd.DataFrame(),
            purchase_sources=pd.DataFrame(),
            sales_channels=pd.DataFrame(),
            employee_trend=pd.DataFrame(),
            metrics_df=metrics,
            cross_tables=clean,
            business_data={},
            start_year=start_year,
            end_year=end_year,
        )
        size = os.path.getsize(fp)
        assert size > 5000, f"엑셀 크기 너무 작음: {size}"
        print(f"\n[OK] 엑셀 저장: {size:,} bytes")

    # 6. 경쟁사 비교
    comp = build_comparison_table(
        {"A": cross_tables, "B": cross_tables}, "2024"
    )
    assert not comp.empty
    print(f"\n[OK] 경쟁사 비교: {comp.shape}")

    # 7. 사업부문 추출 - 빈 business_data로 테스트
    seg = extract_segment_sales({})
    assert seg.empty  # 빈 결과여도 오류 없이 동작
    print(f"\n[OK] 사업부문 (빈): {seg.shape}")

    # 8. 노트 분류 테스트
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "note1.md")
        with open(path, "w") as f:
            f.write("에이피알 재무분석\n매출 성장률 높음. ROE 20% 수준. 부채비율 낮음.")
        notes = classify_notes(tmp, ["에이피알"], use_llm=False)
        assert not notes.empty
        print(f"\n[OK] 노트 분류: {notes.shape}")
        print(notes.to_string(index=False))

    print("\n" + "=" * 60)
    print("  모든 스모크 테스트 통과")
    print("=" * 60)


if __name__ == "__main__":
    run_smoke()
