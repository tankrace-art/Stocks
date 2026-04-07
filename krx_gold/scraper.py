"""KRX 금시장 시세 데이터 스크래퍼

KRX Open API (openapi.krx.co.kr)를 통해 금 현물 시세를 가져온다.

사전 준비:
    1. https://openapi.krx.co.kr 회원가입
    2. [마이페이지] → [인증키 신청] → 인증키 발급
    3. [서비스 신청] → [일반상품] 서비스 신청
    4. 발급받은 인증키를 프로그램에 입력

사용 방법:
    from krx_gold.scraper import get_gold_daily

    df = get_gold_daily("20260401", api_key="YOUR_KEY")
"""

import time
from datetime import datetime, timedelta

import requests
import pandas as pd

# ── KRX Open API 엔드포인트 ──
KRX_API_BASE = "https://data-dbg.krx.co.kr/svc/apis"
GOLD_DAILY_URL = f"{KRX_API_BASE}/gen/gold_bydd_trd"

# KRX 금시장 종목 (참고용)
GOLD_ITEMS = {
    "금 99.99 1Kg": "1kg",
    "금 99.99 100g": "100g",
    "미니금 99.99 10g": "10g",
}

# 한글 컬럼명 매핑
COL_MAP = {
    "BAS_DD": "기준일",
    "ISU_NM": "종목명",
    "ISU_SRT_CD": "종목코드",
    "ISU_CD": "종목코드",
    "TDD_CLSPRC": "종가",
    "CMPPREVDD_PRC": "대비",
    "FLUC_RT": "등락률(%)",
    "FLUC_TP_CD": "등락구분",
    "TDD_OPNPRC": "시가",
    "TDD_HGPRC": "고가",
    "TDD_LWPRC": "저가",
    "ACC_TRDVOL": "거래량(g)",
    "ACC_TRDVAL": "거래대금(원)",
    "MKTCAP": "시가총액",
    "TRD_DD": "일자",
}


def get_gold_daily(
    bas_dd: str = None,
    api_key: str = "",
    log_fn=None,
    auto_fallback: bool = True,
    max_fallback_days: int = 7,
) -> pd.DataFrame:
    """특정 일자의 KRX 금 전종목 시세 조회

    Parameters
    ----------
    bas_dd : str, optional
        기준일 (YYYYMMDD). 미지정 시 최근 영업일.
    api_key : str
        KRX Open API 인증키.
    log_fn : callable, optional
        로그 출력 함수.
    auto_fallback : bool
        True면 데이터가 없을 때 전 영업일로 자동 재시도.
    max_fallback_days : int
        자동 재시도 최대 일수.

    Returns
    -------
    pd.DataFrame
        종목명, 종가, 대비, 등락률, 시가, 고가, 저가, 거래량, 거래대금
    """
    if not api_key:
        raise ValueError("KRX Open API 인증키가 필요합니다.")

    if bas_dd is None:
        bas_dd = _latest_biz_day()

    if log_fn:
        log_fn(f"  조회일: {bas_dd}")
        log_fn(f"  API: {GOLD_DAILY_URL}")

    df = _call_api(GOLD_DAILY_URL, {"basDd": bas_dd}, api_key, log_fn)

    # 데이터가 없으면 전 영업일로 자동 폴백
    if df.empty and auto_fallback:
        current = datetime.strptime(bas_dd, "%Y%m%d")
        for i in range(1, max_fallback_days + 1):
            current -= timedelta(days=1)
            while current.weekday() >= 5:  # 주말 건너뛰기
                current -= timedelta(days=1)
            fallback_dd = current.strftime("%Y%m%d")
            if log_fn:
                log_fn(f"  [자동 폴백] {fallback_dd} 재시도...")
            df = _call_api(GOLD_DAILY_URL, {"basDd": fallback_dd}, api_key, log_fn)
            if not df.empty:
                if log_fn:
                    log_fn(f"  ✓ {fallback_dd} 데이터 획득")
                break

    return df


def get_gold_price_history(
    start_date: str,
    end_date: str = None,
    api_key: str = "",
    item_filter: str = None,
    log_fn=None,
) -> pd.DataFrame:
    """금 종목의 기간별 일별 시세 추이 조회

    KRX Open API는 일자별 조회만 지원하므로, 기간 내 영업일을 순회하며 조회한다.

    Parameters
    ----------
    start_date : str
        시작일 (YYYYMMDD)
    end_date : str, optional
        종료일 (YYYYMMDD). 미지정 시 오늘.
    api_key : str
        KRX Open API 인증키.
    item_filter : str, optional
        종목 필터 (예: "1Kg", "100g", "10g"). 미지정 시 전체.
    log_fn : callable, optional
        로그 출력 함수.

    Returns
    -------
    pd.DataFrame
        기간 내 일별 시세 데이터
    """
    if not api_key:
        raise ValueError("KRX Open API 인증키가 필요합니다.")

    if end_date is None:
        end_date = datetime.now().strftime("%Y%m%d")

    if log_fn:
        log_fn(f"  기간: {start_date} ~ {end_date}")
        if item_filter:
            log_fn(f"  종목 필터: {item_filter}")

    # 날짜 범위 생성 (영업일만)
    dates = _biz_days_between(start_date, end_date)

    if log_fn:
        log_fn(f"  조회 대상: 약 {len(dates)}일 (주말 제외)")

    all_rows = []
    for i, dd in enumerate(dates):
        try:
            df = _call_api(GOLD_DAILY_URL, {"basDd": dd}, api_key)
            if not df.empty:
                all_rows.append(df)
            if log_fn and (i + 1) % 10 == 0:
                log_fn(f"  진행: {i + 1}/{len(dates)}일 완료")
        except Exception as e:
            if log_fn:
                log_fn(f"  {dd} 조회 실패: {e}")
        # API 호출 간격 (과도한 요청 방지)
        time.sleep(0.3)

    if not all_rows:
        return pd.DataFrame()

    result = pd.concat(all_rows, ignore_index=True)

    # 종목 필터
    if item_filter:
        name_col = "종목명" if "종목명" in result.columns else "ISU_NM"
        if name_col in result.columns:
            result = result[
                result[name_col].str.contains(item_filter, case=False, na=False)
            ].reset_index(drop=True)

    if log_fn:
        log_fn(f"  조회 완료: 총 {len(result)}건")

    return result


def _call_api(url: str, params: dict, api_key: str, log_fn=None) -> pd.DataFrame:
    """KRX Open API 호출"""
    params["AUTH_KEY"] = api_key

    resp = requests.get(url, params=params, timeout=30)

    # 401 = 서비스 미신청 or 인증키 오류
    if resp.status_code == 401:
        raise RuntimeError(
            "인증 실패 (401). 아래를 확인해주세요:\n"
            "  1. openapi.krx.co.kr → [서비스 신청] → [일반상품] 신청 완료?\n"
            "  2. 인증키가 정확한지 확인\n"
            "  3. 신청 후 승인까지 최대 1일 소요"
        )

    resp.raise_for_status()

    try:
        data = resp.json()
    except Exception as e:
        if log_fn:
            log_fn(f"  [응답 파싱 실패] {e}")
            log_fn(f"  응답 원본: {resp.text[:500]}")
        return pd.DataFrame()

    # 에러 처리
    if isinstance(data, dict) and "error" in data:
        msg = data.get("error", {})
        if isinstance(msg, dict):
            msg = msg.get("message", str(data))
        raise RuntimeError(f"KRX API 에러: {msg}")

    # 데이터 추출: 다양한 응답 키 시도
    rows = None
    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        for key in ["OutBlock_1", "output", "block1", "result", "data", "body"]:
            if key in data and isinstance(data[key], list):
                rows = data[key]
                break
        # 최상위에 다른 list 키가 있는지 탐색
        if rows is None:
            for key, val in data.items():
                if isinstance(val, list) and val:
                    rows = val
                    if log_fn:
                        log_fn(f"  응답 키 자동 감지: '{key}'")
                    break

    if rows is None or not rows:
        if log_fn:
            # 응답 구조 디버그 출력
            if isinstance(data, dict):
                log_fn(f"  응답 키: {list(data.keys())}")
                log_fn(f"  응답 미리보기: {str(data)[:400]}")
            else:
                log_fn(f"  응답 타입: {type(data).__name__}")
                log_fn(f"  응답 미리보기: {str(data)[:400]}")
        return pd.DataFrame()

    if log_fn:
        log_fn(f"  응답 수신: {len(rows)}건")

    df = pd.DataFrame(rows)
    df = _clean_columns(df)
    return df


def _clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    """컬럼명 한글 매핑 및 숫자 정리"""
    renamed = {}
    for old, new in COL_MAP.items():
        if old in df.columns:
            renamed[old] = new
    if renamed:
        df = df.rename(columns=renamed)

    for col in df.columns:
        if df[col].dtype == object:
            sample = df[col].dropna()
            if len(sample) == 0:
                continue
            s = str(sample.iloc[0])
            cleaned = s.replace(",", "").replace("-", "").replace(".", "", 1)
            if cleaned.isdigit() or (s.startswith("-") and cleaned.isdigit()):
                df[col] = df[col].astype(str).str.replace(",", "", regex=False)
                df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def _latest_biz_day() -> str:
    """최근 영업일 추정"""
    now = datetime.now()
    if now.hour < 18:
        now -= timedelta(days=1)
    while now.weekday() >= 5:
        now -= timedelta(days=1)
    return now.strftime("%Y%m%d")


def _biz_days_between(start: str, end: str) -> list[str]:
    """시작~종료 사이의 영업일(주말 제외) 목록"""
    s = datetime.strptime(start, "%Y%m%d")
    e = datetime.strptime(end, "%Y%m%d")
    dates = []
    cur = s
    while cur <= e:
        if cur.weekday() < 5:
            dates.append(cur.strftime("%Y%m%d"))
        cur += timedelta(days=1)
    return dates
