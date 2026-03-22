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


def _dismiss_popups(driver, log):
    """쿠키 동의, GDPR, 닫기 버튼 등 팝업 처리."""
    popup_selectors = [
        # 쿠키 동의
        "button[id*='accept']", "button[class*='accept']",
        "button[id*='cookie']", "button[class*='cookie']",
        "[id*='gdpr'] button", "[class*='gdpr'] button",
        "button[data-cookiefirst-action='accept']",
        ".cc-btn.cc-allow", ".cookie-consent button",
        # 일반 닫기
        "button[aria-label='Close']", "button[aria-label='close']",
        ".modal-close", ".close-btn", "[class*='close'] button",
    ]
    for sel in popup_selectors:
        try:
            els = driver.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if el.is_displayed():
                    driver.execute_script("arguments[0].click();", el)
                    time.sleep(0.5)
        except Exception:
            pass


def _fill_by_js(driver, selector: str, value: str) -> bool:
    """JavaScript로 input에 값 입력 (일반 send_keys가 막힐 때 사용)."""
    try:
        driver.execute_script(
            f"""
            var el = document.querySelector('{selector}');
            if (el) {{
                el.value = arguments[0];
                el.dispatchEvent(new Event('input', {{bubbles:true}}));
                el.dispatchEvent(new Event('change', {{bubbles:true}}));
            }}
            """,
            value,
        )
        return True
    except Exception:
        return False


def _login_exolyt(driver, email: str, password: str, log) -> bool:
    """Log into Exolyt. Returns True if login appears successful."""
    try:
        log(f"[TikTok] Exolyt 로그인 중... ({email})")
        driver.get(EXOLYT_LOGIN_URL)
        time.sleep(5)

        # 팝업(쿠키 동의 등) 먼저 닫기
        _dismiss_popups(driver, log)
        time.sleep(1)

        wait = WebDriverWait(driver, 20)

        # ── 이메일 입력 ───────────────────────────────────
        email_input = None
        email_selectors = [
            "input[type='email']",
            "input[name='email']",
            "input[autocomplete='email']",
            "input[placeholder*='email' i]",
            "input[placeholder*='이메일' i]",
            "#email", "#username",
            "input[name='username']",
            "input[name='login']",
            "form input:first-of-type",
        ]
        for sel in email_selectors:
            try:
                el = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, sel)))
                email_input = el
                log(f"[TikTok] 이메일 필드 발견: {sel}")
                break
            except TimeoutException:
                continue

        if email_input is None:
            # JS fallback: 페이지의 첫 번째 input 사용
            try:
                inputs = driver.find_elements(By.TAG_NAME, "input")
                visible = [i for i in inputs if i.is_displayed() and i.get_attribute("type") != "hidden"]
                if visible:
                    email_input = visible[0]
                    log("[TikTok] 이메일 필드: 첫 번째 visible input 사용")
            except Exception:
                pass

        if email_input is None:
            log("[TikTok] 이메일 입력창을 찾을 수 없습니다.")
            log(f"[TikTok] 현재 URL: {driver.current_url}")
            return False

        try:
            email_input.clear()
            email_input.click()
            time.sleep(0.3)
            email_input.send_keys(email)
        except Exception:
            _fill_by_js(driver, email_selectors[0], email)
        time.sleep(0.5)

        # ── 비밀번호 입력 ─────────────────────────────────
        pwd_input = None
        for sel in ["input[type='password']", "input[name='password']",
                    "input[autocomplete='current-password']", "#password"]:
            try:
                pwd_input = driver.find_element(By.CSS_SELECTOR, sel)
                if pwd_input.is_displayed():
                    log(f"[TikTok] 비밀번호 필드 발견: {sel}")
                    break
            except NoSuchElementException:
                continue

        if pwd_input is None:
            try:
                inputs = driver.find_elements(By.TAG_NAME, "input")
                for inp in inputs:
                    if inp.get_attribute("type") == "password" or inp.is_displayed():
                        # skip the email one
                        if inp != email_input:
                            pwd_input = inp
                            log("[TikTok] 비밀번호 필드: fallback input 사용")
                            break
            except Exception:
                pass

        if pwd_input is None:
            log("[TikTok] 비밀번호 입력창을 찾을 수 없습니다.")
            return False

        try:
            pwd_input.clear()
            pwd_input.click()
            time.sleep(0.3)
            pwd_input.send_keys(password)
        except Exception:
            _fill_by_js(driver, "input[type='password']", password)
        time.sleep(0.5)

        # ── 로그인 버튼 클릭 ──────────────────────────────
        submitted = False
        btn_selectors = [
            "button[type='submit']",
            "input[type='submit']",
            "button[class*='login']", "button[class*='Login']",
            "button[class*='sign']", "button[class*='Sign']",
            "button[class*='submit']",
            "button.btn-primary",
            "form button",
        ]
        for sel in btn_selectors:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, sel)
                if btn.is_displayed():
                    driver.execute_script("arguments[0].click();", btn)
                    submitted = True
                    log(f"[TikTok] 로그인 버튼 클릭: {sel}")
                    break
            except Exception:
                continue

        if not submitted:
            log("[TikTok] 버튼 없음 → Enter 키 입력")
            pwd_input.send_keys(Keys.RETURN)

        time.sleep(8)

        # ── 로그인 결과 확인 ──────────────────────────────
        current_url = driver.current_url.lower()
        log(f"[TikTok] 로그인 후 URL: {current_url}")

        if "login" not in current_url:
            log("[TikTok] Exolyt 로그인 성공!")
            return True

        # 에러 메시지 확인
        try:
            error_els = driver.find_elements(
                By.CSS_SELECTOR,
                ".error, .alert, .alert-danger, [class*='error'], [class*='Error'], [role='alert']"
            )
            for el in error_els:
                msg = el.text.strip()
                if msg:
                    log(f"[TikTok] 로그인 오류 메시지: {msg}")
        except Exception:
            pass

        # URL에 login이 남아있어도 실제로 로그인됐을 수 있음 (일부 SPA)
        try:
            page_text = driver.find_element(By.TAG_NAME, "body").text
            success_hints = ["dashboard", "profile", "logout", "sign out", "my account"]
            if any(h in page_text.lower() for h in success_hints):
                log("[TikTok] 로그인 성공 확인 (페이지 내용 기반)")
                return True
        except Exception:
            pass

        log("[TikTok] 로그인 실패 - URL이 여전히 login 페이지")
        return False

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
