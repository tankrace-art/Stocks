"""사업보고서 세부 파싱 - 사용자 엑셀 포맷용

기존 report_parser.py가 추출한 원본 테이블에서
사용자가 정리하는 구조(사업부문별 매출, 매입처, 판매채널)로 가공합니다.
"""

from __future__ import annotations

import re

import pandas as pd


def _is_number_like(s) -> bool:
    if s is None:
        return False
    text = str(s).strip().replace(",", "").replace(".", "")
    text = text.replace("-", "").replace("%", "").replace("(", "").replace(")", "")
    return bool(text) and text.isdigit()


def extract_segment_sales(
    business_data: dict[int, dict[str, list[pd.DataFrame]]],
) -> pd.DataFrame:
    """사업부문·브랜드별 매출 통합 테이블

    매출 실적 섹션에서 사업부문별/품목별 매출 정보를 추출해
    연도별로 묶어줍니다.
    """
    # {(사업부문, 품목): {연도: 금액}}
    combined: dict[tuple[str, str], dict[int, str]] = {}
    all_years = sorted(business_data.keys())

    for year, sections in business_data.items():
        tables = sections.get("매출_실적", [])
        for df in tables:
            if df.empty or len(df.columns) < 2:
                continue

            # 컬럼 구조 판별 - 첫 2~3개 컬럼이 문자열 라벨일 가능성 큼
            label_cols = []
            for col in df.columns:
                sample = df[col].dropna().head(3).astype(str).tolist()
                if not sample:
                    continue
                if all(not _is_number_like(s) for s in sample):
                    label_cols.append(col)
                else:
                    break

            if not label_cols:
                continue

            for _, row in df.iterrows():
                labels = tuple(str(row[c]).strip() for c in label_cols[:2])
                # 빈 라벨 제외
                if not any(labels):
                    continue
                if all(l in ("", "nan", "None", "합계") for l in labels):
                    continue
                # 가장 큰 숫자 값을 당기 매출로 취함
                max_val = None
                for c in df.columns:
                    if c in label_cols:
                        continue
                    v = row.get(c)
                    if v is None:
                        continue
                    try:
                        n = int(str(v).replace(",", "").replace("-", "0").strip())
                        if max_val is None or abs(n) > abs(max_val):
                            max_val = n
                    except (ValueError, TypeError):
                        continue
                if max_val is None:
                    continue
                key = labels if len(labels) == 2 else (labels[0], "")
                combined.setdefault(key, {})[year] = f"{max_val:,}"

    if not combined:
        return pd.DataFrame()

    rows = []
    for (seg, item), amounts in combined.items():
        row = {"사업부문": seg, "품목": item}
        for y in all_years:
            row[str(y)] = amounts.get(y, "")
        rows.append(row)
    return pd.DataFrame(rows)


def extract_purchase_sources(
    business_data: dict[int, dict[str, list[pd.DataFrame]]],
) -> pd.DataFrame:
    """원재료 매입 현황 - 주요 매입처·매입액 추출

    report_parser에서 '매출_실적' 또는 관련 섹션에 포함될 수 있음.
    여기서는 모든 섹션의 테이블을 훑어 '매입'·'원재료'·'매입처' 키워드 포함
    테이블을 대상으로 합니다.
    """
    rows = []
    all_years = sorted(business_data.keys())

    for year, sections in business_data.items():
        for section_key, tables in sections.items():
            for df in tables:
                # 테이블 전체 텍스트에서 매입 관련 키워드 확인
                try:
                    df_text = " ".join(df.astype(str).values.flatten().tolist())
                except Exception:
                    continue
                if not any(k in df_text for k in ["매입처", "매입액", "원재료", "매입유형"]):
                    continue
                for _, row in df.iterrows():
                    items = [str(v).strip() for v in row.values if v is not None]
                    items = [v for v in items if v and v != "nan"]
                    if not items:
                        continue
                    rows.append({"연도": year, "내용": " | ".join(items[:6])})

    if not rows:
        return pd.DataFrame()

    # 중복 제거 (같은 연도 내 같은 내용)
    seen = set()
    dedup = []
    for r in rows:
        k = (r["연도"], r["내용"])
        if k in seen:
            continue
        seen.add(k)
        dedup.append(r)
    return pd.DataFrame(dedup)


def extract_sales_channels(
    business_data: dict[int, dict[str, list[pd.DataFrame]]],
) -> pd.DataFrame:
    """판매채널/지역별 매출 비중 (내수·수출, 온·오프라인)"""
    rows = []
    all_years = sorted(business_data.keys())

    for year, sections in business_data.items():
        for section_key, tables in sections.items():
            for df in tables:
                try:
                    df_text = " ".join(df.astype(str).values.flatten().tolist())
                except Exception:
                    continue
                if not any(k in df_text for k in ["내수", "수출", "온라인", "오프라인", "판매채널"]):
                    continue
                for _, row in df.iterrows():
                    items = [str(v).strip() for v in row.values if v is not None]
                    items = [v for v in items if v and v != "nan"]
                    if not items:
                        continue
                    first = items[0]
                    if any(k in first for k in ["내수", "수출", "온라인", "오프라인", "국내", "해외"]):
                        rows.append({
                            "연도": year,
                            "구분": first,
                            "내용": " | ".join(items[1:5]) if len(items) > 1 else "",
                        })

    if not rows:
        return pd.DataFrame()

    seen = set()
    dedup = []
    for r in rows:
        k = (r["연도"], r["구분"], r["내용"])
        if k in seen:
            continue
        seen.add(k)
        dedup.append(r)
    return pd.DataFrame(dedup)
