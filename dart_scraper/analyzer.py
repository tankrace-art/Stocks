"""투자 분석 모듈

재무제표 크로스 테이블에서 핵심 투자지표를 계산합니다.
- 수익성: 영업이익률, 순이익률, ROE, ROA
- 안정성: 부채비율, 유동비율, 이자보상배율
- 성장성: 매출성장률, 영업이익성장률, 자산성장률
- 현금흐름: FCF, 영업CF/매출 비율
"""

import pandas as pd
import numpy as np


def _safe_int(val) -> int | None:
    """문자열 금액을 정수로 변환. 실패 시 None"""
    if val is None or val == "" or (isinstance(val, float) and np.isnan(val)):
        return None
    try:
        return int(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _find_account(cross_df: pd.DataFrame, keywords: list[str], year: str) -> int | None:
    """크로스 테이블에서 키워드에 매칭되는 계정의 특정 연도 값 반환"""
    if cross_df is None or cross_df.empty or "계정과목" not in cross_df.columns:
        return None
    if year not in cross_df.columns:
        return None

    for _, row in cross_df.iterrows():
        account_nm = str(row["계정과목"]).strip()
        for kw in keywords:
            if kw == account_nm or kw in account_nm:
                return _safe_int(row[year])
    return None


def _pct(numerator, denominator) -> str:
    """백분율 계산 → 문자열 반환"""
    if numerator is None or denominator is None or denominator == 0:
        return "-"
    return f"{(numerator / denominator) * 100:.1f}%"


def _growth(current, previous) -> str:
    """성장률 계산 → 문자열 반환"""
    if current is None or previous is None or previous == 0:
        return "-"
    return f"{((current - previous) / abs(previous)) * 100:.1f}%"


def _format_억(val) -> str:
    """원 단위 → 억 단위 문자열"""
    if val is None:
        return "-"
    억 = val / 100_000_000
    if abs(억) >= 1:
        return f"{억:,.0f}억"
    만 = val / 10_000
    return f"{만:,.0f}만"


def calculate_investment_metrics(
    cross_tables: dict[str, pd.DataFrame],
    start_year: int,
    end_year: int,
) -> pd.DataFrame:
    """핵심 투자지표 계산

    Args:
        cross_tables: get_yearly_cross_data()의 반환값
        start_year, end_year: 분석 기간

    Returns:
        투자지표 요약 DataFrame (지표명 | 2020 | 2021 | ... | 2024)
    """
    bs = cross_tables.get("재무상태표")
    # 손익계산서 또는 포괄손익계산서 사용
    inc = cross_tables.get("손익계산서") or cross_tables.get("포괄손익계산서")
    cf = cross_tables.get("현금흐름표")

    years = [str(y) for y in range(start_year, end_year + 1)]
    metrics = []

    # ── 규모 지표 ──
    metrics.append(_metric_row("【규모】", years))
    metrics.append(_account_row("총자산", bs, ["자산총계"], years))
    metrics.append(_account_row("총부채", bs, ["부채총계"], years))
    metrics.append(_account_row("자본총계", bs, ["자본총계"], years))
    metrics.append(_account_row("매출액", inc, ["매출액", "수익(매출액)", "영업수익"], years))
    metrics.append(_account_row("영업이익", inc, ["영업이익", "영업이익(손실)"], years))
    metrics.append(_account_row("당기순이익", inc, ["당기순이익", "당기순이익(손실)"], years))
    metrics.append(_account_row("영업활동CF", cf, ["영업활동현금흐름", "영업활동 현금흐름"], years))

    # ── 수익성 지표 ──
    metrics.append(_metric_row("【수익성】", years))

    # 영업이익률 = 영업이익 / 매출액
    row = {"지표": "영업이익률"}
    for y in years:
        oi = _find_account(inc, ["영업이익", "영업이익(손실)"], y)
        rev = _find_account(inc, ["매출액", "수익(매출액)", "영업수익"], y)
        row[y] = _pct(oi, rev)
    metrics.append(row)

    # 순이익률 = 당기순이익 / 매출액
    row = {"지표": "순이익률"}
    for y in years:
        ni = _find_account(inc, ["당기순이익", "당기순이익(손실)"], y)
        rev = _find_account(inc, ["매출액", "수익(매출액)", "영업수익"], y)
        row[y] = _pct(ni, rev)
    metrics.append(row)

    # ROE = 당기순이익 / 자본총계
    row = {"지표": "ROE (자기자본이익률)"}
    for y in years:
        ni = _find_account(inc, ["당기순이익", "당기순이익(손실)"], y)
        eq = _find_account(bs, ["자본총계"], y)
        row[y] = _pct(ni, eq)
    metrics.append(row)

    # ROA = 당기순이익 / 자산총계
    row = {"지표": "ROA (총자산이익률)"}
    for y in years:
        ni = _find_account(inc, ["당기순이익", "당기순이익(손실)"], y)
        ta = _find_account(bs, ["자산총계"], y)
        row[y] = _pct(ni, ta)
    metrics.append(row)

    # ── 안정성 지표 ──
    metrics.append(_metric_row("【안정성】", years))

    # 부채비율 = 부채총계 / 자본총계
    row = {"지표": "부채비율"}
    for y in years:
        debt = _find_account(bs, ["부채총계"], y)
        eq = _find_account(bs, ["자본총계"], y)
        row[y] = _pct(debt, eq)
    metrics.append(row)

    # 유동비율 = 유동자산 / 유동부채
    row = {"지표": "유동비율"}
    for y in years:
        ca = _find_account(bs, ["유동자산"], y)
        cl = _find_account(bs, ["유동부채"], y)
        row[y] = _pct(ca, cl)
    metrics.append(row)

    # 자기자본비율 = 자본총계 / 자산총계
    row = {"지표": "자기자본비율"}
    for y in years:
        eq = _find_account(bs, ["자본총계"], y)
        ta = _find_account(bs, ["자산총계"], y)
        row[y] = _pct(eq, ta)
    metrics.append(row)

    # ── 성장성 지표 ──
    metrics.append(_metric_row("【성장성】", years))

    # 매출성장률
    row = {"지표": "매출성장률"}
    for i, y in enumerate(years):
        if i == 0:
            row[y] = "-"
            continue
        cur = _find_account(inc, ["매출액", "수익(매출액)", "영업수익"], y)
        prev = _find_account(inc, ["매출액", "수익(매출액)", "영업수익"], years[i - 1])
        row[y] = _growth(cur, prev)
    metrics.append(row)

    # 영업이익성장률
    row = {"지표": "영업이익성장률"}
    for i, y in enumerate(years):
        if i == 0:
            row[y] = "-"
            continue
        cur = _find_account(inc, ["영업이익", "영업이익(손실)"], y)
        prev = _find_account(inc, ["영업이익", "영업이익(손실)"], years[i - 1])
        row[y] = _growth(cur, prev)
    metrics.append(row)

    # 자산성장률
    row = {"지표": "자산성장률"}
    for i, y in enumerate(years):
        if i == 0:
            row[y] = "-"
            continue
        cur = _find_account(bs, ["자산총계"], y)
        prev = _find_account(bs, ["자산총계"], years[i - 1])
        row[y] = _growth(cur, prev)
    metrics.append(row)

    # ── 현금흐름 ──
    metrics.append(_metric_row("【현금흐름】", years))

    metrics.append(_account_row(
        "영업활동CF", cf, ["영업활동현금흐름", "영업활동 현금흐름"], years
    ))
    metrics.append(_account_row(
        "투자활동CF", cf, ["투자활동현금흐름", "투자활동 현금흐름"], years
    ))
    metrics.append(_account_row(
        "재무활동CF", cf, ["재무활동현금흐름", "재무활동 현금흐름"], years
    ))

    # FCF = 영업활동CF + 투자활동CF (간이 계산)
    row = {"지표": "FCF (잉여현금흐름)"}
    for y in years:
        op_cf = _find_account(cf, ["영업활동현금흐름", "영업활동 현금흐름"], y)
        inv_cf = _find_account(cf, ["투자활동현금흐름", "투자활동 현금흐름"], y)
        if op_cf is not None and inv_cf is not None:
            row[y] = _format_억(op_cf + inv_cf)
        else:
            row[y] = "-"
    metrics.append(row)

    # 영업CF / 매출액
    row = {"지표": "영업CF/매출액"}
    for y in years:
        op_cf = _find_account(cf, ["영업활동현금흐름", "영업활동 현금흐름"], y)
        rev = _find_account(inc, ["매출액", "수익(매출액)", "영업수익"], y)
        row[y] = _pct(op_cf, rev)
    metrics.append(row)

    return pd.DataFrame(metrics)


def build_clean_statement(
    cross_df: pd.DataFrame,
    stmt_type: str,
) -> pd.DataFrame:
    """크로스 테이블의 금액을 억 단위로 변환하여 읽기 쉽게 정리"""
    if cross_df is None or cross_df.empty:
        return pd.DataFrame()

    result = cross_df.copy()
    year_cols = [c for c in result.columns if c != "계정과목"]

    for col in year_cols:
        result[col] = result[col].apply(lambda x: _format_억(_safe_int(x)))

    return result


def _metric_row(label: str, years: list[str]) -> dict:
    """구분선 역할의 섹션 헤더 행"""
    row = {"지표": label}
    for y in years:
        row[y] = ""
    return row


def _account_row(
    label: str,
    cross_df: pd.DataFrame | None,
    keywords: list[str],
    years: list[str],
) -> dict:
    """계정과목 값을 억 단위로 변환한 행"""
    row = {"지표": label}
    for y in years:
        val = _find_account(cross_df, keywords, y)
        row[y] = _format_억(val)
    return row
