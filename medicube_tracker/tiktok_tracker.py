"""TikTok Trend Tracker - Direct TikTok hashtag page scraping via Selenium"""
import time
from datetime import datetime

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.common.exceptions import TimeoutException
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

try:
    from webdriver_manager.chrome import ChromeDriverManager
    WDM_AVAILABLE = True
except ImportError:
    WDM_AVAILABLE = False


TIKTOK_TAG_URL = "https://www.tiktok.com/tag/medicube"


def _create_driver(headless: bool = True):
    """Create a stealth Chrome WebDriver. Returns None on failure."""
    if not SELENIUM_AVAILABLE:
        return None
    try:
        options = Options()
        if headless:
            options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--window-size=1366,768")
        options.add_argument(
            "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        )
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)
        options.add_argument("--disable-extensions")
        options.add_argument("--disable-popup-blocking")

        if WDM_AVAILABLE:
            driver = webdriver.Chrome(
                service=Service(ChromeDriverManager().install()), options=options
            )
        else:
            driver = webdriver.Chrome(options=options)

        # Mask webdriver flag
        driver.execute_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        return driver
    except Exception:
        return None


def _parse_number(text: str):
    """Parse '1.2B', '345K', '12,345' → int. Returns None on failure."""
    if not text:
        return None
    text = text.strip().replace(",", "").replace(" ", "")
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


def fetch_tiktok_trends(log_callback=None, headless: bool = True) -> dict:
    """
    Scrape TikTok hashtag page (#medicube) directly.
    Returns dict with total_views, total_posts, trending_videos.
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    result = {
        "hashtag": "medicube",
        "total_views": None,
        "total_posts": None,
        "trending_videos": [],
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    if not SELENIUM_AVAILABLE:
        log("[TikTok] selenium이 설치되지 않았습니다. pip install selenium webdriver-manager")
        result["error"] = "selenium not installed"
        return result

    driver = _create_driver(headless=headless)
    if driver is None:
        log("[TikTok] Chrome WebDriver를 시작할 수 없습니다.")
        result["error"] = "WebDriver not available"
        return result

    try:
        log(f"[TikTok] 페이지 로딩 중: {TIKTOK_TAG_URL}")
        driver.get(TIKTOK_TAG_URL)
        time.sleep(5)

        # Scroll down to load video cards
        driver.execute_script("window.scrollTo(0, 400);")
        time.sleep(2)

        # ── Try data-e2e attributes (TikTok's stable attribute) ──────────────
        # TikTok uses data-e2e="challenge-vvcount" for view count
        # and data-e2e="challenge-item-count" or similar for post count
        try:
            wait = WebDriverWait(driver, 8)
            # View count
            vv_els = driver.find_elements(By.CSS_SELECTOR, "[data-e2e='challenge-vvcount']")
            for el in vv_els:
                txt = el.text.strip()
                if txt:
                    num = _parse_number(txt.split()[0])
                    if num:
                        result["total_views"] = num
                        log(f"[TikTok] 총 조회수: {num:,}")
                        break

            # Post / video count
            post_els = driver.find_elements(
                By.CSS_SELECTOR,
                "[data-e2e='challenge-video-count'], [data-e2e='challenge-item-count']"
            )
            for el in post_els:
                txt = el.text.strip()
                if txt:
                    num = _parse_number(txt.split()[0])
                    if num:
                        result["total_posts"] = num
                        log(f"[TikTok] 게시물 수: {num:,}")
                        break
        except Exception as e:
            log(f"[TikTok] data-e2e 파싱 오류: {e}")

        # ── Fallback: search all text nodes for large numbers ─────────────────
        if result["total_views"] is None:
            try:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(driver.page_source, "lxml")

                # Look for prominent stat numbers (B/M/K suffixed)
                candidates = []
                for tag in soup.find_all(["strong", "h1", "h2", "span", "p"]):
                    txt = tag.get_text(strip=True)
                    if not txt:
                        continue
                    first_token = txt.split()[0] if txt.split() else ""
                    num = _parse_number(first_token)
                    if num and num >= 10_000:
                        candidates.append((num, txt))

                candidates.sort(key=lambda x: -x[0])
                if candidates:
                    result["total_views"] = candidates[0][0]
                    log(f"[TikTok] 조회수 추정: {candidates[0][0]:,} (텍스트: {candidates[0][1][:30]})")
                if len(candidates) > 1:
                    result["total_posts"] = candidates[1][0]
                    log(f"[TikTok] 게시물 추정: {candidates[1][0]:,}")
            except Exception as e:
                log(f"[TikTok] 대체 파싱 오류: {e}")

        # ── Trending video links ───────────────────────────────────────────────
        try:
            video_links = driver.find_elements(
                By.CSS_SELECTOR,
                "a[href*='/video/'], a[href*='/@']"
            )
            seen = set()
            for el in video_links[:30]:
                href = el.get_attribute("href") or ""
                if "/video/" in href and href not in seen:
                    seen.add(href)
                    result["trending_videos"].append({
                        "url": href,
                        "text": el.text.strip()[:100],
                    })
                    if len(result["trending_videos"]) >= 10:
                        break
        except Exception:
            pass

        views_disp = f"{result['total_views']:,}" if result["total_views"] else "수집 불가"
        posts_disp = f"{result['total_posts']:,}" if result["total_posts"] else "수집 불가"
        log(f"[TikTok] ✅ 완료 - 조회수: {views_disp} / 게시물: {posts_disp}")

    except Exception as e:
        log(f"[TikTok] 오류: {e}")
        result["error"] = str(e)
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    return result
