"""KRX 금시장 데이터 수집 CLI

사용법:
    python -m krx_gold.main                    # 오늘 전종목 시세
    python -m krx_gold.main --history 20240101  # 금 1kg 기간별 시세
    python -m krx_gold.main --days 30           # 최근 30일 시세
"""

import argparse
import os
import sys
from datetime import datetime, timedelta

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from krx_gold.scraper import (
    get_gold_daily,
    get_gold_price_history,
    _latest_biz_day,
)


GOLD_ITEMS = {
    "1kg": "KRD040200002",
    "100g": "KRD040200001",
    "10g": "KRD040200003",
}


def cmd_daily(args):
    """특정일 금 전종목 시세"""
    trd_dd = args.date or _latest_biz_day()
    print(f"\n[KRX 금시장] {trd_dd[:4]}-{trd_dd[4:6]}-{trd_dd[6:]} 전종목 시세")
    print("=" * 70)

    df = get_gold_daily(trd_dd)
    if df.empty:
        print("  데이터가 없습니다. 영업일을 확인해주세요.")
        return

    print(df.to_string(index=False))

    if args.output:
        _save(df, args.output, f"금_전종목_{trd_dd}")
        print(f"\n저장 완료: {args.output}")


def cmd_history(args):
    """기간별 시세 추이"""
    end_date = args.end or datetime.now().strftime("%Y%m%d")

    if args.days:
        start_date = (datetime.now() - timedelta(days=args.days)).strftime("%Y%m%d")
    elif args.start:
        start_date = args.start
    else:
        start_date = (datetime.now() - timedelta(days=90)).strftime("%Y%m%d")

    item = args.item or "1kg"
    isu_cd = GOLD_ITEMS.get(item, item)
    item_name = f"금 {item}" if item in GOLD_ITEMS else item

    print(f"\n[KRX 금시장] {item_name} 시세 추이")
    print(f"  기간: {start_date[:4]}-{start_date[4:6]}-{start_date[6:]} ~ "
          f"{end_date[:4]}-{end_date[4:6]}-{end_date[6:]}")
    print("=" * 70)

    df = get_gold_price_history(start_date, end_date, isu_cd)
    if df.empty:
        print("  데이터가 없습니다.")
        return

    print(df.to_string(index=False))

    # 간단 통계
    numeric_cols = df.select_dtypes(include="number").columns
    price_col = None
    for candidate in ["TDD_CLSPRC", "종가", "CLSPRC", "ClsPrc"]:
        if candidate in df.columns:
            price_col = candidate
            break
    if price_col is None and len(numeric_cols) > 0:
        price_col = numeric_cols[0]

    if price_col and len(df) > 1:
        prices = pd.to_numeric(df[price_col], errors="coerce").dropna()
        if len(prices) > 0:
            print(f"\n  --- 기간 통계 ---")
            print(f"  최고가: {prices.max():,.0f}원")
            print(f"  최저가: {prices.min():,.0f}원")
            print(f"  평균가: {prices.mean():,.0f}원")
            if prices.iloc[0] != 0:
                change = (prices.iloc[-1] - prices.iloc[0]) / prices.iloc[0] * 100
                print(f"  기간 수익률: {change:+.2f}%")

    if args.output:
        _save(df, args.output, f"금_{item}_{start_date}_{end_date}")
        print(f"\n저장 완료: {args.output}")


def _save(df: pd.DataFrame, path: str, sheet_name: str = "Sheet1"):
    """엑셀 또는 CSV로 저장"""
    if path.endswith(".xlsx"):
        df.to_excel(path, sheet_name=sheet_name[:31], index=False)
    else:
        df.to_csv(path, index=False, encoding="utf-8-sig")


def main():
    parser = argparse.ArgumentParser(
        description="KRX 금시장 데이터 자동 취득",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
사용 예시:
  python -m krx_gold.main                          # 오늘 전종목 시세
  python -m krx_gold.main --date 20250401           # 특정일 전종목
  python -m krx_gold.main history --days 30         # 최근 30일 금 1kg
  python -m krx_gold.main history --start 20240101  # 기간 지정
  python -m krx_gold.main history --item 100g       # 금 100g 시세
  python -m krx_gold.main history -o gold.xlsx      # 엑셀 저장
        """,
    )

    sub = parser.add_subparsers(dest="command")

    # daily (기본)
    p_daily = sub.add_parser("daily", help="특정일 전종목 시세")
    p_daily.add_argument("--date", "-d", help="조회일 (YYYYMMDD)")
    p_daily.add_argument("--output", "-o", help="저장 파일 (.xlsx 또는 .csv)")

    # history
    p_hist = sub.add_parser("history", help="기간별 시세 추이")
    p_hist.add_argument("--start", "-s", help="시작일 (YYYYMMDD)")
    p_hist.add_argument("--end", "-e", help="종료일 (YYYYMMDD)")
    p_hist.add_argument("--days", type=int, help="최근 N일")
    p_hist.add_argument("--item", choices=["1kg", "100g", "10g"], default="1kg",
                         help="종목 (기본: 1kg)")
    p_hist.add_argument("--output", "-o", help="저장 파일 (.xlsx 또는 .csv)")

    args = parser.parse_args()

    if args.command == "history":
        cmd_history(args)
    else:
        # 기본: daily
        if not hasattr(args, "date"):
            args.date = None
        if not hasattr(args, "output"):
            args.output = None
        cmd_daily(args)


if __name__ == "__main__":
    main()
