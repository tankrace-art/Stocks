"""Phase 2: 경쟁사 일괄 분석 및 비교

여러 기업을 동시에 수집하고, 주요 지표를 한 시트로 비교합니다.
"""

from __future__ import annotations

import time

import pandas as pd

from .annual_summary import _val, _pct
from .dart_client import DartClient


def collect_competitors(
    client: DartClient,
    companies: list[str],
    start_year: int,
    end_year: int,
    fs_div: str = "CFS",
    log_fn=None,
) -> dict[str, dict[str, pd.DataFrame]]:
    """여러 회사의 크로스 테이블을 일괄 수집

    Returns:
        {"삼성전자": {"재무상태표": df, "손익계산서": df, ...}, ...}
    """
    result = {}
    for name in companies:
        if log_fn:
            log_fn(f"[경쟁사] {name} 분석 시작")
        try:
            matches = client.search_corp(name)
            if not matches:
                if log_fn:
                    log_fn(f"  - {name} 찾을 수 없음")
                continue
            target = next((m for m in matches if m["corp_name"] == name), matches[0])
            cross = client.get_yearly_cross_data(
                target["corp_code"], start_year, end_year, fs_div, log_fn=log_fn
            )
            if cross:
                result[name] = cross
        except Exception as e:
            if log_fn:
                log_fn(f"  [오류] {name}: {e}")
        time.sleep(0.5)
    return result


def build_comparison_table(
    competitor_data: dict[str, dict[str, pd.DataFrame]],
    year: str,
) -> pd.DataFrame:
    """경쟁사 핵심 지표 비교 테이블

    행: 회사명 / 열: 매출액, 영업이익, OPM%, 순이익, ROE, 부채비율, 자본총계 ...
    """
    rows = []
    for company, cross in competitor_data.items():
        bs = cross.get("재무상태표")
        inc = cross.get("손익계산서")
        if inc is None or inc.empty:
            inc = cross.get("포괄손익계산서")

        rev = _val(inc, ["매출액", "수익(매출액)", "영업수익"], year)
        oi = _val(inc, ["영업이익", "영업이익(손실)"], year)
        ni = _val(inc, ["당기순이익", "당기순이익(손실)"], year)
        ta = _val(bs, ["자산총계"], year)
        debt = _val(bs, ["부채총계"], year)
        eq = _val(bs, ["자본총계"], year)

        rows.append({
            "회사명": company,
            "매출액": rev if rev is not None else "",
            "영업이익": oi if oi is not None else "",
            "OPM%": _pct(oi, rev),
            "당기순이익": ni if ni is not None else "",
            "NIM%": _pct(ni, rev),
            "ROE": _pct(ni, eq),
            "ROA": _pct(ni, ta),
            "부채비율": _pct(debt, eq),
            "자본총계": eq if eq is not None else "",
            "자산총계": ta if ta is not None else "",
        })

    return pd.DataFrame(rows)
