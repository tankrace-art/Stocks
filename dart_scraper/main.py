"""DART 전자공시시스템 재무데이터 스크래퍼 - CLI 메인

사용법:
    python -m dart_scraper.main --company "삼성전자" --period "2020-2024"
    python -m dart_scraper.main --company "SK하이닉스" --period "2023 분기"
    python -m dart_scraper.main --company "삼성전자" --period "2022-2024" --save excel
"""

import argparse
import sys

import pandas as pd

from .config import DART_API_KEY
from .dart_client import DartClient
from .report_parser import ReportParser
from .utils import (
    format_amount,
    parse_period,
    print_table,
    save_to_excel,
    save_to_csv,
)


def print_header(text: str):
    print(f"\n{'#'*70}")
    print(f"  {text}")
    print(f"{'#'*70}")


def print_section(text: str):
    print(f"\n{'─'*60}")
    print(f"  {text}")
    print(f"{'─'*60}")


def run_analysis(
    company_name: str,
    period: str,
    api_key: str = "",
    fs_div: str = "CFS",
    save_format: str = "",
    include_business: bool = True,
):
    """기업 재무 분석 실행

    Args:
        company_name: 기업명 (예: "삼성전자")
        period: 분석기간 (예: "2020-2024", "2023 분기")
        api_key: DART API 키 (없으면 환경변수 사용)
        fs_div: CFS(연결) 또는 OFS(개별)
        save_format: 저장 형식 ("excel", "csv", "" 미저장)
        include_business: 사업내용 분석 포함 여부
    """
    # 초기화
    client = DartClient(api_key)
    parser = ReportParser(client)

    # 기간 파싱
    start_year, end_year, report_types = parse_period(period)

    print_header(f"{company_name} 재무 분석")
    print(f"  분석기간: {start_year}년 ~ {end_year}년")
    print(f"  보고서: {', '.join(report_types)}")
    print(f"  재무제표: {'연결' if fs_div == 'CFS' else '개별'}")

    # ── 1. 기업 검색 ──────────────────────────────────────────
    print_section("1. 기업 검색")
    try:
        matches = client.search_corp(company_name)
    except Exception as e:
        print(f"  [오류] 기업 목록 로딩 실패: {e}")
        return

    if not matches:
        print(f"  [오류] '{company_name}' 기업을 찾을 수 없습니다.")
        return

    # 정확 매칭 우선
    target = None
    for m in matches:
        if m["corp_name"] == company_name:
            target = m
            break
    if not target:
        target = matches[0]

    corp_code = target["corp_code"]
    print(f"  기업명: {target['corp_name']}")
    print(f"  고유번호: {corp_code}")
    print(f"  종목코드: {target['stock_code'] or '(비상장)'}")

    if len(matches) > 1:
        print(f"\n  * 유사 검색 결과 ({len(matches)}건):")
        for m in matches[:5]:
            stock = m['stock_code'] or '비상장'
            print(f"    - {m['corp_name']} ({stock})")

    # ── 2. 기업 개황 ──────────────────────────────────────────
    print_section("2. 기업 개황")
    info = client.get_company_info(corp_code)
    if info:
        fields = [
            ("회사명", "corp_name"),
            ("영문명", "corp_name_eng"),
            ("종목코드", "stock_code"),
            ("대표자", "ceo_nm"),
            ("법인구분", "corp_cls"),
            ("업종코드", "induty_code"),
            ("설립일", "est_dt"),
            ("결산월", "acc_mt"),
            ("홈페이지", "hm_url"),
            ("주소", "adres"),
        ]
        for label, key in fields:
            val = info.get(key, "")
            if val:
                print(f"  {label}: {val}")

    # ── 3. 재무제표 ──────────────────────────────────────────
    print_section("3. 재무제표 조회")
    all_excel_data = {}

    financial_data = client.get_multi_year_financials(
        corp_code, start_year, end_year, report_types, fs_div
    )

    if not financial_data:
        print("  [!] 조회된 재무제표가 없습니다.")
    else:
        for period_key, statements in financial_data.items():
            print(f"\n  ▶ {period_key}")
            for stmt_name, df in statements.items():
                # 주요 계정만 추출하여 표시
                display_df = _extract_key_accounts(df, stmt_name)
                if not display_df.empty:
                    print_table(display_df, f"{period_key} - {stmt_name}")
                    all_excel_data[f"{period_key}_{stmt_name}"] = df

    # ── 4. 사업내용 분석 ─────────────────────────────────────
    if include_business:
        print_section("4. 사업내용 분석 (사업보고서)")

        for year in range(start_year, end_year + 1):
            print(f"\n  ▶ {year}년 사업보고서")
            sections = parser.parse_business_content(corp_code, year)

            if not sections:
                print("    (사업보고서 데이터를 찾을 수 없습니다)")
                continue

            for section_name, tables in sections.items():
                print(f"\n    [{section_name}]")
                for i, df in enumerate(tables):
                    if not df.empty:
                        print_table(df, f"{year}년 - {section_name}")
                        key = f"{year}년_{section_name}"
                        if i > 0:
                            key += f"_{i+1}"
                        all_excel_data[key] = df

    # ── 5. 저장 ──────────────────────────────────────────────
    if save_format and all_excel_data:
        print_section("5. 데이터 저장")
        safe_name = company_name.replace(" ", "_")

        if save_format == "excel":
            filename = f"{safe_name}_{start_year}-{end_year}_재무분석.xlsx"
            save_to_excel(all_excel_data, filename)
        elif save_format == "csv":
            save_to_csv(all_excel_data, f"{safe_name}_{start_year}-{end_year}")

    print(f"\n{'='*70}")
    print("  분석 완료!")
    print(f"{'='*70}\n")


def _extract_key_accounts(df: pd.DataFrame, stmt_type: str) -> pd.DataFrame:
    """주요 계정과목만 추출하여 요약 DataFrame 반환"""
    if df.empty or "account_nm" not in df.columns:
        return df

    key_accounts = {
        "재무상태표": [
            "자산총계", "유동자산", "비유동자산",
            "부채총계", "유동부채", "비유동부채",
            "자본총계", "이익잉여금",
        ],
        "손익계산서": [
            "수익(매출액)", "매출액", "매출원가", "매출총이익",
            "판매비와관리비", "영업이익", "영업이익(손실)",
            "법인세비용차감전순이익", "당기순이익", "당기순이익(손실)",
        ],
        "포괄손익계산서": [
            "수익(매출액)", "매출액", "매출원가", "매출총이익",
            "판매비와관리비", "영업이익", "영업이익(손실)",
            "당기순이익", "당기순이익(손실)", "총포괄손익",
        ],
        "현금흐름표": [
            "영업활동현금흐름", "투자활동현금흐름", "재무활동현금흐름",
            "현금및현금성자산의순증가", "기초현금및현금성자산",
            "기말현금및현금성자산",
        ],
    }

    accounts = key_accounts.get(stmt_type, [])
    if not accounts:
        return df.head(15)

    mask = df["account_nm"].apply(
        lambda x: any(acc in str(x) for acc in accounts)
    )
    result = df[mask].copy()

    if result.empty:
        return df.head(10)

    # 금액 포맷팅
    amount_cols = [c for c in result.columns if "amount" in c]
    display = result[["account_nm"] + amount_cols].copy()
    for col in amount_cols:
        display[col] = display[col].apply(format_amount)

    return display


def main():
    argparser = argparse.ArgumentParser(
        description="DART 전자공시시스템 재무데이터 스크래퍼",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
사용 예시:
  python -m dart_scraper.main --company "삼성전자" --period "2023"
  python -m dart_scraper.main --company "SK하이닉스" --period "2020-2024"
  python -m dart_scraper.main --company "LG에너지솔루션" --period "2023 분기"
  python -m dart_scraper.main --company "삼성전자" --period "2022-2024" --save excel
  python -m dart_scraper.main --company "현대자동차" --period "2023" --fs 개별
        """,
    )
    argparser.add_argument(
        "--company", "-c",
        required=True,
        help='기업명 (예: "삼성전자")',
    )
    argparser.add_argument(
        "--period", "-p",
        required=True,
        help='분석기간 (예: "2023", "2020-2024", "2023 분기")',
    )
    argparser.add_argument(
        "--api-key", "-k",
        default="",
        help="DART API 키 (미지정시 환경변수 DART_API_KEY 사용)",
    )
    argparser.add_argument(
        "--fs",
        choices=["연결", "개별"],
        default="연결",
        help="재무제표 구분 (기본: 연결)",
    )
    argparser.add_argument(
        "--save", "-s",
        choices=["excel", "csv"],
        default="",
        help="결과 저장 형식",
    )
    argparser.add_argument(
        "--no-business",
        action="store_true",
        help="사업내용 분석 제외",
    )

    args = argparser.parse_args()

    fs_div = "CFS" if args.fs == "연결" else "OFS"

    run_analysis(
        company_name=args.company,
        period=args.period,
        api_key=args.api_key,
        fs_div=fs_div,
        save_format=args.save,
        include_business=not args.no_business,
    )


if __name__ == "__main__":
    main()
