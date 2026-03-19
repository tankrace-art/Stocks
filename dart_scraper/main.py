"""DART 재무분석 투자도구 - CLI 메인

사용법:
    python -m dart_scraper.main --company "삼성전자" --period "2020-2024"
    python -m dart_scraper.main --company "SK하이닉스" --period "2022-2024" --no-business
"""

import argparse
import os
import sys
from datetime import datetime

import pandas as pd

from .config import DART_API_KEY
from .dart_client import DartClient
from .report_parser import ReportParser
from .analyzer import calculate_investment_metrics, build_clean_statement
from .utils import parse_period, save_investment_excel


def _log(msg: str):
    print(msg)


def run_analysis(
    company_name: str,
    period: str,
    api_key: str = "",
    fs_div: str = "CFS",
    include_business: bool = True,
    output_dir: str = "",
):
    """기업 투자분석 실행"""
    client = DartClient(api_key)
    parser = ReportParser(client)

    start_year, end_year, _ = parse_period(period)

    print(f"\n{'#' * 60}")
    print(f"  {company_name} 투자분석")
    print(f"  기간: {start_year}~{end_year}년 | {'연결' if fs_div == 'CFS' else '개별'}재무제표")
    print(f"{'#' * 60}")

    # ── 1. 기업 검색 ──
    print("\n[1/5] 기업 검색 중...")
    matches = client.search_corp(company_name)
    if not matches:
        print(f"  [오류] '{company_name}' 기업을 찾을 수 없습니다.")
        return

    target = None
    for m in matches:
        if m["corp_name"] == company_name:
            target = m
            break
    if not target:
        target = matches[0]

    corp_code = target["corp_code"]
    print(f"  기업명: {target['corp_name']}")
    print(f"  종목코드: {target['stock_code'] or '(비상장)'}")

    # ── 2. 기업 개황 ──
    print("\n[2/5] 기업 정보 조회 중...")
    company_info = client.get_company_info(corp_code)
    if company_info:
        for label, key in [
            ("대표자", "ceo_nm"), ("업종", "induty_code"),
            ("설립일", "est_dt"), ("홈페이지", "hm_url"),
        ]:
            val = company_info.get(key, "")
            if val:
                print(f"  {label}: {val}")

    # ── 3. 재무제표 크로스 테이블 ──
    print("\n[3/5] 재무제표 연도별 크로스 비교 테이블 생성 중...")
    cross_tables = client.get_yearly_cross_data(
        corp_code, start_year, end_year, fs_div, log_fn=_log
    )

    if cross_tables:
        for stmt_name, df in cross_tables.items():
            print(f"  → {stmt_name}: {len(df)}개 계정과목")
    else:
        print("  [!] 재무제표 데이터가 없습니다.")

    # ── 4. 투자지표 ──
    print("\n[4/5] 핵심 투자지표 계산 중...")
    metrics_df = None
    if cross_tables:
        metrics_df = calculate_investment_metrics(
            cross_tables, start_year, end_year
        )
        # 터미널에 주요 지표 출력
        print(f"\n{'─' * 60}")
        print(f"  핵심 투자지표 요약")
        print(f"{'─' * 60}")
        if metrics_df is not None:
            print(metrics_df.to_string(index=False))

    # ── 5. 사업내용 ──
    business_data = {}
    if include_business:
        print(f"\n[5/5] 사업보고서 핵심 데이터 추출 중...")
        business_data = parser.get_yearly_business_data(
            corp_code, start_year, end_year, log_fn=_log
        )
    else:
        print("\n[5/5] 사업보고서 분석 건너뜀")

    # ── 엑셀 저장 ──
    if not cross_tables and not business_data:
        print("\n[결과] 저장할 데이터가 없습니다.")
        return

    if not output_dir:
        output_dir = os.path.join(os.getcwd(), "output")
    os.makedirs(output_dir, exist_ok=True)

    safe_name = company_name.replace(" ", "_")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{safe_name}_{start_year}-{end_year}_투자분석_{timestamp}.xlsx"
    filepath = os.path.join(output_dir, filename)

    clean_tables = {}
    for stmt_name, df in cross_tables.items():
        clean_tables[stmt_name] = build_clean_statement(df, stmt_name)

    save_investment_excel(
        filepath=filepath,
        company_name=company_name,
        company_info=company_info,
        metrics_df=metrics_df,
        cross_tables=clean_tables,
        business_data=business_data,
        start_year=start_year,
        end_year=end_year,
    )

    print(f"\n{'=' * 60}")
    print(f"  분석 완료! → {filepath}")
    print(f"{'=' * 60}\n")


def main():
    argparser = argparse.ArgumentParser(
        description="DART 재무분석 투자도구",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
사용 예시:
  python -m dart_scraper.main -c "삼성전자" -p "2020-2024"
  python -m dart_scraper.main -c "SK하이닉스" -p "2022-2024" --no-business
  python -m dart_scraper.main -c "현대자동차" -p "2023" --fs 개별
        """,
    )
    argparser.add_argument("--company", "-c", required=True, help='기업명 (예: "삼성전자")')
    argparser.add_argument("--period", "-p", required=True, help='분석기간 (예: "2020-2024")')
    argparser.add_argument("--api-key", "-k", default="", help="DART API 키")
    argparser.add_argument("--fs", choices=["연결", "개별"], default="연결", help="재무제표 구분")
    argparser.add_argument("--no-business", action="store_true", help="사업내용 분석 제외")
    argparser.add_argument("--output", "-o", default="", help="출력 디렉토리")

    args = argparser.parse_args()
    fs_div = "CFS" if args.fs == "연결" else "OFS"

    run_analysis(
        company_name=args.company,
        period=args.period,
        api_key=args.api_key,
        fs_div=fs_div,
        include_business=not args.no_business,
        output_dir=args.output,
    )


if __name__ == "__main__":
    main()
