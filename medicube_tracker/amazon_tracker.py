"""Amazon Beauty Bestseller Tracker - Multi-country, Top 100, with Selenium fallback"""
import time
import random
import requests
from datetime import datetime
from bs4 import BeautifulSoup

from .config import AMAZON_COUNTRIES, APR_BRANDS


# ─── Brand helpers ────────────────────────────────────────────────────────────

BRAND_VARIANTS = {
    "medicube":  ["medicube", "medi cube"],
    "d'alba":    ["d'alba", "d alba", "dalba", "d&#039;alba", "d&apos;alba"],
    "anua":      ["anua"],
    "celimax":   ["celimax"],
    "biodance":  ["biodance", "bio dance"],
}

def _variants(brand: str) -> list:
    return BRAND_VARIANTS.get(brand.lower(), [brand.lower()])


# ─── Selenium driver helper ───────────────────────────────────────────────────

def _make_driver(headless: bool = True):
    """Create a Chrome WebDriver.  Returns None on failure."""
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service

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

        try:
            from webdriver_manager.chrome import ChromeDriverManager
            driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
        except Exception:
            driver = webdriver.Chrome(options=options)

        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        return driver
    except Exception:
        return None


# ─── Requests-based fetch ─────────────────────────────────────────────────────

def _make_headers(country_info: dict) -> dict:
    lang = country_info.get("lang", "en-US,en;q=0.9")
    domain = country_info.get("domain", "amazon.com")
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": lang,
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Referer": f"https://www.{domain}/",
    }


def _is_blocked(html: str) -> bool:
    """Detect Amazon CAPTCHA / bot-protection pages."""
    signals = [
        "api-services-support@amazon.com",
        "Enter the characters you see",
        "Type the characters you see",
        "Sorry, we just need to make sure you're not a robot",
        "automated access",
        "robot check",
    ]
    low = html.lower()
    return any(s.lower() in low for s in signals)


def _extract_products_from_html(html: str) -> list[str]:
    """Return a list of product text strings from the page HTML."""
    soup = BeautifulSoup(html, "lxml")
    product_texts = []

    # Strategy 1: new grid layout (#gridItemRoot)
    grid_items = soup.select("[id^='gridItemRoot']")
    if grid_items:
        for el in grid_items:
            product_texts.append(el.get_text(" ", strip=True))
        return product_texts

    # Strategy 2: old ordered list
    ol = soup.find(id="zg-ordered-list")
    if ol:
        for li in ol.find_all("li"):
            product_texts.append(li.get_text(" ", strip=True))
        if product_texts:
            return product_texts

    # Strategy 3: any element with data-asin
    for el in soup.find_all(attrs={"data-asin": lambda v: v and v.strip()}):
        product_texts.append(el.get_text(" ", strip=True))
    if product_texts:
        return product_texts

    # Strategy 4: .zg-item-immersion class
    for el in soup.select(".zg-item-immersion, .p13n-asin"):
        product_texts.append(el.get_text(" ", strip=True))

    return product_texts


def _count_brands(product_texts: list[str]) -> dict:
    counts = {b: 0 for b in APR_BRANDS}
    for text in product_texts:
        low = text.lower()
        for brand in APR_BRANDS:
            for v in _variants(brand):
                if v in low:
                    counts[brand] += 1
                    break
    return counts


def _page_url(base: str, page: int) -> str:
    """Build the URL for a given bestseller page number."""
    base = base.rstrip("/")
    if page == 1:
        return base + "/"
    return base + f"/ref=zg_bs_pg_{page}?_encoding=UTF8&pg={page}"


def _fetch_via_requests(country_name: str, country_info: dict, log_callback=None) -> dict:
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    session = requests.Session()
    session.headers.update(_make_headers(country_info))
    domain = country_info["domain"]
    base_url = country_info["url"]

    all_texts: list[str] = []
    blocked = False

    for page in [1, 2]:   # Page 1 = items 1-50, Page 2 = items 51-100
        url = _page_url(base_url, page)
        try:
            if page == 1:
                # Warm up session with homepage cookie
                try:
                    session.get(f"https://www.{domain}/", timeout=10)
                    time.sleep(random.uniform(0.8, 1.5))
                except Exception:
                    pass

            resp = session.get(url, timeout=25)

            if resp.status_code != 200:
                log(f"[Amazon {country_name}] 페이지{page} HTTP {resp.status_code} → 건너뜀")
                blocked = True
                break

            if _is_blocked(resp.text):
                log(f"[Amazon {country_name}] 봇 감지 (CAPTCHA) → Selenium 재시도 예정")
                blocked = True
                break

            texts = _extract_products_from_html(resp.text)
            all_texts.extend(texts)
            log(f"[Amazon {country_name}] 페이지{page}: {len(texts)}개 항목 파싱")
            time.sleep(random.uniform(2.0, 3.5))

        except requests.RequestException as e:
            log(f"[Amazon {country_name}] 네트워크 오류: {e}")
            blocked = True
            break

    return {
        "brand_counts": _count_brands(all_texts[:100]),
        "total_items_scanned": min(len(all_texts), 100),
        "blocked": blocked,
    }


def _fetch_via_selenium(country_name: str, country_info: dict, log_callback=None) -> dict:
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    driver = _make_driver(headless=True)
    if driver is None:
        log(f"[Amazon {country_name}] Selenium 드라이버 시작 실패")
        return {"brand_counts": {b: 0 for b in APR_BRANDS}, "total_items_scanned": 0, "blocked": True}

    all_texts: list[str] = []
    try:
        for page in [1, 2]:
            url = _page_url(country_info["url"], page)
            log(f"[Amazon {country_name}] Selenium 페이지{page} 로딩...")
            driver.get(url)
            time.sleep(random.uniform(4, 6))

            # Scroll to trigger lazy-load
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight * 0.5);")
            time.sleep(2)
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)

            html = driver.page_source
            if _is_blocked(html):
                log(f"[Amazon {country_name}] Selenium도 봇 감지됨")
                break

            texts = _extract_products_from_html(html)
            all_texts.extend(texts)
            log(f"[Amazon {country_name}] Selenium 페이지{page}: {len(texts)}개 항목")
            time.sleep(random.uniform(2, 4))
    except Exception as e:
        log(f"[Amazon {country_name}] Selenium 오류: {e}")
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    return {
        "brand_counts": _count_brands(all_texts[:100]),
        "total_items_scanned": min(len(all_texts), 100),
        "blocked": False,
    }


# ─── Public API ───────────────────────────────────────────────────────────────

def fetch_amazon_rankings(countries: dict = None, log_callback=None) -> dict:
    """
    Fetch Amazon beauty bestseller Top 100 for all configured countries.
    Tries requests first; falls back to Selenium when blocked.
    """
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    if countries is None:
        countries = AMAZON_COUNTRIES

    log("[Amazon] 아마존 뷰티 Top 100 수집 시작 (국가별 순차 수집)...")

    raw = {}
    for country_name, country_info in countries.items():
        log(f"[Amazon] ▶ {country_name} 수집 중...")
        result = _fetch_via_requests(country_name, country_info, log_callback)

        if result["blocked"] and result["total_items_scanned"] == 0:
            log(f"[Amazon {country_name}] Selenium으로 재시도 중...")
            result = _fetch_via_selenium(country_name, country_info, log_callback)

        # Show per-brand count
        med_count = result["brand_counts"].get("medicube", 0)
        log(f"[Amazon {country_name}] 완료 - 총 {result['total_items_scanned']}개 / Medicube {med_count}개")
        raw[country_name] = result
        time.sleep(random.uniform(2.0, 3.5))

    # Build brand × country summary
    country_names = list(countries.keys())
    summary: dict[str, dict] = {}
    for brand in APR_BRANDS:
        row: dict = {}
        total = 0
        for cn in country_names:
            count = raw.get(cn, {}).get("brand_counts", {}).get(brand, 0)
            row[cn] = count
            total += count
        row["총합계"] = total
        summary[brand] = row

    log(f"[Amazon] ✅ 완료! Medicube 총합계: {summary.get('medicube', {}).get('총합계', 0)}")

    return {
        "countries": country_names,
        "brands": APR_BRANDS,
        "summary": summary,
        "raw": raw,
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
