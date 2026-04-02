"""KRX 금시장 시세 데이터 스크래퍼

data.krx.co.kr 에서 금 현물 일별 시세(가격, 거래량 등)를 가져온다.

두 가지 데이터 소스 지원:
1. data.krx.co.kr 내부 API (회원가입 불필요)
2. KRX Open API (openapi.krx.co.kr, API 키 필요)

사용 방법:
    from krx_gold.scraper import get_gold_daily, get_gold_price_history

    # 특정일 전종목 시세
    df = get_gold_daily("20250401")

    # 금 1kg 기간별 시세
    df = get_gold_price_history("20250101", "20250401")

    # KRX Open API 사용 (API 키 필요)
    df = get_gold_open_api("20250401", api_key="YOUR_KEY")

bld 경로 참고:
    pykrx path_bld_information.json 기준:
    - 금 전종목 시세: MDCSTAT14901 (menuId: MDC0201060201)
    - 금 개별종목 시세 추이: MDCSTAT15001 (menuId: MDC0201060202)
    - 국제금시세 동향: MDCSTAT13901 (menuId: MDC0201060207)
"""

import time
from io import BytesIO
from datetime import datetime, timedelta

import requests
import pandas as pd

# ── KRX data.krx.co.kr 엔드포인트 ──
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

# ── KRX 금시장 bld 경로 (pykrx path_bld_information.json 기준) ──
BLD_GOLD_DAILY = "dbms/MDC/STAT/standard/MDCSTAT14901"     # 금 전종목 시세
BLD_GOLD_HISTORY = "dbms/MDC/STAT/standard/MDCSTAT15001"   # 금 개별종목 시세 추이
BLD_GOLD_INTL = "dbms/MDC/STAT/standard/MDCSTAT13901"      # 국제금시세 동향

# ── KRX Open API (공식 API, API 키 필요) ──
KRX_OPEN_API_GOLD = "https://data-dbg.krx.co.kr/svc/apis/gen/gold_bydd_trd"

# KRX 금시장 종목코드
GOLD_ISU_CODES = {
    "금 1kg": "KRD040200002",
    "금 100g": "KRD040200001",
    "미니금(10g)": "KRD040200003",
}


# ════════════════════════════════════════════════════════════
#  내부 헬퍼
# ════════════════════════════════════════════════════════════

def _post_json(bld: str, params: dict, timeout: int = 30) -> dict:
    """KRX JSON API 단일 호출"""
    data = {"bld": bld, "locale": "ko_KR", "csvxls_isNo": "false", **params}
    resp = requests.post(JSON_URL, data=data, headers=HEADERS, timeout=timeout)
    resp.raise_for_status()
    if not resp.text.strip():
        return {}
    return resp.json()


def _extract_rows(result: dict) -> list:
    """KRX JSON 응답에서 데이터 행 추출"""
    return (
        result.get("output")
        or result.get("OutBlock_1")
        or result.get("block1")
        or []
    )


def _download_csv(url_path: str, params: dict) -> pd.DataFrame:
    """KRX CSV 다운로드 (OTP 생성 → download 2단계)"""
    otp_params = {
        "name": "fileDown",
        "filetype": "csv",
        "url": url_path,
        "csvxls_isNo": "false",
        "locale": "ko_KR",
        **params,
    }
    otp = requests.post(OTP_URL, data=otp_params, headers=HEADERS, timeout=30).text

    if not otp or len(otp) < 10:
        return pd.DataFrame()

    resp = requests.post(DOWN_URL, data={"code": otp}, headers=HEADERS, timeout=30)

    for enc in ["EUC-KR", "cp949", "utf-8"]:
        try:
            df = pd.read_csv(BytesIO(resp.content), encoding=enc)
            if not df.empty:
                return df
        except (UnicodeDecodeError, pd.errors.EmptyDataError):
            continue

    return pd.DataFrame()


def _clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    """컬럼명 한글 매핑 및 숫자 정리"""
    col_map = {
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
        "BAS_DD": "기준일",
    }

    renamed = {}
    for old, new in col_map.items():
        if old in df.columns:
            renamed[old] = new
    if renamed:
        df = df.rename(columns=renamed)

    # 숫자 컬럼의 콤마 제거 및 타입 변환
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
    """최근 영업일 추정 (주말 제외, 장 마감 전이면 전일)"""
    now = datetime.now()
    if now.hour < 18:
        now -= timedelta(days=1)
    while now.weekday() >= 5:
        now -= timedelta(days=1)
    return now.strftime("%Y%m%d")


# ════════════════════════════════════════════════════════════
#  공개 API
# ════════════════════════════════════════════════════════════

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

    # 방법 1: JSON API (bld: MDCSTAT14901)
    try:
        result = _post_json(BLD_GOLD_DAILY, {"trdDd": trd_dd})
        rows = _extract_rows(result)
        if rows:
            if log_fn:
                log_fn(f"  JSON API 성공 (bld: MDCSTAT14901)")
            return _clean_columns(pd.DataFrame(rows))
    except Exception as e:
        if log_fn:
            log_fn(f"  JSON API 실패: {e}")

    # 방법 2: CSV 다운로드 (동일 bld 경로)
    if log_fn:
        log_fn("  CSV 다운로드 시도...")
    try:
        df = _download_csv(BLD_GOLD_DAILY, {"trdDd": trd_dd})
        if not df.empty:
            if log_fn:
                log_fn("  CSV 다운로드 성공")
            return _clean_columns(df)
    except Exception as e:
        if log_fn:
            log_fn(f"  CSV 다운로드 실패: {e}")

    if log_fn:
        log_fn("  [!] 데이터를 가져올 수 없습니다. 영업일인지 확인해주세요.")
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

    # 방법 1: JSON API (bld: MDCSTAT15001)
    try:
        result = _post_json(BLD_GOLD_HISTORY, params)
        rows = _extract_rows(result)
        if rows:
            if log_fn:
                log_fn(f"  JSON API 성공 ({len(rows)}건)")
            return _clean_columns(pd.DataFrame(rows))
    except Exception as e:
        if log_fn:
            log_fn(f"  JSON API 실패: {e}")

    # 방법 2: CSV 다운로드
    if log_fn:
        log_fn("  CSV 다운로드 시도...")
    try:
        df = _download_csv(BLD_GOLD_HISTORY, params)
        if not df.empty:
            if log_fn:
                log_fn(f"  CSV 다운로드 성공 ({len(df)}건)")
            return _clean_columns(df)
    except Exception as e:
        if log_fn:
            log_fn(f"  CSV 다운로드 실패: {e}")

    if log_fn:
        log_fn("  [!] 데이터를 가져올 수 없습니다.")
    return pd.DataFrame()


def get_gold_intl(start_date: str, end_date: str = None, log_fn=None) -> pd.DataFrame:
    """국제 금시세 동향 조회

    Parameters
    ----------
    start_date : str
        시작일 (YYYYMMDD)
    end_date : str, optional
        종료일 (YYYYMMDD). 미지정 시 오늘.

    Returns
    -------
    pd.DataFrame
        국제 금시세 데이터
    """
    if end_date is None:
        end_date = datetime.now().strftime("%Y%m%d")

    try:
        result = _post_json(BLD_GOLD_INTL, {
            "strtDd": start_date, "endDd": end_date,
        })
        rows = _extract_rows(result)
        if rows:
            return _clean_columns(pd.DataFrame(rows))
    except Exception as e:
        if log_fn:
            log_fn(f"  국제금시세 조회 실패: {e}")

    return pd.DataFrame()


def get_gold_open_api(bas_dd: str, api_key: str) -> pd.DataFrame:
    """KRX Open API로 금시장 일별 거래 데이터 조회

    openapi.krx.co.kr 에서 발급받은 API 키가 필요합니다.
    일 10,000회 호출 제한, 2010년 이후 데이터 제공.

    Parameters
    ----------
    bas_dd : str
        기준일 (YYYYMMDD)
    api_key : str
        KRX Open API 인증키

    Returns
    -------
    pd.DataFrame
        금시장 일별 거래 데이터
    """
    resp = requests.get(
        KRX_OPEN_API_GOLD,
        params={"basDd": bas_dd, "AUTH_KEY": api_key},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    rows = data.get("output") or data.get("OutBlock_1") or data.get("block1") or []
    if not rows:
        return pd.DataFrame()

    return _clean_columns(pd.DataFrame(rows))
