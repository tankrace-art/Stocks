"""KRX 금시장 데이터 수집 CLI

사용법:
    python -m krx_gold.main --key YOUR_API_KEY
    python -m krx_gold.main --key YOUR_API_KEY --date 20260401
    python -m krx_gold.main --key YOUR_API_KEY history --days 30
    python -m krx_gold.main --key YOUR_API_KEY history --days 30 --item 1Kg -o gold.xlsx
"""

import argparse
import os
import sys
from datetime import datetime, timedelta

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from krx_gold.scraper import get_gold_daily, get_gold_price_history, _latest_biz_day


def cmd_daily(args):
    trd_dd = args.date or _latest_biz_day()
    print(f"\n[KRX 금시장] {trd_dd[:4]}-{trd_dd[4:6]}-{trd_dd[6:]} 전종목 시세")
    print("=" * 70)

    df = get_gold_daily(trd_dd, api_key=args.key, log_fn=print)
    if df.empty:
        print("  데이터가 없습니다. 영업일을 확인해주세요.")
        return

    print()
    print(df.to_string(index=False))

    if args.output:
        _save(df, args.output, f"금_전종목_{trd_dd}")
        print(f"\n저장 완료: {args.output}")


def cmd_history(args):
    end_date = args.end or datetime.now().strftime("%Y%m%d")

    if args.days:
        start_date = (datetime.now() - timedelta(days=args.days)).strftime("%Y%m%d")
    elif args.start:
        start_date = args.start
    else:
        start_date = (datetime.now() - timedelta(days=90)).strftime("%Y%m%d")

    print(f"\n[KRX 금시장] 기간별 시세 추이")
    print(f"  기간: {start_date} ~ {end_date}")
    print("=" * 70)

    df = get_gold_price_history(
        start_date, end_date,
        api_key=args.key,
        item_filter=args.item,
        log_fn=print,
    )
    if df.empty:
        print("  데이터가 없습니다.")
        return

    print()
    print(df.to_string(index=False))

    # 통계
    for col in ["종가", "TDD_CLSPRC"]:
        if col in df.columns:
            prices = pd.to_numeric(df[col], errors="coerce").dropna()
            if len(prices) > 1:
                print(f"\n  --- 기간 통계 ---")
                print(f"  최고가: {prices.max():,.0f}")
                print(f"  최저가: {prices.min():,.0f}")
                print(f"  평균가: {prices.mean():,.0f}")
                if prices.iloc[0] != 0:
                    chg = (prices.iloc[-1] - prices.iloc[0]) / prices.iloc[0] * 100
                    print(f"  기간 수익률: {chg:+.2f}%")
            break

    if args.output:
        _save(df, args.output, f"금시세_{start_date}_{end_date}")
        print(f"\n저장 완료: {args.output}")


def _save(df, path, sheet):
    if path.endswith(".xlsx"):
        df.to_excel(path, sheet_name=sheet[:31], index=False)
    else:
        df.to_csv(path, index=False, encoding="utf-8-sig")


def main():
    parser = argparse.ArgumentParser(
        description="KRX 금시장 데이터 자동 취득 (KRX Open API)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
API 키 발급 방법:
  1. https://openapi.krx.co.kr 회원가입
  2. [마이페이지] → 인증키 신청
  3. [서비스 신청] → 일반상품 신청

사용 예시:
  python -m krx_gold.main --key MYKEY123
  python -m krx_gold.main --key MYKEY123 --date 20260401
  python -m krx_gold.main --key MYKEY123 history --days 30
  python -m krx_gold.main --key MYKEY123 history --item 1Kg -o gold.xlsx
        """,
    )
    parser.add_argument("--key", "-k", required=True, help="KRX Open API 인증키")

    sub = parser.add_subparsers(dest="command")

    p_daily = sub.add_parser("daily", help="특정일 전종목 시세")
    p_daily.add_argument("--date", "-d", help="조회일 (YYYYMMDD)")
    p_daily.add_argument("--output", "-o", help="저장 파일 (.xlsx/.csv)")

    p_hist = sub.add_parser("history", help="기간별 시세 추이")
    p_hist.add_argument("--start", "-s", help="시작일 (YYYYMMDD)")
    p_hist.add_argument("--end", "-e", help="종료일 (YYYYMMDD)")
    p_hist.add_argument("--days", type=int, help="최근 N일")
    p_hist.add_argument("--item", help="종목 필터 (예: 1Kg, 100g, 10g)")
    p_hist.add_argument("--output", "-o", help="저장 파일 (.xlsx/.csv)")

    args = parser.parse_args()

    if args.command == "history":
        cmd_history(args)
    else:
        if not hasattr(args, "date"):
            args.date = None
        if not hasattr(args, "output"):
            args.output = None
        cmd_daily(args)


if __name__ == "__main__":
    main()
