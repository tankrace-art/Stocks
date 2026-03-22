"""TikTok Trend Tracker via Exolyt.com (logged-in analytics)"""
import time
from datetime import datetime

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.keys import Keys
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

try:
    from webdriver_manager.chrome import ChromeDriverManager
    WDM_AVAILABLE = True
except ImportError:
    WDM_AVAILABLE = False

from .config import EXOLYT_EMAIL, EXOLYT_PASSWORD, EXOLYT_LOGIN_URL, EXOLYT_HASHTAG_URL


def _create_driver(headless: bool = True):
    """Create a stealth Chrome WebDriver."""
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


def _login_exolyt(driver, email: str, password: str, log) -> bool:
    """Log into Exolyt. Returns True if login appears successful."""
    try:
        log(f"[TikTok] Exolyt 로그인 중... ({email})")
        driver.get(EXOLYT_LOGIN_URL)
        time.sleep(4)

        wait = WebDriverWait(driver, 15)

        # Find email field
        email_input = None
        for sel in ["input[type='email']", "input[name='email']",
                    "input[placeholder*='email' i]", "#email", "input[name='username']"]:
            try:
                email_input = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, sel)))
                break
            except TimeoutException:
                continue

        if email_input is None:
            log("[TikTok] 이메일 입력창을 찾을 수 없습니다.")
            return False

        email_input.clear()
        email_input.send_keys(email)
        time.sleep(0.5)

        # Find password field
        pwd_input = None
        for sel in ["input[type='password']", "input[name='password']", "#password"]:
            try:
                pwd_input = driver.find_element(By.CSS_SELECTOR, sel)
                break
            except NoSuchElementException:
                continue

        if pwd_input is None:
            log("[TikTok] 비밀번호 입력창을 찾을 수 없습니다.")
            return False

        pwd_input.clear()
        pwd_input.send_keys(password)
        time.sleep(0.5)

        # Submit form
        submitted = False
        for sel in ["button[type='submit']", "button.login-btn", "input[type='submit']",
                    "button.btn-primary", "button.sign-in"]:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, sel)
                btn.click()
                submitted = True
                break
            except Exception:
                continue

        if not submitted:
            pwd_input.send_keys(Keys.RETURN)

        time.sleep(6)

        # Check login result
        current_url = driver.current_url.lower()
        if "login" not in current_url:
            log("[TikTok] Exolyt 로그인 성공!")
            return True

        # Check for error message
        try:
            error_els = driver.find_elements(By.CSS_SELECTOR, ".error, .alert-danger, [class*='error']")
            if error_els:
                for el in error_els:
                    msg = el.text.strip()
                    if msg:
                        log(f"[TikTok] 로그인 오류: {msg}")
                return False
        except Exception:
            pass

        log("[TikTok] 로그인 상태 확인 중 - 계속 진행합니다.")
        return True

    except Exception as e:
        log(f"[TikTok] 로그인 오류: {e}")
        return False


def _scrape_hashtag_page(driver, log) -> dict:
    """Scrape stats from Exolyt hashtag page."""
    result = {
        "total_views": None,
        "total_posts": None,
        "trending_videos": [],
    }

    try:
        log(f"[TikTok] 해시태그 페이지 로딩: {EXOLYT_HASHTAG_URL}")
        driver.get(EXOLYT_HASHTAG_URL)
        time.sleep(7)

        # Scroll to trigger dynamic loading
        driver.execute_script("window.scrollTo(0, 500);")
        time.sleep(2)
        driver.execute_script("window.scrollTo(0, 0);")
        time.sleep(1)

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(driver.page_source, "lxml")

        # ── Strategy 1: look for stat cards/boxes with numeric values ──
        candidates = []

        stat_selectors = [
            ".stat-value", ".stats-value", ".metric-value", ".stat-count",
            "[class*='stat'] strong", "[class*='count'] span",
            "[class*='view'] strong", "[class*='video'] strong",
            ".info-value", ".data-value", ".number", "strong",
            "[class*='analytics'] span", "[class*='hashtag'] span",
            ".card-value", ".total", "h2 span", "h3 span",
        ]

        for sel in stat_selectors:
            for el in soup.select(sel):
                txt = el.get_text(strip=True)
                if not txt:
                    continue
                first_token = txt.split()[0] if txt.split() else txt
                num = _parse_number(first_token)
                if num and num >= 1000:
                    label_el = el.find_parent()
                    label = label_el.get_text(strip=True)[:50] if label_el else txt
                    candidates.append((num, label))

        # ── Strategy 2: generic large numbers in the page ──
        if not candidates:
            for tag in soup.find_all(["strong", "h1", "h2", "h3", "span", "p", "div"]):
                txt = tag.get_text(strip=True)
                if not txt or len(txt) > 30:
                    continue
                first_token = txt.split()[0] if txt.split() else txt
                num = _parse_number(first_token)
                if num and num >= 10_000:
                    candidates.append((num, txt))

        candidates.sort(key=lambda x: -x[0])
        log(f"[TikTok] 발견된 숫자 후보: {candidates[:5]}")

        if candidates:
            result["total_views"] = candidates[0][0]
            log(f"[TikTok] 총 조회수: {candidates[0][0]:,}")
        if len(candidates) > 1:
            result["total_posts"] = candidates[1][0]
            log(f"[TikTok] 영상/게시물: {candidates[1][0]:,}")

        # ── Trending video links ──
        try:
            for el in driver.find_elements(By.CSS_SELECTOR, "a[href*='tiktok.com/']"):
                href = el.get_attribute("href") or ""
                if href and "/video/" in href:
                    result["trending_videos"].append({
                        "url": href,
                        "text": el.text.strip()[:100],
                    })
                    if len(result["trending_videos"]) >= 10:
                        break
        except Exception:
            pass

    except Exception as e:
        log(f"[TikTok] 페이지 파싱 오류: {e}")

    return result


def fetch_tiktok_trends(log_callback=None, headless: bool = True) -> dict:
    """
    Fetch TikTok #medicube hashtag analytics via Exolyt.com.
    Logs into Exolyt with configured credentials and scrapes hashtag stats.
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
        if not EXOLYT_EMAIL or not EXOLYT_PASSWORD:
            log("[TikTok] config.py에 Exolyt 이메일/비밀번호가 설정되지 않았습니다.")
            result["error"] = "no credentials"
            return result

        login_ok = _login_exolyt(driver, EXOLYT_EMAIL, EXOLYT_PASSWORD, log)
        if not login_ok:
            log("[TikTok] ❌ Exolyt 로그인 실패. 이메일/비밀번호를 확인하세요.")
            result["error"] = "login failed"
            return result

        stats = _scrape_hashtag_page(driver, log)
        result["total_views"] = stats["total_views"]
        result["total_posts"] = stats["total_posts"]
        result["trending_videos"] = stats["trending_videos"]

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
