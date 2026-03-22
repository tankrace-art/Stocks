"""TikTok Trend Tracker via TikTok Creative Center (public API, no login required)

Primary  : TikTok Creative Center API (ads.tiktok.com) - 무료, 로그인 불필요
Fallback : Exolyt public hashtag page scraping (Selenium, 로그인 불필요)
"""
import time
import requests
from datetime import datetime

from .config import EXOLYT_HASHTAG_URL, HEADERS

# ── Selenium (Exolyt fallback용) ─────────────────────────────────────────────
try:
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.keys import Keys
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

try:
    import undetected_chromedriver as uc
    UC_AVAILABLE = True
except ImportError:
    UC_AVAILABLE = False

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
except ImportError:
    pass

try:
    from webdriver_manager.chrome import ChromeDriverManager
    WDM_AVAILABLE = True
except ImportError:
    WDM_AVAILABLE = False


# ── TikTok Creative Center API ───────────────────────────────────────────────

_CC_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://ads.tiktok.com/business/creativecenter/hashtag/medicube/pc/en",
    "Origin": "https://ads.tiktok.com",
}

_CC_DETAIL_URL = (
    "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/detail"
    "?period=7&hashtag_name={hashtag}&country_code=&language=en"
)
_CC_SEARCH_URL = (
    "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list"
    "?period=7&page=1&limit=20&order_by=post_num&hashtag_name={hashtag}&country_code=&language=en"
)


def _fetch_creative_center(hashtag: str, log) -> dict:
    """TikTok Creative Center 공개 API로 해시태그 통계 수집."""
    result = {"total_views": None, "total_posts": None, "trending_videos": []}

    session = requests.Session()
    session.headers.update(_CC_HEADERS)

    # ── 1) 상세 정보 API ──────────────────────────────────────────
    try:
        url = _CC_DETAIL_URL.format(hashtag=hashtag)
        log(f"[TikTok] Creative Center API 요청: {hashtag}")
        resp = session.get(url, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            info = (
                data.get("data", {})
                    .get("hashtag_detail_info", {})
            )
            if not info:
                info = data.get("data", {})

            views = info.get("video_views") or info.get("view_count") or info.get("views")
            posts = info.get("publish_cnt") or info.get("post_num") or info.get("posts")

            if views:
                result["total_views"] = int(views)
                log(f"[TikTok] 총 조회수: {result['total_views']:,}")
            if posts:
                result["total_posts"] = int(posts)
                log(f"[TikTok] 게시물 수: {result['total_posts']:,}")

            if result["total_views"] or result["total_posts"]:
                return result
        else:
            log(f"[TikTok] Creative Center detail API 응답: {resp.status_code}")
    except Exception as e:
        log(f"[TikTok] Creative Center detail 오류: {e}")

    # ── 2) 검색 목록 API (fallback) ───────────────────────────────
    try:
        url = _CC_SEARCH_URL.format(hashtag=hashtag)
        resp = session.get(url, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("data", {}).get("list", [])
            for item in items:
                name = (item.get("hashtag_name") or "").lower()
                if hashtag.lower() in name:
                    views = item.get("video_views") or item.get("view_count")
                    posts = item.get("publish_cnt") or item.get("post_num")
                    if views:
                        result["total_views"] = int(views)
                    if posts:
                        result["total_posts"] = int(posts)
                    log(f"[TikTok] 검색 결과 - 조회수: {result['total_views']}, 게시물: {result['total_posts']}")
                    break
        else:
            log(f"[TikTok] Creative Center search API 응답: {resp.status_code}")
    except Exception as e:
        log(f"[TikTok] Creative Center search 오류: {e}")

    return result


# ── Selenium fallback (Exolyt 공개 페이지) ───────────────────────────────────

def _parse_number(text: str):
    if not text:
        return None
    text = text.strip().replace(",", "").replace(" ", "").replace("\xa0", "")
    try:
        if text.upper().endswith("B"):
            return int(float(text[:-1]) * 1_000_000_000)
        if text.upper().endswith("M"):
            return int(float(text[:-1]) * 1_000_000)
        if text.upper().endswith("K"):
            return int(float(text[:-1]) * 1_000)
        return int(float(text))
    except (ValueError, TypeError):
        return None


def _create_driver(headless: bool = False):
    if not SELENIUM_AVAILABLE:
        return None
    if UC_AVAILABLE:
        try:
            options = uc.ChromeOptions()
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--window-size=1366,768")
            options.add_argument("--lang=en-US")
            if headless:
                options.add_argument("--headless=new")
            return uc.Chrome(options=options, use_subprocess=True)
        except Exception:
            pass
    try:
        options = Options()
        if headless:
            options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--window-size=1366,768")
        options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
        options.add_experimental_option("useAutomationExtension", False)
        if WDM_AVAILABLE:
            return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
        return webdriver.Chrome(options=options)
    except Exception:
        return None


def _fetch_exolyt_public(hashtag: str, log, headless: bool = False) -> dict:
    """Exolyt 공개 해시태그 페이지에서 수집 (로그인 불필요)."""
    result = {"total_views": None, "total_posts": None, "trending_videos": []}

    driver = _create_driver(headless=headless)
    if driver is None:
        log("[TikTok] Exolyt fallback: Chrome WebDriver 시작 실패")
        return result

    try:
        url = f"https://exolyt.com/hashtags/{hashtag}"
        log(f"[TikTok] Exolyt 공개 페이지 접근: {url}")
        driver.get(url)
        time.sleep(8)
        driver.execute_script("window.scrollTo(0, 500);")
        time.sleep(2)

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(driver.page_source, "lxml")
        candidates = []

        for tag in soup.find_all(["strong", "span", "h1", "h2", "h3", "p", "div"]):
            txt = tag.get_text(strip=True)
            if not txt or len(txt) > 30:
                continue
            token = txt.split()[0] if txt.split() else txt
            num = _parse_number(token)
            if num and num >= 10_000:
                candidates.append((num, txt))

        candidates.sort(key=lambda x: -x[0])
        log(f"[TikTok] Exolyt 숫자 후보: {candidates[:3]}")

        if candidates:
            result["total_views"] = candidates[0][0]
        if len(candidates) > 1:
            result["total_posts"] = candidates[1][0]
    except Exception as e:
        log(f"[TikTok] Exolyt 공개 페이지 오류: {e}")
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    return result


# ── 공개 진입점 ──────────────────────────────────────────────────────────────

def fetch_tiktok_trends(log_callback=None, headless: bool = False) -> dict:
    """
    TikTok #medicube 해시태그 통계 수집.

    우선순위:
      1) TikTok Creative Center 공개 API (로그인 불필요, 빠름)
      2) Exolyt 공개 해시태그 페이지 scraping (Selenium)
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    hashtag = "medicube"
    result = {
        "hashtag": hashtag,
        "total_views": None,
        "total_posts": None,
        "trending_videos": [],
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": None,
    }

    # ── 1차: TikTok Creative Center API ──────────────────────────
    log("[TikTok] TikTok Creative Center API 시도...")
    cc = _fetch_creative_center(hashtag, log)
    if cc.get("total_views") or cc.get("total_posts"):
        result.update(cc)
        result["source"] = "TikTok Creative Center"
        views_disp = f"{result['total_views']:,}" if result["total_views"] else "N/A"
        posts_disp = f"{result['total_posts']:,}" if result["total_posts"] else "N/A"
        log(f"[TikTok] ✅ 완료 - 조회수: {views_disp} / 게시물: {posts_disp}")
        return result

    log("[TikTok] Creative Center API 데이터 없음 → Exolyt 공개 페이지 시도...")

    # ── 2차: Exolyt 공개 페이지 (Selenium) ───────────────────────
    if SELENIUM_AVAILABLE:
        ex = _fetch_exolyt_public(hashtag, log, headless=headless)
        if ex.get("total_views") or ex.get("total_posts"):
            result.update(ex)
            result["source"] = "Exolyt (public)"
            views_disp = f"{result['total_views']:,}" if result["total_views"] else "N/A"
            posts_disp = f"{result['total_posts']:,}" if result["total_posts"] else "N/A"
            log(f"[TikTok] ✅ Exolyt 완료 - 조회수: {views_disp} / 게시물: {posts_disp}")
            return result

    log("[TikTok] ⚠️ 모든 소스에서 데이터 수집 실패 (네트워크/차단 확인)")
    result["error"] = "all sources failed"
    return result
