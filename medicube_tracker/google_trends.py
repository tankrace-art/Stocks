"""Google Trends tracker for Medicube brand"""
import time
from datetime import datetime
from typing import Optional
import pandas as pd

try:
    from pytrends.request import TrendReq
    PYTRENDS_AVAILABLE = True
except ImportError:
    PYTRENDS_AVAILABLE = False

from .config import GOOGLE_TRENDS_KEYWORDS, GOOGLE_TRENDS_GEO, GOOGLE_TRENDS_TIMEFRAME


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
        log("[Google Trends] pytrends 라이브러리가 설치되지 않았습니다. pip install pytrends")
        return {"error": "pytrends not installed"}

    if keywords is None:
        keywords = GOOGLE_TRENDS_KEYWORDS

    log(f"[Google Trends] 키워드 조회 중: {keywords}")

    try:
        pytrends = TrendReq(hl="ko-KR", tz=540, timeout=(10, 25), retries=2, backoff_factor=0.5)
        pytrends.build_payload(keywords, cat=0, timeframe=timeframe, geo=geo, gprop="")

        # Interest over time
        iot_df = pytrends.interest_over_time()
        time.sleep(1)

        # Interest by region (top countries)
        ibr_df = pytrends.interest_by_region(resolution="COUNTRY", inc_low_vol=False, inc_geo_code=False)
        ibr_df = ibr_df.sort_values(keywords[0], ascending=False).head(20)
        time.sleep(1)

        # Related queries
        related = pytrends.related_queries()
        time.sleep(1)

        # Current trend score (latest value)
        current_score = None
        if not iot_df.empty and keywords[0] in iot_df.columns:
            current_score = int(iot_df[keywords[0]].iloc[-1])

        # Top countries
        top_countries = []
        if not ibr_df.empty:
            for country, row in ibr_df.iterrows():
                score = int(row[keywords[0]])
                if score > 0:
                    top_countries.append({"country": country, "score": score})

        # Related rising queries
        rising_queries = []
        if keywords[0] in related and related[keywords[0]] and related[keywords[0]].get("rising") is not None:
            rising_df = related[keywords[0]]["rising"]
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
        log(f"[Google Trends] 오류: {e}")
        return {"error": str(e), "keyword": keywords[0] if keywords else ""}


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
        log(f"[Google Trends] {name} 데이터 수집 중...")
        try:
            pytrends = TrendReq(hl="ko-KR", tz=540, timeout=(10, 25), retries=2, backoff_factor=0.5)
            pytrends.build_payload(keywords, cat=0, timeframe="today 1-m", geo=geo_code, gprop="")
            iot_df = pytrends.interest_over_time()
            if not iot_df.empty and keywords[0] in iot_df.columns:
                score = int(iot_df[keywords[0]].iloc[-1])
                avg_score = int(iot_df[keywords[0]].mean())
            else:
                score = 0
                avg_score = 0
            results[name] = {"latest_score": score, "avg_score": avg_score}
            time.sleep(2)  # Respect rate limits
        except Exception as e:
            log(f"[Google Trends] {name} 오류: {e}")
            results[name] = {"latest_score": 0, "avg_score": 0, "error": str(e)}
            time.sleep(2)

    return {
        "keyword": keywords[0],
        "by_region": results,
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
