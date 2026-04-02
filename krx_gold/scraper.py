"""KRX 금시장 시세 데이터 스크래퍼

data.krx.co.kr 에서 금 현물 일별 시세(가격, 거래량 등)를 가져온다.

사용 방법:
    from krx_gold.scraper import get_gold_daily, get_gold_price_history

    # 특정일 전종목 시세
    df = get_gold_daily("20250401")

    # 금 1kg 기간별 시세
    df = get_gold_price_history("20250101", "20250401")

참고:
    KRX data.krx.co.kr 내부 API를 사용합니다.
    - JSON API: POST /comm/bldAttendant/getJsonData.cmd (bld 파라미터)
    - CSV 다운로드: GenerateOTP → download_csv 2단계
    bld 경로가 변경될 경우 브라우저 개발자도구 Network 탭에서 확인 후 수정하세요.
"""

import time
from io import BytesIO
from datetime import datetime, timedelta

import requests
import pandas as pd

# ── KRX 엔드포인트 ──
BASE = "http://data.krx.co.kr"
JSON_URL = f"{BASE}/comm/bldAttendant/getJsonData.cmd"
OTP_URL = f"{BASE}/comm/fileDn/GenerateOTP/generate.cmd"
DOWN_URL = f"{BASE}/comm/fileDn/download_csv/download.cmd"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Referer": f"{BASE}/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201060201",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "X-Requested-With": "XMLHttpRequest",
}

# ── KRX 금시장 bld 경로 후보 ──
# data.krx.co.kr의 금시장 메뉴 ID: MDC0201060201 (전종목 시세)
# bld 경로는 KRX 내부적으로 변경될 수 있으므로 여러 후보를 시도한다.
BLD_GOLD_DAILY_CANDIDATES = [
    "dbms/MDC/STAT/standard/MDCSTAT06601",  # 금 전종목 시세
    "dbms/MDC/STAT/standard/MDCSTAT06701",
    "dbms/MDC/STAT/standard/MDCSTAT06001",
    "dbms/MDC/STAT/standard/MDCSTAT06101",
]

BLD_GOLD_HISTORY_CANDIDATES = [
    "dbms/MDC/STAT/standard/MDCSTAT06602",  # 금 종목별 시세 추이
    "dbms/MDC/STAT/standard/MDCSTAT06702",
    "dbms/MDC/STAT/standard/MDCSTAT06002",
    "dbms/MDC/STAT/standard/MDCSTAT06102",
]

# KRX 금시장 종목코드
GOLD_ISU_CODES = {
    "금 1kg": "KRD040200002",
    "금 100g": "KRD040200001",
    "미니금(10g)": "KRD040200003",
}


def _post_json(bld: str, params: dict, timeout: int = 30) -> dict:
    """KRX JSON API 단일 호출"""
    data = {"bld": bld, **params}
    resp = requests.post(JSON_URL, data=data, headers=HEADERS, timeout=timeout)
    resp.raise_for_status()
    if not resp.text.strip():
        return {}
    return resp.json()


def _try_json(bld_candidates: list, params: dict, log_fn=None) -> tuple[str, list]:
    """여러 bld 경로를 시도하여 데이터가 있는 첫 번째 결과 반환

    Returns
    -------
    tuple[str, list]
        (성공한 bld 경로, 데이터 rows)
    """
    for bld in bld_candidates:
        try:
            result = _post_json(bld, params)
            # KRX JSON 응답은 보통 "output" 또는 "OutBlock_1" 키에 데이터가 있음
            rows = (
                result.get("output")
                or result.get("OutBlock_1")
                or result.get("block1")
                or []
            )
            if rows:
                if log_fn:
                    log_fn(f"  bld 경로 확인: {bld}")
                return bld, rows
        except Exception:
            continue
    return "", []


def _download_csv(url_path: str, params: dict) -> pd.DataFrame:
    """KRX CSV 다운로드 (OTP 생성 → download 2단계)"""
    otp_params = {
        "name": "fileDown",
        "filetype": "csv",
        "url": url_path,
        "csvxls_isNo": "false",
        **params,
    }
    otp = requests.post(OTP_URL, data=otp_params, headers=HEADERS, timeout=30).text

    if not otp or len(otp) < 10:
        return pd.DataFrame()

    resp = requests.post(DOWN_URL, data={"code": otp}, headers=HEADERS, timeout=30)

    # 인코딩 시도: EUC-KR → UTF-8
    for enc in ["EUC-KR", "cp949", "utf-8"]:
        try:
            df = pd.read_csv(BytesIO(resp.content), encoding=enc)
            if not df.empty:
                return df
        except (UnicodeDecodeError, pd.errors.EmptyDataError):
            continue

    return pd.DataFrame()


def get_gold_daily(trd_dd: str = None, log_fn=None) -> pd.DataFrame:
    """특정 일자의 KRX 금 전종목 시세 조회

    Parameters
    ----------
    trd_dd : str, optional
        조회일 (YYYYMMDD). 미지정 시 최근 영업일.
    log_fn : callable, optional
        로그 출력 함수.

    Returns
    -------
    pd.DataFrame
        종목명, 종가, 대비, 등락률, 시가, 고가, 저가, 거래량(g), 거래대금(원) 등
    """
    if trd_dd is None:
        trd_dd = _latest_biz_day()

    if log_fn:
        log_fn(f"  조회일: {trd_dd}")

    # 방법 1: JSON API 시도
    bld, rows = _try_json(BLD_GOLD_DAILY_CANDIDATES, {"trdDd": trd_dd}, log_fn)
    if rows:
        df = pd.DataFrame(rows)
        return _clean_columns(df)

    # 방법 2: CSV 다운로드 시도
    if log_fn:
        log_fn("  JSON API 실패, CSV 다운로드 시도...")
    for url_path in BLD_GOLD_DAILY_CANDIDATES:
        try:
            df = _download_csv(url_path, {"trdDd": trd_dd})
            if not df.empty:
                if log_fn:
                    log_fn(f"  CSV 다운로드 성공: {url_path}")
                return _clean_columns(df)
        except Exception:
            continue

    if log_fn:
        log_fn("  [!] 데이터를 가져올 수 없습니다.")
    return pd.DataFrame()


def get_gold_price_history(
    start_date: str,
    end_date: str = None,
    isu_cd: str = "KRD040200002",
    log_fn=None,
) -> pd.DataFrame:
    """금 종목의 기간별 일별 시세 추이 조회

    Parameters
    ----------
    start_date : str
        시작일 (YYYYMMDD)
    end_date : str, optional
        종료일 (YYYYMMDD). 미지정 시 오늘.
    isu_cd : str
        종목코드.
        - KRD040200002 : 금 1kg (기본)
        - KRD040200001 : 금 100g
        - KRD040200003 : 미니금 10g
    log_fn : callable, optional
        로그 출력 함수.

    Returns
    -------
    pd.DataFrame
        일자, 종가, 대비, 등락률, 시가, 고가, 저가, 거래량, 거래대금
    """
    if end_date is None:
        end_date = datetime.now().strftime("%Y%m%d")

    if log_fn:
        log_fn(f"  기간: {start_date} ~ {end_date}")
        item_name = next(
            (k for k, v in GOLD_ISU_CODES.items() if v == isu_cd), isu_cd
        )
        log_fn(f"  종목: {item_name} ({isu_cd})")

    params = {
        "strtDd": start_date,
        "endDd": end_date,
        "isuCd": isu_cd,
    }

    # 방법 1: JSON API
    bld, rows = _try_json(BLD_GOLD_HISTORY_CANDIDATES, params, log_fn)
    if rows:
        df = pd.DataFrame(rows)
        return _clean_columns(df)

    # 방법 2: CSV 다운로드
    if log_fn:
        log_fn("  JSON API 실패, CSV 다운로드 시도...")
    for url_path in BLD_GOLD_HISTORY_CANDIDATES:
        try:
            df = _download_csv(url_path, params)
            if not df.empty:
                return _clean_columns(df)
        except Exception:
            continue

    if log_fn:
        log_fn("  [!] 데이터를 가져올 수 없습니다.")
    return pd.DataFrame()


def _clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    """컬럼명 한글 매핑 및 숫자 정리"""
    # KRX JSON 응답의 일반적인 영문 컬럼명 → 한글 매핑
    col_map = {
        "ISU_NM": "종목명",
        "ISU_SRT_CD": "종목코드",
        "ISU_CD": "종목코드",
        "TDD_CLSPRC": "종가",
        "CMPPREVDD_PRC": "대비",
        "FLUC_RT": "등락률(%)",
        "TDD_OPNPRC": "시가",
        "TDD_HGPRC": "고가",
        "TDD_LWPRC": "저가",
        "ACC_TRDVOL": "거래량(g)",
        "ACC_TRDVAL": "거래대금(원)",
        "MKTCAP": "시가총액",
        "TRD_DD": "일자",
        "BAS_DD": "기준일",
        "FLUC_TP_CD": "등락구분",
    }

    renamed = {}
    for old, new in col_map.items():
        if old in df.columns:
            renamed[old] = new
    if renamed:
        df = df.rename(columns=renamed)

    # 숫자 컬럼 정리
    for col in df.columns:
        if df[col].dtype == object:
            sample = df[col].dropna()
            if len(sample) == 0:
                continue
            s = str(sample.iloc[0])
            # 콤마가 있는 숫자 또는 순수 숫자
            cleaned = s.replace(",", "").replace("-", "").replace(".", "", 1)
            if cleaned.isdigit() or (s.startswith("-") and cleaned.isdigit()):
                df[col] = df[col].astype(str).str.replace(",", "", regex=False)
                df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def _latest_biz_day() -> str:
    """최근 영업일 추정 (주말 제외, 장 마감 전이면 전일)"""
    now = datetime.now()
    # 오후 6시 이전이면 전일 기준 (장 마감 후 데이터 반영 고려)
    if now.hour < 18:
        now -= timedelta(days=1)
    # 주말이면 금요일로
    while now.weekday() >= 5:  # 5=토, 6=일
        now -= timedelta(days=1)
    return now.strftime("%Y%m%d")


def discover_gold_bld(trd_dd: str = None) -> dict:
    """브라우저 없이 금시장 bld 경로를 자동 탐색 (디버깅용)

    Returns
    -------
    dict
        {"daily": "성공한_bld_경로", "history": "성공한_bld_경로"}
    """
    if trd_dd is None:
        trd_dd = _latest_biz_day()

    result = {}

    # 전종목 시세 bld 탐색
    for bld in BLD_GOLD_DAILY_CANDIDATES:
        try:
            j = _post_json(bld, {"trdDd": trd_dd})
            rows = j.get("output") or j.get("OutBlock_1") or j.get("block1") or []
            if rows:
                result["daily"] = bld
                break
        except Exception:
            continue

    # 기간별 시세 bld 탐색
    end = trd_dd
    start = (datetime.strptime(trd_dd, "%Y%m%d") - timedelta(days=30)).strftime("%Y%m%d")
    for bld in BLD_GOLD_HISTORY_CANDIDATES:
        try:
            j = _post_json(bld, {
                "strtDd": start, "endDd": end, "isuCd": "KRD040200002",
            })
            rows = j.get("output") or j.get("OutBlock_1") or j.get("block1") or []
            if rows:
                result["history"] = bld
                break
        except Exception:
            continue

    return result
