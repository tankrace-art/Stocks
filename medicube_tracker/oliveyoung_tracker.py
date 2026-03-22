"""Olive Young Global Bestseller Tracker - Selenium primary (React app)"""
import time
import json
import requests
from datetime import datetime
from bs4 import BeautifulSoup

from .config import BRAND_KEYWORDS, ANUA_KEYWORDS, HEADERS, MEDICUBE_PRODUCT_KW, ANUA_PRODUCT_KW


BRAND_KW = [kw.lower() for kw in BRAND_KEYWORDS]
ANUA_KW = [kw.lower() for kw in ANUA_KEYWORDS]
MED_PROD_KW = [kw.lower() for kw in MEDICUBE_PRODUCT_KW]
ANUA_PROD_KW = [kw.lower() for kw in ANUA_PRODUCT_KW]

_OY_URLS = [
    "https://global.oliveyoung.com/display/page/best-seller",
    "https://global.oliveyoung.com/display/page/best-seller?target=pillsTab1Nav1",
    "https://global.oliveyoung.com/product/lists?cate_no=01",
]

# Olive Young Global API endpoints (React app data source)
_OY_API_URLS = [
    "https://global.oliveyoung.com/api/display/best-seller",
    "https://global.oliveyoung.com/api/product/list?cate_no=01&sort=ranking",
    "https://global.oliveyoung.com/api/v1/product/best-seller?page=1&size=100",
    "https://global.oliveyoung.com/api/product/bestList?pageIndex=1&pageUnit=100",
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


def _brand_check(item, url: str = "") -> tuple[str, bool, bool]:
    """
    Check if item element contains Medicube or Anua.
    Searches: visible text, data-* attributes, img alt texts, and URL.
    Returns: (brand_name, is_medicube, is_anua)
    """
    parts: list[str] = [item.get_text(" ", strip=True).lower()]

    # data-* attributes (e.g. data-brand, data-brand-name)
    if hasattr(item, "attrs"):
        for val in item.attrs.values():
            if isinstance(val, str):
                parts.append(val.lower())
            elif isinstance(val, list):
                parts.extend(v.lower() for v in val if isinstance(v, str))

    # image alt texts (product images often contain product/brand name)
    for img in item.find_all("img", alt=True):
        parts.append(img.get("alt", "").lower())

    # product URL slug
    parts.append(url.lower())

    combined = " ".join(parts)
    is_medicube = (
        any(kw in combined for kw in BRAND_KW)
        or any(kw in combined for kw in MED_PROD_KW)
    )
    is_anua = (
        any(kw in combined for kw in ANUA_KW)
        or any(kw in combined for kw in ANUA_PROD_KW)
    )

    # Try to get an explicit brand element
    brand_el = item.find(class_=lambda c: c and "brand" in c.lower())
    brand = brand_el.get_text(strip=True) if brand_el else ""
    if not brand:
        if is_medicube:
            brand = "Medicube"
        elif is_anua:
            brand = "ANUA"

    return brand, is_medicube, is_anua


def _parse_products_from_soup(soup: BeautifulSoup, log_callback=None) -> list[dict]:
    def log(m):
        if log_callback:
            log_callback(m)
        else:
            print(m)

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

    seen_names: set[str] = set()
    real_rank = 0
    for item in items[:200]:
        text = item.get_text(" ", strip=True)
        if not text or len(text) < 5:
            continue

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

        brand, is_medicube, is_anua = _brand_check(item, url)

        real_rank += 1
        if real_rank <= 3:
            log(f"[OliveYoung] 샘플 상품 {real_rank}: brand={brand!r} name={name[:50]!r}")

        products.append({
            "rank": real_rank,
            "brand": brand,
            "name": name,
            "price": price,
            "url": url,
            "is_medicube": is_medicube,
            "is_anua": is_anua,
        })

    return products



def _scroll_load_all(driver, max_scrolls: int = 15) -> None:
    """Scroll page multiple times to trigger lazy-loading of all items."""
    last_count = 0
    for i in range(max_scrolls):
        # 점진적 스크롤
        driver.execute_script(
            f"window.scrollTo(0, document.body.scrollHeight * {(i + 1) / max_scrolls});"
        )
        time.sleep(0.8)

        # 새 항목이 더 이상 안 나타나면 멈춤
        current_height = driver.execute_script("return document.body.scrollHeight")
        if i > 5 and current_height == last_count:
            break
        last_count = current_height

    # 마지막으로 맨 아래까지
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(2)


def _click_more_button(driver, log) -> bool:
    """'더보기' 또는 'Load More' 버튼 클릭. 클릭 성공시 True."""
    try:
        from selenium.webdriver.common.by import By
        selectors = [
            "button[class*='more']", "button[class*='More']",
            "a[class*='more']", ".btn_more", ".load-more",
            "button[class*='load']", "[class*='view-more']",
            "button:contains('더보기')", "button:contains('More')",
        ]
        for sel in selectors:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, sel)
                if btn.is_displayed():
                    driver.execute_script("arguments[0].click();", btn)
                    time.sleep(3)
                    log(f"[OliveYoung] '더보기' 버튼 클릭 ({sel})")
                    return True
            except Exception:
                continue
    except Exception:
        pass
    return False


def _fetch_via_selenium(log_callback=None) -> list[dict] | None:
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    driver = _make_driver(headless=True)
    if driver is None:
        log("[OliveYoung] Selenium 드라이버 시작 실패")
        return None

    all_products = []
    try:
        for url in _OY_URLS[:2]:
            log(f"[OliveYoung] 로딩: {url}")
            driver.get(url)
            time.sleep(8)  # React 렌더링 대기

            # 최대 5회 더보기 클릭 + 스크롤 반복으로 100개 확보
            for attempt in range(5):
                _scroll_load_all(driver, max_scrolls=15)

                soup = BeautifulSoup(driver.page_source, "lxml")
                products = _parse_products_from_soup(soup, log_callback)

                if products:
                    all_products = products
                    log(f"[OliveYoung] {len(products)}개 로드됨 (시도 {attempt+1})")

                    if len(products) >= 95:
                        break

                    # 더보기 버튼 클릭
                    clicked = _click_more_button(driver, log)
                    if not clicked:
                        break
                else:
                    break

            if all_products:
                log(f"[OliveYoung] 최종 {len(all_products)}개 수집")
                break

        if not all_products:
            log("[OliveYoung] 구조 파싱 실패 → 텍스트 검색 시도...")
            try:
                body_text = driver.find_element("tag name", "body").text.lower()
                hits_med = sum(body_text.count(kw) for kw in BRAND_KW)
                hits_anua = sum(body_text.count(kw) for kw in ANUA_KW)
                if hits_med > 0:
                    log(f"[OliveYoung] 페이지에서 'medicube' {hits_med}회 발견 (구조 파싱 불가)")
                if hits_anua > 0:
                    log(f"[OliveYoung] 페이지에서 'anua' {hits_anua}회 발견 (구조 파싱 불가)")
            except Exception:
                pass

    except Exception as e:
        log(f"[OliveYoung] Selenium 오류: {e}")
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    return all_products[:100] if all_products else None


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
                            tl = text.lower()
                            is_medicube = any(kw in tl for kw in BRAND_KW)
                            is_anua = any(kw in tl for kw in ANUA_KW)
                            products.append({"rank": rank, "brand": brand, "name": name,
                                             "price": price, "url": "", "is_medicube": is_medicube, "is_anua": is_anua})
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
    anua_products = [p for p in products if p.get("is_anua")]

    for p in medicube_products:
        log(f"[OliveYoung] ✅ Medicube 발견! 순위 {p['rank']}: {p['name'][:50]}")
    for p in anua_products:
        log(f"[OliveYoung] ✅ Anua 발견! 순위 {p['rank']}: {p['name'][:50]}")

    log(f"[OliveYoung] 완료 - 총 {len(products)}개 중 Medicube {len(medicube_products)}개 / Anua {len(anua_products)}개")

    return {
        "platform": "Olive Young Global",
        "total_scanned": len(products),
        "medicube_count": len(medicube_products),
        "medicube_products": medicube_products,
        "anua_count": len(anua_products),
        "anua_products": anua_products,
        "all_products_top20": products[:20],
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
