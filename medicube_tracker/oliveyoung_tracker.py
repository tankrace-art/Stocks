"""Olive Young Global Bestseller Tracker - Selenium (React app) + requests fallback"""
import time
import requests
from datetime import datetime
from bs4 import BeautifulSoup

from .config import OLIVEYOUNG_URL, BRAND_KEYWORDS, HEADERS


BRAND_KW = [kw.lower() for kw in BRAND_KEYWORDS]

# Olive Young Global URLs to try
_OY_URLS = [
    "https://global.oliveyoung.com/display/page/best-seller",
    "https://global.oliveyoung.com/display/page/best-seller?target=pillsTab1Nav1",
    "https://global.oliveyoung.com/product/lists?cate_no=01",  # category list
]


# ─── Selenium-based fetch (primary - React app) ───────────────────────────────

def _make_driver(headless: bool = True):
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
        options.add_argument("--window-size=1366,900")
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


def _parse_products_from_soup(soup: BeautifulSoup, log_callback=None) -> list[dict]:
    """Parse product items from BeautifulSoup object."""
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    products = []

    # Selector priority list for Olive Young Global
    selectors = [
        ".prd_info",
        ".product-item",
        ".item_product_list li",
        "[class*='ProductCard']",
        "[class*='product-card']",
        "[class*='prd_wrap']",
        ".prd_wrap",
        "li[class*='item']",
        "[class*='product']",
        "article",
    ]

    items = []
    for sel in selectors:
        found = soup.select(sel)
        if found and len(found) > 3:
            log(f"[OliveYoung] 셀렉터 '{sel}'로 {len(found)}개 발견")
            items = found
            break

    if not items:
        # Fallback: any div/li with product-like class names
        items = soup.find_all(
            ["li", "div"],
            class_=lambda c: c and any(
                x in " ".join(c).lower() for x in ["product", "prd", "goods", "item"]
            ),
        )
        if items:
            log(f"[OliveYoung] 대체 파싱: {len(items)}개 발견")

    for rank, item in enumerate(items[:100], 1):
        text = item.get_text(" ", strip=True)
        if not text or len(text) < 5:
            continue

        # Brand
        brand_el = item.find(class_=lambda c: c and "brand" in c.lower())
        brand = brand_el.get_text(strip=True) if brand_el else ""

        # Product name
        name_el = (
            item.find(class_=lambda c: c and any(x in c.lower() for x in ["name", "title", "prd_name"]))
            or item.find(["h2", "h3", "h4", "p", "span"])
        )
        name = name_el.get_text(strip=True) if name_el else text[:80]

        # Price
        price_el = item.find(class_=lambda c: c and "price" in c.lower())
        price = price_el.get_text(strip=True) if price_el else ""

        # URL
        link_el = item.find("a", href=True)
        url = ""
        if link_el:
            url = link_el.get("href", "")
            if url and not url.startswith("http"):
                url = "https://global.oliveyoung.com" + url

        is_medicube = any(kw in text.lower() for kw in BRAND_KW)
        products.append({
            "rank": rank,
            "brand": brand,
            "name": name,
            "price": price,
            "url": url,
            "is_medicube": is_medicube,
        })

    return products


def _fetch_via_selenium(log_callback=None) -> list[dict] | None:
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    driver = _make_driver(headless=True)
    if driver is None:
        log("[OliveYoung] Selenium 드라이버 시작 실패")
        return None

    products = []
    try:
        for url in _OY_URLS:
            log(f"[OliveYoung] Selenium 로딩: {url}")
            driver.get(url)

            # Wait for React to hydrate
            time.sleep(6)

            # Scroll to trigger lazy-load
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight * 0.5);")
            time.sleep(2)
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)
            driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(1)

            soup = BeautifulSoup(driver.page_source, "lxml")
            products = _parse_products_from_soup(soup, log_callback)

            if products:
                log(f"[OliveYoung] Selenium 성공: {len(products)}개")
                break

        if not products:
            # Last resort: full text search in page source
            log("[OliveYoung] 구조 파싱 실패 → 텍스트 검색 시도...")
            body_text = driver.find_element("tag name", "body").text.lower()
            hits = sum(body_text.count(kw) for kw in BRAND_KW)
            if hits > 0:
                log(f"[OliveYoung] 페이지에서 'medicube' {hits}회 발견 (구조 파싱 안됨)")

    except Exception as e:
        log(f"[OliveYoung] Selenium 오류: {e}")
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    return products if products else None


def _fetch_via_requests(log_callback=None) -> list[dict] | None:
    """Try requests+BS4 (works only if Olive Young renders server-side for this path)."""
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    session = requests.Session()
    session.headers.update({
        **HEADERS,
        "Referer": "https://global.oliveyoung.com/",
    })

    for url in _OY_URLS:
        try:
            resp = session.get(url, timeout=20)
            if resp.status_code != 200:
                continue
            soup = BeautifulSoup(resp.text, "lxml")
            products = _parse_products_from_soup(soup, log_callback)
            if products:
                log(f"[OliveYoung] requests 성공: {len(products)}개")
                return products
        except requests.RequestException:
            continue

    return None


# ─── Public API ───────────────────────────────────────────────────────────────

def fetch_oliveyoung_rankings(log_callback=None) -> dict:
    """
    Fetch Olive Young Global bestseller rankings.
    Uses Selenium (primary) since the site is React-rendered.
    Falls back to requests if Selenium is unavailable.
    """
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    log("[OliveYoung] 올리브영 글로벌 베스트셀러 수집 중 (Selenium)...")

    # Try Selenium first (React app needs JS execution)
    products = _fetch_via_selenium(log_callback)

    if not products:
        log("[OliveYoung] Selenium 실패 → requests 시도...")
        products = _fetch_via_requests(log_callback)

    if not products:
        log("[OliveYoung] 데이터 수집 실패")
        return {
            "platform": "Olive Young Global",
            "total_scanned": 0,
            "medicube_count": 0,
            "medicube_products": [],
            "all_products_top20": [],
            "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "error": "scraping failed",
        }

    medicube_products = [p for p in products if p.get("is_medicube")]

    for p in medicube_products:
        log(f"[OliveYoung] ✅ Medicube 발견! 순위 {p['rank']}: {p['name'][:50]}")

    log(f"[OliveYoung] 완료 - 총 {len(products)}개 중 Medicube {len(medicube_products)}개")

    return {
        "platform": "Olive Young Global",
        "total_scanned": len(products),
        "medicube_count": len(medicube_products),
        "medicube_products": medicube_products,
        "all_products_top20": products[:20],
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
