"""유틸리티 함수"""

import os
import re

import pandas as pd
from tabulate import tabulate


def format_amount(amount_str: str) -> str:
    """금액 문자열을 읽기 쉬운 형태로 변환 (억 원 단위)"""
    if not amount_str or amount_str == "-":
        return "-"
    try:
        amount = int(amount_str.replace(",", ""))
        if abs(amount) >= 100_000_000:
            return f"{amount / 100_000_000:,.1f}억"
        elif abs(amount) >= 10_000:
            return f"{amount / 10_000:,.0f}만"
        return f"{amount:,}"
    except (ValueError, AttributeError):
        return str(amount_str)


def print_table(df: pd.DataFrame, title: str = ""):
    """DataFrame을 보기 좋게 출력"""
    if title:
        print(f"\n{'='*60}")
        print(f"  {title}")
        print(f"{'='*60}")

    if df.empty:
        print("  (데이터 없음)")
        return

    print(tabulate(df, headers="keys", tablefmt="grid", showindex=False))


def save_to_excel(
    data: dict[str, pd.DataFrame],
    filename: str,
    output_dir: str = "output",
):
    """데이터를 Excel 파일로 저장"""
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, filename)

    with pd.ExcelWriter(filepath, engine="openpyxl") as writer:
        for sheet_name, df in data.items():
            # 시트 이름 길이 제한 (31자)
            safe_name = sheet_name[:31]
            # 시트 이름에 사용 불가한 문자 제거
            safe_name = re.sub(r'[\\/*?\[\]:]', '_', safe_name)
            df.to_excel(writer, sheet_name=safe_name, index=False)

    print(f"\n  [저장완료] {filepath}")
    return filepath


def save_to_csv(
    data: dict[str, pd.DataFrame],
    prefix: str,
    output_dir: str = "output",
):
    """데이터를 CSV 파일들로 저장"""
    os.makedirs(output_dir, exist_ok=True)
    saved = []
    for name, df in data.items():
        safe_name = re.sub(r'[\\/*?\[\]:\s]', '_', name)
        filepath = os.path.join(output_dir, f"{prefix}_{safe_name}.csv")
        df.to_csv(filepath, index=False, encoding="utf-8-sig")
        saved.append(filepath)

    if saved:
        print(f"\n  [저장완료] {len(saved)}개 CSV 파일 → {output_dir}/")
    return saved


def parse_period(period_str: str) -> tuple[int, int, list[str]]:
    """기간 문자열 파싱

    지원 형식:
        "2023" → (2023, 2023, ["사업보고서"])
        "2020-2023" → (2020, 2023, ["사업보고서"])
        "2023 분기" → (2023, 2023, ["1분기", "반기", "3분기", "사업보고서"])
        "2020-2023 분기" → (2020, 2023, ["1분기", "반기", "3분기", "사업보고서"])

    Returns:
        (시작연도, 종료연도, 보고서유형 리스트)
    """
    period_str = period_str.strip()
    quarterly = False

    if "분기" in period_str:
        quarterly = True
        period_str = period_str.replace("분기", "").strip()

    # 연도 범위 파싱
    match = re.match(r"(\d{4})\s*[-~]\s*(\d{4})", period_str)
    if match:
        start_year = int(match.group(1))
        end_year = int(match.group(2))
    else:
        match = re.match(r"(\d{4})", period_str)
        if match:
            start_year = end_year = int(match.group(1))
        else:
            raise ValueError(
                f"기간 형식을 인식할 수 없습니다: '{period_str}'\n"
                "예시: '2023', '2020-2023', '2023 분기', '2020-2023 분기'"
            )

    if quarterly:
        report_types = ["1분기", "반기", "3분기", "사업보고서"]
    else:
        report_types = ["사업보고서"]

    return start_year, end_year, report_types
