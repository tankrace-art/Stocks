"""분기별 재무제표 수집 및 단일 분기 값 계산

DART API는 누적값(1Q, 1Q+2Q, 1Q+2Q+3Q, 연간)만 제공하므로
단일 분기 값은 차감 계산으로 산출합니다.
  Q1 = 1분기
  Q2 = 반기 - 1분기
  Q3 = 3분기 - 반기
  Q4 = 사업보고서 - 3분기

재무상태표(BS) 항목은 기말잔액이므로 차감 없이 그대로 사용합니다.
"""

from __future__ import annotations

import time
from typing import Iterable

import pandas as pd

from .dart_client import DartClient


# DART 분기 보고서 코드 순서
QUARTER_REPORTS = [
    ("Q1", "1분기"),       # 누적: Q1
    ("Q2", "반기"),        # 누적: Q1+Q2
    ("Q3", "3분기"),       # 누적: Q1+Q2+Q3
    ("Q4", "사업보고서"),  # 누적: 연간
]


def _to_int(val) -> int | None:
    if val is None or val == "":
        return None
    try:
        return int(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def collect_quarterly_statements(
    client: DartClient,
    corp_code: str,
    start_year: int,
    end_year: int,
    fs_div: str = "CFS",
    log_fn=None,
) -> dict[str, pd.DataFrame]:
    """분기별 크로스 테이블 생성

    Returns:
        {"재무상태표": DataFrame, "손익계산서": DataFrame, "현금흐름표": DataFrame}
        각 DataFrame 열: [계정과목, 1Q23, 2Q23, 3Q23, 4Q23, 1Q24, ...]
    """
    # 연도·분기별 누적 데이터 수집
    cumulative: dict[tuple[int, str], dict[str, pd.DataFrame]] = {}

    for year in range(start_year, end_year + 1):
        for qkey, report_type in QUARTER_REPORTS:
            if log_fn:
                log_fn(f"  {year}년 {report_type} 조회 중...")
            statements = client.get_financial_by_type(
                corp_code, year, report_type, fs_div
            )
            if statements:
                cumulative[(year, qkey)] = statements
            time.sleep(0.5)

    if not cumulative:
        return {}

    stmt_types = set()
    for sd in cumulative.values():
        stmt_types.update(sd.keys())

    quarter_columns = []
    for year in range(start_year, end_year + 1):
        yy = str(year)[-2:]
        for qkey, _ in QUARTER_REPORTS:
            quarter_columns.append(f"{qkey[-1]}Q{yy}")  # 예: "1Q23"

    result: dict[str, pd.DataFrame] = {}
    for stmt_type in stmt_types:
        df = _build_quarterly_cross(
            cumulative, stmt_type, start_year, end_year, quarter_columns
        )
        if not df.empty:
            result[stmt_type] = df
    return result


def _build_quarterly_cross(
    cumulative: dict[tuple[int, str], dict[str, pd.DataFrame]],
    stmt_type: str,
    start_year: int,
    end_year: int,
    quarter_columns: list[str],
) -> pd.DataFrame:
    """분기별 단일 분기 값으로 크로스 테이블 구성"""
    # 계정과목 순서 수집
    account_order: dict[str, float] = {}
    for (year, qkey), sd in cumulative.items():
        if stmt_type not in sd:
            continue
        df = sd[stmt_type]
        for _, row in df.iterrows():
            nm = str(row.get("account_nm", "")).strip()
            if not nm:
                continue
            ord_val = row.get("ord", 999)
            try:
                ord_val = float(ord_val) if ord_val != "" else 999
            except (ValueError, TypeError):
                ord_val = 999
            if nm not in account_order or ord_val < account_order[nm]:
                account_order[nm] = ord_val

    if not account_order:
        return pd.DataFrame()

    sorted_accounts = sorted(account_order.items(), key=lambda x: x[1])
    account_names = [a[0] for a in sorted_accounts]

    is_bs = stmt_type == "재무상태표"
    data = {"계정과목": account_names}

    for year in range(start_year, end_year + 1):
        yy = str(year)[-2:]
        cum: dict[str, dict[str, int | None]] = {}

        for qkey, _ in QUARTER_REPORTS:
            amounts: dict[str, int | None] = {nm: None for nm in account_names}
            sd = cumulative.get((year, qkey))
            if sd and stmt_type in sd:
                df = sd[stmt_type]
                for _, row in df.iterrows():
                    nm = str(row.get("account_nm", "")).strip()
                    if nm in amounts:
                        amounts[nm] = _to_int(row.get("thstrm_amount", ""))
            cum[qkey] = amounts

        for qkey, _ in QUARTER_REPORTS:
            col_name = f"{qkey[-1]}Q{yy}"
            values = []
            for nm in account_names:
                cur = cum[qkey].get(nm)
                if is_bs:
                    values.append(cur if cur is not None else "")
                    continue
                # IS/CF: 차감 계산
                if qkey == "Q1":
                    prev = None
                elif qkey == "Q2":
                    prev = cum["Q1"].get(nm)
                elif qkey == "Q3":
                    prev = cum["Q2"].get(nm)
                else:  # Q4
                    prev = cum["Q3"].get(nm)

                if cur is None:
                    values.append("")
                elif prev is None:
                    values.append(cur)
                else:
                    values.append(cur - prev)
            data[col_name] = values

    return pd.DataFrame(data)


def extract_quarterly_summary(
    quarterly_tables: dict[str, pd.DataFrame],
    quarter_columns: Iterable[str],
) -> pd.DataFrame:
    """분기별 핵심 요약 (사용자 엑셀 포맷)

    행: 매출액, 매출원가, 매출원가율(%), 판매비와관리비, 판매비와관리비율(%),
        영업이익(손실), OPM%, 당기순이익(손실), NIM%, 재고자산
    """
    is_df = quarterly_tables.get("손익계산서")
    if is_df is None or is_df.empty:
        is_df = quarterly_tables.get("포괄손익계산서")
    bs_df = quarterly_tables.get("재무상태표")
    cols = list(quarter_columns)

    def _val(df, keywords, col):
        if df is None or df.empty or "계정과목" not in df.columns or col not in df.columns:
            return None
        for _, row in df.iterrows():
            nm = str(row["계정과목"]).strip()
            for kw in keywords:
                if kw == nm or kw in nm:
                    return _to_int(row[col])
        return None

    def _pct(num, den):
        if num is None or den is None or den == 0:
            return "-"
        return f"{(num / den) * 100:.0f}%"

    rows = []

    labels_is = [
        ("매출액", ["매출액", "수익(매출액)", "영업수익"]),
        ("매출원가", ["매출원가"]),
    ]
    for label, kws in labels_is:
        row = {"지표": label}
        for c in cols:
            v = _val(is_df, kws, c)
            row[c] = v if v is not None else ""
        rows.append(row)

    # 매출원가율
    row = {"지표": "매출원가율(%)"}
    for c in cols:
        cost = _val(is_df, ["매출원가"], c)
        rev = _val(is_df, ["매출액", "수익(매출액)", "영업수익"], c)
        row[c] = _pct(cost, rev)
    rows.append(row)

    # 판관비
    row = {"지표": "판매비와관리비"}
    for c in cols:
        v = _val(is_df, ["판매비와관리비", "판매비와 관리비"], c)
        row[c] = v if v is not None else ""
    rows.append(row)

    # 판관비율
    row = {"지표": "판매비와관리비율(%)"}
    for c in cols:
        sga = _val(is_df, ["판매비와관리비", "판매비와 관리비"], c)
        rev = _val(is_df, ["매출액", "수익(매출액)", "영업수익"], c)
        row[c] = _pct(sga, rev)
    rows.append(row)

    # 영업이익
    row = {"지표": "영업이익(손실)"}
    for c in cols:
        v = _val(is_df, ["영업이익", "영업이익(손실)"], c)
        row[c] = v if v is not None else ""
    rows.append(row)

    # OPM%
    row = {"지표": "OPM%"}
    for c in cols:
        oi = _val(is_df, ["영업이익", "영업이익(손실)"], c)
        rev = _val(is_df, ["매출액", "수익(매출액)", "영업수익"], c)
        row[c] = _pct(oi, rev)
    rows.append(row)

    # 순이익
    row = {"지표": "당기순이익(손실)"}
    for c in cols:
        v = _val(is_df, ["당기순이익", "당기순이익(손실)"], c)
        row[c] = v if v is not None else ""
    rows.append(row)

    # NIM%
    row = {"지표": "NIM%"}
    for c in cols:
        ni = _val(is_df, ["당기순이익", "당기순이익(손실)"], c)
        rev = _val(is_df, ["매출액", "수익(매출액)", "영업수익"], c)
        row[c] = _pct(ni, rev)
    rows.append(row)

    # 재고자산
    row = {"지표": "재고자산"}
    for c in cols:
        v = _val(bs_df, ["재고자산"], c)
        row[c] = v if v is not None else ""
    rows.append(row)

    return pd.DataFrame(rows)
