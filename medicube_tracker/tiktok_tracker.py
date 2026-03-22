"""TikTok Trend Tracker via Exolyt.com"""
import time
from datetime import datetime
from typing import Optional

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

try:
    from webdriver_manager.chrome import ChromeDriverManager
    WDM_AVAILABLE = True
except ImportError:
    WDM_AVAILABLE = False

from .config import EXOLYT_EMAIL, EXOLYT_PASSWORD, EXOLYT_HASHTAG_URL, EXOLYT_LOGIN_URL


def _create_driver(headless: bool = True) -> Optional[object]:
    """Create a Chrome WebDriver instance."""
    if not SELENIUM_AVAILABLE:
        return None

    options = Options()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--window-size=1280,900")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    try:
        if WDM_AVAILABLE:
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=options)
        else:
            driver = webdriver.Chrome(options=options)
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        return driver
    except Exception:
        return None


def login_exolyt(driver, log_callback=None) -> bool:
    """Login to exolyt.com with stored credentials."""
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    try:
        log("[TikTok] Exolyt 로그인 시도 중...")
        driver.get(EXOLYT_LOGIN_URL)
        wait = WebDriverWait(driver, 15)

        # Accept cookies if present
        try:
            cookie_btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(),'Accept') or contains(text(),'accept') or contains(text(),'OK')]"))
            )
            cookie_btn.click()
            time.sleep(1)
        except TimeoutException:
            pass

        # Find email field
        email_field = wait.until(EC.presence_of_element_located(
            (By.XPATH, "//input[@type='email' or @name='email' or @placeholder='Email' or contains(@placeholder,'email')]")
        ))
        email_field.clear()
        email_field.send_keys(EXOLYT_EMAIL)
        time.sleep(0.5)

        # Find password field
        pw_field = driver.find_element(
            By.XPATH, "//input[@type='password' or @name='password']"
        )
        pw_field.clear()
        pw_field.send_keys(EXOLYT_PASSWORD)
        time.sleep(0.5)

        # Submit
        submit_btn = driver.find_element(
            By.XPATH, "//button[@type='submit' or contains(text(),'Login') or contains(text(),'로그인') or contains(text(),'Sign in')]"
        )
        submit_btn.click()
        time.sleep(3)

        # Verify login success
        if "login" not in driver.current_url.lower():
            log("[TikTok] 로그인 성공!")
            return True
        else:
            log("[TikTok] 로그인 실패 - URL이 로그인 페이지에 머물러 있습니다.")
            return False

    except Exception as e:
        log(f"[TikTok] 로그인 오류: {e}")
        return False


def _parse_number(text: str) -> Optional[int]:
    """Parse numbers like '1.2M', '345K', '1,234,567'."""
    if not text:
        return None
    text = text.strip().replace(",", "")
    try:
        if text.endswith("B") or text.endswith("b"):
            return int(float(text[:-1]) * 1_000_000_000)
        elif text.endswith("M") or text.endswith("m"):
            return int(float(text[:-1]) * 1_000_000)
        elif text.endswith("K") or text.endswith("k"):
            return int(float(text[:-1]) * 1_000)
        else:
            return int(float(text))
    except ValueError:
        return None


def fetch_tiktok_trends(log_callback=None, headless: bool = True) -> dict:
    """
    Fetch TikTok hashtag statistics for #medicube from exolyt.com.
    Returns dict with views, posts, avg_views, trending_videos etc.
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    if not SELENIUM_AVAILABLE:
        log("[TikTok] selenium이 설치되지 않았습니다. pip install selenium webdriver-manager")
        return {"error": "selenium not installed"}

    driver = _create_driver(headless=headless)
    if driver is None:
        log("[TikTok] Chrome WebDriver를 시작할 수 없습니다. Chrome이 설치되어 있는지 확인하세요.")
        return {"error": "WebDriver not available"}

    result = {
        "hashtag": "medicube",
        "total_views": None,
        "total_posts": None,
        "trending_videos": [],
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    try:
        # Login first
        logged_in = login_exolyt(driver, log_callback)

        # Navigate to hashtag page
        log(f"[TikTok] 해시태그 페이지 로딩: {EXOLYT_HASHTAG_URL}")
        driver.get(EXOLYT_HASHTAG_URL)
        time.sleep(4)

        wait = WebDriverWait(driver, 20)

        # Try to get total views
        selectors_views = [
            "//*[contains(text(),'views') or contains(text(),'Views')]/preceding-sibling::*",
            "//*[contains(@class,'stat') or contains(@class,'metric')]",
            "//*[contains(@class,'views')]",
        ]

        # Scroll down to load content
        driver.execute_script("window.scrollTo(0, 300)")
        time.sleep(2)

        # Extract stats from page
        page_source = driver.page_source

        # Try multiple approaches to find stats
        try:
            stats_elements = driver.find_elements(
                By.XPATH,
                "//*[contains(@class,'stat') or contains(@class,'metric') or contains(@class,'count') or contains(@class,'number')]"
            )
            for el in stats_elements[:20]:
                text = el.text.strip()
                if text and any(c.isdigit() for c in text):
                    log(f"[TikTok] 통계 요소 발견: {text}")
        except Exception:
            pass

        # Try to find hashtag stats directly
        try:
            # Look for the main stats section
            stat_blocks = driver.find_elements(By.CSS_SELECTOR, "[class*='stat'], [class*='metric'], [class*='count']")
            for block in stat_blocks[:10]:
                txt = block.text
                if txt:
                    num = _parse_number(txt.split()[0]) if txt.split() else None
                    if num and num > 1000:
                        if result["total_views"] is None:
                            result["total_views"] = num
                        elif result["total_posts"] is None:
                            result["total_posts"] = num
        except Exception:
            pass

        # Try to find video cards
        try:
            video_elements = driver.find_elements(
                By.XPATH,
                "//a[contains(@href,'tiktok.com') or contains(@href,'/video/')]"
            )
            for el in video_elements[:10]:
                href = el.get_attribute("href") or ""
                text = el.text.strip()
                if href:
                    result["trending_videos"].append({"url": href, "text": text})
        except Exception:
            pass

        # Fallback: try BeautifulSoup on page source
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(page_source, "lxml")

            # Look for numbers in prominent positions
            for tag in soup.find_all(["h1", "h2", "h3", "strong", "b", "span"]):
                text = tag.get_text(strip=True)
                if text and any(c.isdigit() for c in text):
                    num = _parse_number(text.replace(" ", ""))
                    if num and num > 100_000:
                        if "view" in str(tag).lower() or result["total_views"] is None:
                            if result["total_views"] is None:
                                result["total_views"] = num
                                log(f"[TikTok] 총 조회수 (추정): {num:,}")
                            elif result["total_posts"] is None and num < result["total_views"]:
                                result["total_posts"] = num
                                log(f"[TikTok] 총 게시물 수 (추정): {num:,}")
        except Exception:
            pass

        log(f"[TikTok] 데이터 수집 완료 - 조회수: {result['total_views']}, 게시물: {result['total_posts']}")

    except Exception as e:
        log(f"[TikTok] 오류 발생: {e}")
        result["error"] = str(e)
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    return result
