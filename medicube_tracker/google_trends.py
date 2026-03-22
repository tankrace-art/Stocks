"""Google Trends tracker for Medicube brand"""
import time
import random
from datetime import datetime

try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False

try:
    from pytrends.request import TrendReq
    PYTRENDS_AVAILABLE = True
except ImportError:
    PYTRENDS_AVAILABLE = False

from .config import GOOGLE_TRENDS_KEYWORDS, GOOGLE_TRENDS_GEO, GOOGLE_TRENDS_TIMEFRAME


def _make_pytrends():
    """Create a TrendReq instance with robust settings."""
    return TrendReq(
        hl="en-US",
        tz=540,
        timeout=(15, 40),
        retries=3,
        backoff_factor=2.0,
        requests_args={"verify": True},
    )


def _build_payload_with_retry(pytrends, keywords, timeframe, geo, max_retries=3):
    """Build payload with retry on rate-limit errors."""
    for attempt in range(max_retries):
        try:
            pytrends.build_payload(
                keywords, cat=0, timeframe=timeframe, geo=geo, gprop=""
            )
            return True
        except Exception as e:
            msg = str(e).lower()
            if "429" in msg or "too many" in msg or "rate" in msg:
                wait = (attempt + 1) * 15
                time.sleep(wait)
            elif attempt < max_retries - 1:
                time.sleep(5)
            else:
                raise
    return False


def _get_interest_with_retry(fn, max_retries=3):
    """Call a pytrends data method with retry on errors."""
    for attempt in range(max_retries):
        try:
            result = fn()
            return result
        except Exception as e:
            msg = str(e).lower()
            if "429" in msg or "too many" in msg or "rate" in msg:
                wait = (attempt + 1) * 20
                time.sleep(wait)
            elif attempt < max_retries - 1:
                time.sleep(8)
            else:
                raise
    return None


def fetch_google_trends(
    keywords: list = None,
    geo: str = "",
    timeframe: str = "today 3-m",
    log_callback=None,
) -> dict:
    """
    Fetch Google Trends data for given keywords.
    Returns dict with interest_over_time, interest_by_region, related_queries.
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    if not PYTRENDS_AVAILABLE:
        log("[Google Trends] pytrends 라이브러리 없음 → pip install pytrends")
        return {"error": "pytrends not installed"}

    if keywords is None:
        keywords = GOOGLE_TRENDS_KEYWORDS

    log(f"[Google Trends] 키워드 조회 중: {keywords} (전세계, 최근 3개월)")

    for attempt in range(3):
        try:
            pytrends = _make_pytrends()
            _build_payload_with_retry(pytrends, keywords, timeframe, geo)
            time.sleep(random.uniform(3, 5))

            # Interest over time
            iot_df = _get_interest_with_retry(pytrends.interest_over_time)
            time.sleep(random.uniform(4, 6))

            # Interest by region (top countries)
            ibr_df = _get_interest_with_retry(
                lambda: pytrends.interest_by_region(
                    resolution="COUNTRY", inc_low_vol=False, inc_geo_code=False
                )
            )
            if ibr_df is not None and not ibr_df.empty and keywords[0] in ibr_df.columns:
                ibr_df = ibr_df.sort_values(keywords[0], ascending=False).head(20)
            time.sleep(random.uniform(4, 6))

            # Related queries
            related = _get_interest_with_retry(pytrends.related_queries)
            time.sleep(random.uniform(2, 4))

            # Current trend score
            current_score = None
            if iot_df is not None and not iot_df.empty and keywords[0] in iot_df.columns:
                current_score = int(iot_df[keywords[0]].iloc[-1])

            # Top countries
            top_countries = []
            if ibr_df is not None and not ibr_df.empty and keywords[0] in ibr_df.columns:
                for country, row in ibr_df.iterrows():
                    score = int(row[keywords[0]])
                    if score > 0:
                        top_countries.append({"country": country, "score": score})

            # Rising queries
            rising_queries = []
            if related and keywords[0] in related:
                kw_related = related[keywords[0]]
                if kw_related and kw_related.get("rising") is not None:
                    rising_df = kw_related["rising"]
                    if rising_df is not None and not rising_df.empty:
                        rising_queries = rising_df.head(10).to_dict("records")

            log(f"[Google Trends] 현재 트렌드 점수: {current_score}/100")

            return {
                "keyword": keywords[0],
                "current_score": current_score,
                "timeframe": timeframe,
                "geo": geo if geo else "전세계",
                "top_countries": top_countries,
                "rising_queries": rising_queries,
                "interest_over_time": iot_df,
                "interest_by_region": ibr_df,
                "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }

        except Exception as e:
            msg = str(e).lower()
            if "429" in msg or "too many" in msg or "rate" in msg:
                log(f"[Google Trends] Google 요청 제한(429) - {(attempt+1)*20}초 대기 후 재시도...")
                time.sleep((attempt + 1) * 20)
            else:
                log(f"[Google Trends] 오류 (시도 {attempt+1}/3): {e}")
                if attempt < 2:
                    time.sleep(10)
                else:
                    return {"error": str(e), "keyword": keywords[0] if keywords else ""}

    return {"error": "max retries exceeded", "keyword": keywords[0] if keywords else ""}


def fetch_google_trends_multi_geo(keywords: list = None, log_callback=None) -> dict:
    """Fetch trends for multiple regions (US, UK, DE, ES, IT, FR, KR, JP)."""
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    if not PYTRENDS_AVAILABLE:
        return {"error": "pytrends not installed"}

    if keywords is None:
        keywords = GOOGLE_TRENDS_KEYWORDS

    regions = {
        "전세계": "",
        "미국": "US",
        "영국": "GB",
        "독일": "DE",
        "스페인": "ES",
        "이탈리아": "IT",
        "프랑스": "FR",
        "한국": "KR",
        "일본": "JP",
    }

    results = {}
    for name, geo_code in regions.items():
        log(f"[Google Trends] {name} 수집 중...")
        for attempt in range(3):
            try:
                pytrends = _make_pytrends()
                _build_payload_with_retry(pytrends, keywords, "today 1-m", geo_code)
                time.sleep(random.uniform(4, 7))

                iot_df = _get_interest_with_retry(pytrends.interest_over_time)
                if iot_df is not None and not iot_df.empty and keywords[0] in iot_df.columns:
                    score = int(iot_df[keywords[0]].iloc[-1])
                    avg_score = int(iot_df[keywords[0]].mean())
                else:
                    score = 0
                    avg_score = 0

                results[name] = {"latest_score": score, "avg_score": avg_score}
                log(f"[Google Trends] {name}: 최근점수={score}, 평균={avg_score}")
                time.sleep(random.uniform(5, 8))
                break

            except Exception as e:
                msg = str(e).lower()
                if "429" in msg or "too many" in msg or "rate" in msg:
                    wait = (attempt + 1) * 20
                    log(f"[Google Trends] {name} 요청 제한 - {wait}초 대기...")
                    time.sleep(wait)
                else:
                    log(f"[Google Trends] {name} 오류: {e}")
                    results[name] = {"latest_score": 0, "avg_score": 0, "error": str(e)}
                    time.sleep(random.uniform(5, 8))
                    break

        if name not in results:
            results[name] = {"latest_score": 0, "avg_score": 0, "error": "max retries"}

    return {
        "keyword": keywords[0],
        "by_region": results,
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
