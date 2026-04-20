"""연간 재무 요약 (사용자 엑셀 포맷)

사용자가 정리하던 레이아웃:
  행(세로): 자산총계, 현금및현금성자산, 매출채권및기타채권, 재고자산,
           부채총계, 매입채무및기타채무, 단기차입금, 자본총계,
           매출액, 매출원가, 매출원가율(%), 판매비와관리비, 판매비와관리비율(%),
           영업이익(손실), %, 당기순이익(손실),
           영업활동현금흐름, 투자활동현금흐름, 유형자산의 증가, 무형자산의 증가,
           재무활동현금흐름
  열(가로): 2018, 2019, 2020, ...
"""

from __future__ import annotations

import pandas as pd


def _to_int(val) -> int | None:
    if val is None or val == "":
        return None
    try:
        return int(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _val(df: pd.DataFrame | None, keywords: list[str], col: str) -> int | None:
    if df is None or df.empty or "계정과목" not in df.columns or col not in df.columns:
        return None
    for _, row in df.iterrows():
        nm = str(row["계정과목"]).strip()
        for kw in keywords:
            if kw == nm or kw in nm:
                return _to_int(row[col])
    return None


def _pct(num, den) -> str:
    if num is None or den is None or den == 0:
        return "-"
    return f"{(num / den) * 100:.0f}%"


def build_annual_summary(
    cross_tables: dict[str, pd.DataFrame],
    start_year: int,
    end_year: int,
) -> pd.DataFrame:
    """사용자 포맷 연간 요약 생성"""
    bs = cross_tables.get("재무상태표")
    inc = cross_tables.get("손익계산서")
    if inc is None or inc.empty:
        inc = cross_tables.get("포괄손익계산서")
    cf = cross_tables.get("현금흐름표")

    years = [str(y) for y in range(start_year, end_year + 1)]

    # (label, source_df, keywords, format_type)
    # format_type: 'raw' = 원본 금액, 'pct_auto' = 특정 비율 계산
    spec = [
        # BS
        ("자산총계", bs, ["자산총계"], "raw"),
        ("현금및현금성자산", bs, ["현금및현금성자산", "현금 및 현금성자산"], "raw"),
        ("매출채권및기타채권", bs, ["매출채권및기타채권", "매출채권 및 기타채권", "매출채권"], "raw"),
        ("재고자산", bs, ["재고자산"], "raw"),
        ("부채총계", bs, ["부채총계"], "raw"),
        ("매입채무및기타채무", bs, ["매입채무및기타채무", "매입채무 및 기타채무", "매입채무"], "raw"),
        ("단기차입금", bs, ["단기차입금"], "raw"),
        ("자본총계", bs, ["자본총계"], "raw"),
        # IS
        ("매출액", inc, ["매출액", "수익(매출액)", "영업수익"], "raw"),
        ("매출원가", inc, ["매출원가"], "raw"),
        ("매출원가율(%)", None, [], "cogs_ratio"),
        ("판매비와관리비", inc, ["판매비와관리비", "판매비와 관리비"], "raw"),
        ("판매비와관리비율(%)", None, [], "sga_ratio"),
        ("영업이익(손실)", inc, ["영업이익", "영업이익(손실)"], "raw"),
        ("영업이익률(%)", None, [], "opm"),
        ("당기순이익(손실)", inc, ["당기순이익", "당기순이익(손실)"], "raw"),
        # CF
        ("영업활동현금흐름", cf, ["영업활동현금흐름", "영업활동 현금흐름"], "raw"),
        ("투자활동현금흐름", cf, ["투자활동현금흐름", "투자활동 현금흐름"], "raw"),
        ("유형자산의 증가", cf, ["유형자산의 증가", "유형자산의증가"], "raw"),
        ("무형자산의 증가", cf, ["무형자산의 증가", "무형자산의증가"], "raw"),
        ("재무활동현금흐름", cf, ["재무활동현금흐름", "재무활동 현금흐름"], "raw"),
    ]

    rows = []
    for label, src, kws, fmt in spec:
        row = {"계정과목": label}
        for y in years:
            if fmt == "raw":
                v = _val(src, kws, y)
                row[y] = v if v is not None else ""
            elif fmt == "cogs_ratio":
                cost = _val(inc, ["매출원가"], y)
                rev = _val(inc, ["매출액", "수익(매출액)", "영업수익"], y)
                row[y] = _pct(cost, rev)
            elif fmt == "sga_ratio":
                sga = _val(inc, ["판매비와관리비", "판매비와 관리비"], y)
                rev = _val(inc, ["매출액", "수익(매출액)", "영업수익"], y)
                row[y] = _pct(sga, rev)
            elif fmt == "opm":
                oi = _val(inc, ["영업이익", "영업이익(손실)"], y)
                rev = _val(inc, ["매출액", "수익(매출액)", "영업수익"], y)
                row[y] = _pct(oi, rev)
        rows.append(row)

    return pd.DataFrame(rows)


def build_inventory_detail(
    business_data: dict[int, dict[str, list[pd.DataFrame]]],
    cross_tables: dict[str, pd.DataFrame],
    start_year: int,
    end_year: int,
) -> pd.DataFrame:
    """재고자산 상세 (상품/제품/반제품/원재료별 + 회전율)

    사업보고서의 '재고 현황' 테이블을 우선 참조.
    """
    # 사업보고서 재고 현황 테이블에서 연도별 세부 항목 추출
    inventory_rows_by_year: dict[int, dict[str, int]] = {}

    for year, sections in business_data.items():
        tables = sections.get("재고_현황", [])
        for df in tables:
            # 테이블 내에서 '상품', '제품', '원재료' 등의 행 찾기
            for _, row in df.iterrows():
                # 첫 번째 컬럼에서 계정명 추출
                first_col = df.columns[0]
                nm = str(row[first_col]).strip() if first_col in row else ""
                if not nm:
                    continue
                for key in ["상품", "제품", "반제품", "미착품", "원재료", "부재료", "합계"]:
                    if key == nm or key in nm:
                        # 가장 큰 숫자 값을 택함 (당기 금액일 가능성)
                        max_val = None
                        for c in df.columns[1:]:
                            v = row.get(c)
                            if v is None:
                                continue
                            try:
                                n = int(str(v).replace(",", "").replace("-", "0").strip())
                                if max_val is None or abs(n) > abs(max_val):
                                    max_val = n
                            except (ValueError, TypeError):
                                continue
                        if max_val is not None:
                            inventory_rows_by_year.setdefault(year, {})[key] = max_val
                        break

    years = list(range(start_year, end_year + 1))
    items = ["상품", "제품", "반제품", "미착품", "원재료", "부재료", "합계"]

    rows = []
    for item in items:
        row = {"계정과목": item}
        for y in years:
            row[str(y)] = inventory_rows_by_year.get(y, {}).get(item, "")
        rows.append(row)

    # 총자산대비 재고자산 비율
    bs = cross_tables.get("재무상태표")
    row = {"계정과목": "총자산대비 재고자산 구성비율(%)"}
    for y in years:
        inv = _val(bs, ["재고자산"], str(y))
        ta = _val(bs, ["자산총계"], str(y))
        row[str(y)] = _pct(inv, ta)
    rows.append(row)

    # 재고자산회전율 = 매출원가 / 평균 재고자산
    inc = cross_tables.get("손익계산서")
    if inc is None or inc.empty:
        inc = cross_tables.get("포괄손익계산서")
    row = {"계정과목": "재고자산회전율(회)"}
    prev_inv = None
    for y in years:
        cur_inv = _val(bs, ["재고자산"], str(y))
        cogs = _val(inc, ["매출원가"], str(y))
        if cur_inv is None or cogs is None:
            row[str(y)] = "-"
        else:
            avg_inv = ((prev_inv or cur_inv) + cur_inv) / 2
            row[str(y)] = f"{(cogs / avg_inv):.1f}" if avg_inv else "-"
        prev_inv = cur_inv
    rows.append(row)

    return pd.DataFrame(rows)
