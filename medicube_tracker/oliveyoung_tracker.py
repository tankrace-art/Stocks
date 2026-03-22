"""Olive Young Global Bestseller Tracker - Selenium primary (React app)"""
import time
import json
import requests
from datetime import datetime
from bs4 import BeautifulSoup

from .config import BRAND_KEYWORDS, HEADERS


BRAND_KW = [kw.lower() for kw in BRAND_KEYWORDS]

_OY_URLS = [
    "https://global.oliveyoung.com/display/page/best-seller",
    "https://global.oliveyoung.com/display/page/best-seller?target=pillsTab1Nav1",
    "https://global.oliveyoung.com/product/lists?cate_no=01",
]

# Olive Young Global API endpoints (React app data source)
_OY_API_URLS = [
    "https://global.oliveyoung.com/api/display/best-seller",
    "https://global.oliveyoung.com/api/product/list?cate_no=01&sort=ranking",
]


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
        options.add_argument("--window-size=1440,900")
        options.add_argument(
            "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)
        options.add_argument("--lang=en-US")

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
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    products = []

    # Updated selectors for Olive Young Global (React app)
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
        "[class*='goods']",
        "article",
        ".result_list_wrap li",
        ".grid_item",
        ".swiper-slide",
        "ul.list_item li",
    ]

    items = []
    for sel in selectors:
        found = soup.select(sel)
        if found and len(found) > 2:
            log(f"[OliveYoung] 셀렉터 '{sel}'로 {len(found)}개 발견")
            items = found
            break

    if not items:
        items = soup.find_all(
            ["li", "div"],
            class_=lambda c: c and any(
                x in " ".join(c if isinstance(c, list) else [c]).lower()
                for x in ["product", "prd", "goods", "item", "card"]
            ),
        )
        if items:
            log(f"[OliveYoung] 대체 파싱: {len(items)}개 발견")

    seen_names = set()
    for rank, item in enumerate(items[:100], 1):
        text = item.get_text(" ", strip=True)
        if not text or len(text) < 5:
            continue

        brand_el = item.find(class_=lambda c: c and "brand" in c.lower())
        brand = brand_el.get_text(strip=True) if brand_el else ""

        name_el = (
            item.find(class_=lambda c: c and any(x in c.lower() for x in ["name", "title", "prd_name", "goods_name"]))
            or item.find(["h2", "h3", "h4", "p"])
        )
        name = name_el.get_text(strip=True) if name_el else text[:80]

        if name in seen_names:
            continue
        seen_names.add(name)

        price_el = item.find(class_=lambda c: c and "price" in c.lower())
        price = price_el.get_text(strip=True) if price_el else ""

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
            log(f"[OliveYoung] 로딩: {url}")
            driver.get(url)

            # Wait for React to render (longer wait)
            time.sleep(8)

            # Multiple scroll passes to trigger lazy-loading
            for _ in range(3):
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight * 0.5);")
                time.sleep(1.5)
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(1.5)
                driver.execute_script("window.scrollTo(0, 0);")
                time.sleep(1)

            soup = BeautifulSoup(driver.page_source, "lxml")
            products = _parse_products_from_soup(soup, log_callback)

            if products:
                log(f"[OliveYoung] 성공: {len(products)}개")
                break

        if not products:
            log("[OliveYoung] 구조 파싱 실패 → 텍스트 검색 시도...")
            try:
                body_text = driver.find_element("tag name", "body").text.lower()
                hits = sum(body_text.count(kw) for kw in BRAND_KW)
                if hits > 0:
                    log(f"[OliveYoung] 페이지에서 'medicube' {hits}회 발견 (구조 파싱 불가)")
            except Exception:
                pass

    except Exception as e:
        log(f"[OliveYoung] Selenium 오류: {e}")
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    return products if products else None


def _fetch_via_requests(log_callback=None) -> list[dict] | None:
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    session = requests.Session()
    headers = {
        **HEADERS,
        "Referer": "https://global.oliveyoung.com/",
        "Accept": "application/json, text/html, */*",
    }
    session.headers.update(headers)

    # Try API endpoints first
    for api_url in _OY_API_URLS:
        try:
            resp = session.get(api_url, timeout=15)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    products = []
                    # Parse JSON structure
                    items = data if isinstance(data, list) else data.get("list", data.get("data", data.get("products", [])))
                    if isinstance(items, list):
                        for rank, item in enumerate(items[:100], 1):
                            name = item.get("goodsName", item.get("name", item.get("goods_name", "")))
                            brand = item.get("brandName", item.get("brand", ""))
                            price = str(item.get("price", item.get("salePrice", "")))
                            text = f"{brand} {name}".lower()
                            is_medicube = any(kw in text for kw in BRAND_KW)
                            products.append({"rank": rank, "brand": brand, "name": name,
                                             "price": price, "url": "", "is_medicube": is_medicube})
                        if products:
                            log(f"[OliveYoung] API 성공: {len(products)}개")
                            return products
                except (json.JSONDecodeError, AttributeError):
                    pass
        except requests.RequestException:
            continue

    # Try HTML pages
    for url in _OY_URLS:
        try:
            resp = session.get(url, timeout=20)
            if resp.status_code != 200:
                continue
            soup = BeautifulSoup(resp.text, "lxml")
            products = _parse_products_from_soup(soup, log_callback)
            if products:
                log(f"[OliveYoung] HTML 성공: {len(products)}개")
                return products
        except requests.RequestException:
            continue

    return None


def fetch_oliveyoung_rankings(log_callback=None) -> dict:
    """
    Fetch Olive Young Global bestseller rankings.
    Uses Selenium (primary - React app), falls back to requests.
    """
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    log("[OliveYoung] 올리브영 글로벌 베스트셀러 수집 중...")

    products = _fetch_via_selenium(log_callback)

    if not products:
        log("[OliveYoung] Selenium 실패 → requests/API 시도...")
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
