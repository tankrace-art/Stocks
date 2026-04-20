"""DART 재무분석 투자도구 - CLI 메인 (Phase 1~4 통합)

기본 사용:
    python -m dart_scraper.main -c "에이피알" -p "2018-2025"

경쟁사 추가 분석:
    python -m dart_scraper.main -c "에이피알" -p "2018-2025" --competitors "고운세상코스메틱,토니모리"

뉴스·IR 포함:
    python -m dart_scraper.main -c "에이피알" -p "2018-2025" --news

공부 노트 분류 포함:
    python -m dart_scraper.main -c "에이피알" -p "2018-2025" --notes ./my_notes

사람인 임직원 데이터:
    python -m dart_scraper.main -c "에이피알" -p "2018-2025" --saramin-url "https://www.saramin.co.kr/zf_user/company-info/view?csn=..."
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime

import pandas as pd

from .analyzer import build_clean_statement, calculate_investment_metrics
from .annual_summary import build_annual_summary, build_inventory_detail
from .competitors import build_comparison_table, collect_competitors
from .dart_client import DartClient
from .excel_builder import save_user_format_excel
from .news_collector import build_news_summary, collect_dart_ir, fetch_naver_news
from .notes_classifier import classify_notes
from .quarterly import collect_quarterly_statements, extract_quarterly_summary, QUARTER_REPORTS
from .report_parser import ReportParser
from .saramin import fetch_saramin_employees
from .segment_parser import (
    extract_purchase_sources, extract_sales_channels, extract_segment_sales,
)
from .utils import parse_period


def _log(msg: str):
    print(msg)


def _quarter_columns(start_year: int, end_year: int) -> list[str]:
    cols = []
    for year in range(start_year, end_year + 1):
        yy = str(year)[-2:]
        for qkey, _ in QUARTER_REPORTS:
            cols.append(f"{qkey[-1]}Q{yy}")
    return cols


def run_full_analysis(
    company_name: str,
    period: str,
    api_key: str = "",
    fs_div: str = "CFS",
    competitors: list[str] | None = None,
    include_news: bool = False,
    notes_dir: str = "",
    saramin_url: str = "",
    include_quarterly: bool = True,
    output_dir: str = "",
) -> str:
    """Phase 1~4 전체 실행"""
    client = DartClient(api_key)
    parser = ReportParser(client)

    start_year, end_year, _ = parse_period(period)
    print(f"\n{'#' * 60}")
    print(f"  {company_name} 종합 투자분석")
    print(f"  기간: {start_year}~{end_year} | {'연결' if fs_div == 'CFS' else '개별'}재무제표")
    print(f"{'#' * 60}")

    # 1. 기업 검색
    print("\n[1] 기업 검색...")
    matches = client.search_corp(company_name)
    if not matches:
        print(f"  [오류] '{company_name}' 찾을 수 없습니다.")
        return ""
    target = next((m for m in matches if m["corp_name"] == company_name), matches[0])
    corp_code = target["corp_code"]
    stock_code = target.get("stock_code", "")
    print(f"  {target['corp_name']} ({stock_code or '비상장'})")

    # 2. 기업 개황
    company_info = client.get_company_info(corp_code)

    # 3. 연간 재무제표
    print("\n[2] 연간 재무제표 수집...")
    cross_tables = client.get_yearly_cross_data(
        corp_code, start_year, end_year, fs_div, log_fn=_log
    )

    # 4. 투자지표
    metrics_df = pd.DataFrame()
    if cross_tables:
        metrics_df = calculate_investment_metrics(cross_tables, start_year, end_year)

    # 5. 사용자 포맷 연간 요약
    annual_summary = pd.DataFrame()
    if cross_tables:
        annual_summary = build_annual_summary(cross_tables, start_year, end_year)

    # 6. 분기별 (최근 3년만 기본)
    quarterly_summary = pd.DataFrame()
    if include_quarterly:
        q_start = max(start_year, end_year - 2)
        print(f"\n[3] 분기별 재무제표 수집 ({q_start}~{end_year})...")
        quarterly_tables = collect_quarterly_statements(
            client, corp_code, q_start, end_year, fs_div, log_fn=_log
        )
        if quarterly_tables:
            qcols = _quarter_columns(q_start, end_year)
            quarterly_summary = extract_quarterly_summary(quarterly_tables, qcols)

    # 7. 사업보고서 세부
    print("\n[4] 사업보고서 분석...")
    business_data = parser.get_yearly_business_data(
        corp_code, start_year, end_year, log_fn=_log
    )

    # 8. 재고자산·사업부문·매입처·판매채널
    inventory_detail = build_inventory_detail(business_data, cross_tables, start_year, end_year)
    segment_sales = extract_segment_sales(business_data)
    purchase_sources = extract_purchase_sources(business_data)
    sales_channels = extract_sales_channels(business_data)

    # 9. 사람인 임직원
    employee_trend = pd.DataFrame()
    if saramin_url or stock_code:
        print("\n[5] 사람인 임직원 추이 수집...")
        try:
            employee_trend = fetch_saramin_employees(company_name, saramin_url)
            if employee_trend.empty:
                print("  - 임직원 데이터 추출 실패 (사람인 페이지 구조 변경 가능성)")
        except Exception as e:
            print(f"  [오류] 사람인: {e}")

    # 10. 경쟁사 (Phase 2)
    competitor_compare = {}
    if competitors:
        print(f"\n[6] 경쟁사 {len(competitors)}개 분석...")
        comp_data = collect_competitors(
            client, competitors, start_year, end_year, fs_div, log_fn=_log
        )
        if comp_data:
            # 본사 포함
            all_data = {company_name: cross_tables, **comp_data}
            comparison = build_comparison_table(all_data, str(end_year))
            competitor_compare = {"비교": comparison}
            for name, cross in comp_data.items():
                if "손익계산서" in cross:
                    competitor_compare[name] = build_clean_statement(
                        cross.get("손익계산서", pd.DataFrame()), "손익계산서"
                    )

    # 11. 뉴스·IR (Phase 3)
    news_summary = pd.DataFrame()
    if include_news:
        print("\n[7] 뉴스·IR 수집 중...")
        use_llm = bool(os.getenv("ANTHROPIC_API_KEY"))
        if not use_llm:
            print("  * ANTHROPIC_API_KEY 없음 → LLM 요약 생략")
        dart_ir = collect_dart_ir(client, corp_code, days=365)
        naver = fetch_naver_news(stock_code) if stock_code else pd.DataFrame()
        news_summary = build_news_summary(dart_ir, naver, use_llm=use_llm)

    # 12. 공부 노트 (Phase 4)
    study_notes = pd.DataFrame()
    if notes_dir:
        print(f"\n[8] 공부 노트 분류 ({notes_dir})...")
        all_targets = [company_name] + (competitors or [])
        use_llm = bool(os.getenv("ANTHROPIC_API_KEY"))
        study_notes = classify_notes(notes_dir, all_targets, use_llm=use_llm)

    # 13. 엑셀 저장
    if not output_dir:
        output_dir = os.path.join(os.getcwd(), "output")
    os.makedirs(output_dir, exist_ok=True)

    safe_name = company_name.replace(" ", "_")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath = os.path.join(
        output_dir, f"{safe_name}_{start_year}-{end_year}_종합분석_{timestamp}.xlsx"
    )

    # 원본 재무제표는 억 단위로 정리
    clean_tables = {}
    for stmt_name, df in cross_tables.items():
        clean_tables[stmt_name] = build_clean_statement(df, stmt_name)

    save_user_format_excel(
        filepath=filepath,
        company_name=company_name,
        company_info=company_info,
        annual_summary=annual_summary,
        quarterly_summary=quarterly_summary,
        inventory_detail=inventory_detail,
        segment_sales=segment_sales,
        purchase_sources=purchase_sources,
        sales_channels=sales_channels,
        employee_trend=employee_trend,
        metrics_df=metrics_df,
        cross_tables=clean_tables,
        business_data=business_data,
        start_year=start_year,
        end_year=end_year,
        competitor_data=competitor_compare or None,
        news_summary=news_summary if not news_summary.empty else None,
        study_notes=study_notes if not study_notes.empty else None,
    )

    print(f"\n{'=' * 60}")
    print(f"  완료! → {filepath}")
    print(f"{'=' * 60}\n")
    return filepath


def main():
    p = argparse.ArgumentParser(
        description="DART 재무분석 투자도구 - 종합자동화",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--company", "-c", required=True, help="기업명")
    p.add_argument("--period", "-p", required=True, help='기간 (예: "2018-2025")')
    p.add_argument("--api-key", "-k", default="", help="DART API 키")
    p.add_argument("--fs", choices=["연결", "개별"], default="연결", help="재무제표 구분")
    p.add_argument("--competitors", default="", help='경쟁사 쉼표 구분 (예: "A,B,C")')
    p.add_argument("--news", action="store_true", help="뉴스·IR 수집 포함")
    p.add_argument("--notes", default="", help="공부 노트 디렉토리 경로")
    p.add_argument("--saramin-url", default="", help="사람인 기업정보 URL (선택)")
    p.add_argument("--no-quarterly", action="store_true", help="분기 데이터 제외")
    p.add_argument("--output", "-o", default="", help="출력 디렉토리")

    args = p.parse_args()
    fs_div = "CFS" if args.fs == "연결" else "OFS"
    competitors = [c.strip() for c in args.competitors.split(",") if c.strip()] if args.competitors else None

    run_full_analysis(
        company_name=args.company,
        period=args.period,
        api_key=args.api_key,
        fs_div=fs_div,
        competitors=competitors,
        include_news=args.news,
        notes_dir=args.notes,
        saramin_url=args.saramin_url,
        include_quarterly=not args.no_quarterly,
        output_dir=args.output,
    )


if __name__ == "__main__":
    main()
