"""Google Trends tracker for Medicube brand
주요 방법:
  1순위 - SerpAPI (월 100건 무료, 안정적)  ← 권장
  2순위 - pytrends (무료, 429 차단 잦음)
"""
import time
import random
import requests
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

from .config import (
    GOOGLE_TRENDS_KEYWORDS,
    GOOGLE_TRENDS_GEO,
    GOOGLE_TRENDS_TIMEFRAME,
    SERPAPI_KEY,
)

# ──────────────────────────────────────────────
# SerpAPI 방식 (1순위)
# ──────────────────────────────────────────────

def _serpapi_fetch(keyword: str, geo: str = "", timeframe: str = "today 3-m") -> dict | None:
    """
    SerpAPI를 통해 Google Trends 데이터 수집.
    API 키: https://serpapi.com (무료 가입 시 월 100건)
    """
    if not SERPAPI_KEY:
        return None

    url = "https://serpapi.com/search.json"
    params = {
        "engine": "google_trends",
        "q": keyword,
        "date": timeframe,
        "geo": geo,
        "api_key": SERPAPI_KEY,
        "hl": "en",
    }

    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data
    except requests.RequestException as e:
        return {"error": str(e)}


def _parse_serpapi_result(data: dict, keyword: str) -> dict:
    """SerpAPI 응답에서 필요한 데이터만 추출."""
    if not data or "error" in data:
        return {}

    result = {}

    # Interest over time (시간대별 관심도)
    iot = data.get("interest_over_time", {})
    timeline = iot.get("timeline_data", [])
    current_score = None
    if timeline:
        last = timeline[-1]
        vals = last.get("values", [])
        for v in vals:
            if v.get("query", "").lower() == keyword.lower():
                current_score = v.get("extracted_value")
                break
        if current_score is None and vals:
            current_score = vals[0].get("extracted_value")
    result["current_score"] = current_score
    result["timeline_data"] = timeline

    # Interest by region
    ibr = data.get("interest_by_region", [])
    top_countries = []
    for item in ibr[:20]:
        loc = item.get("location", "")
        vals = item.get("value", [])
        score = 0
        for v in vals:
            score = v.get("extracted_value", 0)
            break
        if score > 0:
            top_countries.append({"country": loc, "score": score})
    result["top_countries"] = top_countries

    # Related queries
    rq = data.get("related_queries", {})
    kw_data = rq.get(keyword, rq.get(keyword.lower(), {}))
    rising_queries = []
    if kw_data:
        rising = kw_data.get("rising", [])
        for r in (rising or [])[:10]:
            rising_queries.append({
                "query": r.get("query", ""),
                "value": r.get("value", ""),
            })
    result["rising_queries"] = rising_queries

    return result


def _serpapi_multi_geo(keyword: str, log_callback=None) -> dict:
    """SerpAPI로 주요 국가별 트렌드 수집."""
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    regions = {
        "전세계": "", "미국": "US", "영국": "GB", "독일": "DE",
        "스페인": "ES", "이탈리아": "IT", "프랑스": "FR",
        "한국": "KR", "일본": "JP",
    }

    results = {}
    for name, geo_code in regions.items():
        log(f"[Google Trends/SerpAPI] {name} 수집 중...")
        data = _serpapi_fetch(keyword, geo=geo_code, timeframe="today 1-m")
        if not data or "error" in data:
            err = data.get("error", "unknown") if data else "no response"
            log(f"[Google Trends/SerpAPI] {name} 오류: {err}")
            results[name] = {"latest_score": 0, "avg_score": 0, "error": err}
        else:
            parsed = _parse_serpapi_result(data, keyword)
            tl = parsed.get("timeline_data", [])
            if tl:
                vals = []
                for t in tl:
                    for v in t.get("values", []):
                        vals.append(v.get("extracted_value", 0))
                latest = vals[-1] if vals else 0
                avg = int(sum(vals) / len(vals)) if vals else 0
            else:
                latest, avg = 0, 0
            results[name] = {"latest_score": latest, "avg_score": avg}
            log(f"[Google Trends/SerpAPI] {name}: 최근={latest}, 평균={avg}")

        time.sleep(1)  # SerpAPI rate limit

    return results


# ──────────────────────────────────────────────
# pytrends 방식 (2순위 fallback)
# ──────────────────────────────────────────────

def _make_pytrends():
    return TrendReq(
        hl="en-US", tz=540, timeout=(15, 40),
        retries=3, backoff_factor=2.0,
        requests_args={"verify": True},
    )


def _build_payload_safe(pytrends, keywords, timeframe, geo, max_retries=3):
    for attempt in range(max_retries):
        try:
            pytrends.build_payload(keywords, cat=0, timeframe=timeframe, geo=geo, gprop="")
            return True
        except Exception as e:
            msg = str(e).lower()
            if "429" in msg or "too many" in msg or "rate" in msg:
                time.sleep((attempt + 1) * 20)
            elif attempt < max_retries - 1:
                time.sleep(8)
            else:
                raise
    return False


def _get_data_safe(fn, max_retries=3):
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:
            msg = str(e).lower()
            if "429" in msg or "too many" in msg or "rate" in msg:
                time.sleep((attempt + 1) * 25)
            elif attempt < max_retries - 1:
                time.sleep(8)
            else:
                raise
    return None


def _pytrends_fetch(keywords, geo, timeframe, log) -> dict | None:
    """pytrends로 Google Trends 수집 (차단 많음, fallback용)."""
    if not PYTRENDS_AVAILABLE:
        log("[Google Trends] pytrends 없음 → pip install pytrends")
        return None

    for attempt in range(3):
        try:
            pt = _make_pytrends()
            _build_payload_safe(pt, keywords, timeframe, geo)
            time.sleep(random.uniform(4, 6))

            iot_df = _get_data_safe(pt.interest_over_time)
            time.sleep(random.uniform(4, 7))

            ibr_df = _get_data_safe(
                lambda: pt.interest_by_region(
                    resolution="COUNTRY", inc_low_vol=False, inc_geo_code=False
                )
            )
            if ibr_df is not None and not ibr_df.empty and keywords[0] in ibr_df.columns:
                ibr_df = ibr_df.sort_values(keywords[0], ascending=False).head(20)
            time.sleep(random.uniform(4, 6))

            related = _get_data_safe(pt.related_queries)

            current_score = None
            if iot_df is not None and not iot_df.empty and keywords[0] in iot_df.columns:
                current_score = int(iot_df[keywords[0]].iloc[-1])

            top_countries = []
            if ibr_df is not None and not ibr_df.empty and keywords[0] in ibr_df.columns:
                for country, row in ibr_df.iterrows():
                    score = int(row[keywords[0]])
                    if score > 0:
                        top_countries.append({"country": country, "score": score})

            rising_queries = []
            if related and keywords[0] in related:
                kd = related[keywords[0]]
                if kd and kd.get("rising") is not None:
                    rd = kd["rising"]
                    if rd is not None and not rd.empty:
                        rising_queries = rd.head(10).to_dict("records")

            log(f"[Google Trends/pytrends] 현재 점수: {current_score}/100")
            return {
                "current_score": current_score,
                "top_countries": top_countries,
                "rising_queries": rising_queries,
                "interest_over_time": iot_df,
                "interest_by_region": ibr_df,
            }

        except Exception as e:
            msg = str(e).lower()
            if "429" in msg or "too many" in msg or "rate" in msg:
                log(f"[Google Trends/pytrends] 429 차단 - {(attempt+1)*20}초 대기...")
                time.sleep((attempt + 1) * 20)
            else:
                log(f"[Google Trends/pytrends] 오류 (시도 {attempt+1}/3): {e}")
                if attempt < 2:
                    time.sleep(10)

    return None


# ──────────────────────────────────────────────
# 공개 인터페이스
# ──────────────────────────────────────────────

def fetch_google_trends(
    keywords: list = None,
    geo: str = "",
    timeframe: str = "today 3-m",
    log_callback=None,
) -> dict:
    """
    Google Trends 데이터 수집.
    SerpAPI 키가 있으면 SerpAPI 우선 사용, 없으면 pytrends fallback.
    """
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    if keywords is None:
        keywords = GOOGLE_TRENDS_KEYWORDS

    # ── 1순위: SerpAPI ──────────────────────
    if SERPAPI_KEY:
        log(f"[Google Trends] SerpAPI로 수집 중: {keywords[0]}")
        raw = _serpapi_fetch(keywords[0], geo=geo, timeframe=timeframe)
        if raw and "error" not in raw:
            parsed = _parse_serpapi_result(raw, keywords[0])
            log(f"[Google Trends] 현재 트렌드 점수: {parsed.get('current_score')}/100 (SerpAPI)")
            return {
                "keyword": keywords[0],
                "current_score": parsed.get("current_score"),
                "timeframe": timeframe,
                "geo": geo if geo else "전세계",
                "top_countries": parsed.get("top_countries", []),
                "rising_queries": parsed.get("rising_queries", []),
                "interest_over_time": None,
                "interest_by_region": None,
                "source": "SerpAPI",
                "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
        else:
            err = raw.get("error", "unknown") if raw else "no response"
            log(f"[Google Trends] SerpAPI 오류: {err} → pytrends로 fallback")
    else:
        log("[Google Trends] SERPAPI_KEY 없음 → pytrends 사용 (차단 가능)")

    # ── 2순위: pytrends fallback ────────────
    result = _pytrends_fetch(keywords, geo, timeframe, log)
    if result:
        return {
            "keyword": keywords[0],
            "timeframe": timeframe,
            "geo": geo if geo else "전세계",
            "source": "pytrends",
            "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            **result,
        }

    return {
        "error": "SerpAPI 키 없음 + pytrends 차단. SERPAPI_KEY를 설정하세요.",
        "keyword": keywords[0] if keywords else "",
        "serpapi_guide": "https://serpapi.com 에서 무료 가입 후 API 키 발급 → .env에 SERPAPI_KEY=... 추가",
    }


def fetch_google_trends_multi_geo(keywords: list = None, log_callback=None) -> dict:
    """주요 국가별 트렌드 수집."""
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    if keywords is None:
        keywords = GOOGLE_TRENDS_KEYWORDS

    keyword = keywords[0]

    # ── 1순위: SerpAPI ──────────────────────
    if SERPAPI_KEY:
        log(f"[Google Trends] SerpAPI 다국가 수집 시작: {keyword}")
        results = _serpapi_multi_geo(keyword, log_callback)
        return {
            "keyword": keyword,
            "by_region": results,
            "source": "SerpAPI",
            "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

    # ── 2순위: pytrends fallback ────────────
    log("[Google Trends] SERPAPI_KEY 없음 → pytrends로 다국가 수집 (차단 위험)")

    regions = {
        "전세계": "", "미국": "US", "영국": "GB", "독일": "DE",
        "스페인": "ES", "이탈리아": "IT", "프랑스": "FR",
        "한국": "KR", "일본": "JP",
    }

    results = {}
    for name, geo_code in regions.items():
        log(f"[Google Trends] {name} 수집 중...")
        for attempt in range(3):
            try:
                pt = _make_pytrends()
                _build_payload_safe(pt, keywords, "today 1-m", geo_code)
                time.sleep(random.uniform(4, 7))

                iot_df = _get_data_safe(pt.interest_over_time)
                if iot_df is not None and not iot_df.empty and keyword in iot_df.columns:
                    score = int(iot_df[keyword].iloc[-1])
                    avg = int(iot_df[keyword].mean())
                else:
                    score, avg = 0, 0

                results[name] = {"latest_score": score, "avg_score": avg}
                log(f"[Google Trends] {name}: 최근={score}, 평균={avg}")
                time.sleep(random.uniform(5, 8))
                break

            except Exception as e:
                msg = str(e).lower()
                if "429" in msg or "too many" in msg or "rate" in msg:
                    wait = (attempt + 1) * 20
                    log(f"[Google Trends] {name} 429 차단 - {wait}초 대기...")
                    time.sleep(wait)
                else:
                    log(f"[Google Trends] {name} 오류: {e}")
                    results[name] = {"latest_score": 0, "avg_score": 0, "error": str(e)}
                    time.sleep(random.uniform(5, 8))
                    break

        if name not in results:
            results[name] = {"latest_score": 0, "avg_score": 0, "error": "max retries"}

    return {
        "keyword": keyword,
        "by_region": results,
        "source": "pytrends",
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
