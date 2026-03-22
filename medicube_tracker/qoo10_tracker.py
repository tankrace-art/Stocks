"""Qoo10 Japan Bestseller Tracker - Selenium primary, requests fallback"""
import time
import random
import requests
from datetime import datetime
from urllib.parse import unquote
from bs4 import BeautifulSoup

from .config import QOO10_URLS, BRAND_KEYWORDS, ANUA_KEYWORDS, HEADERS


BRAND_KW = [kw.lower() for kw in BRAND_KEYWORDS]
ANUA_KW = [kw.lower() for kw in ANUA_KEYWORDS]

_BEAUTY_URLS = [
    "https://www.qoo10.jp/gmkt.inc/BestSellers/?g=2",
    "https://www.qoo10.jp/gmkt.inc/BestSellers/?g=28000",
    "https://www.qoo10.jp/gmkt.inc/BestSellers/",
]

_HEADERS = {
    **HEADERS,
    "Accept-Language": "ja-JP,ja;q=0.9,ko;q=0.8,en;q=0.7",
    "Referer": "https://www.qoo10.jp/",
}

# --- Brand detection helpers -------------------------------------------------

def _check_brand(text: str, url: str = "") -> tuple[bool, bool]:
    """Return (is_medicube, is_anua) by checking text + URL-decoded slug."""
    url_decoded = _slug_from_url(url).lower()
    combined = f"{text.lower()} {url_decoded}"
    return (
        any(kw in combined for kw in BRAND_KW),
        any(kw in combined for kw in ANUA_KW),
    )


def _slug_from_url(url: str) -> str:
    """URL-decode the Qoo10 item slug to get a human-readable product name."""
    if "/item/" not in url:
        return ""
    try:
        raw = url.split("/item/")[-1].split("?")[0].split("/")[0]
        return unquote(raw).replace("-", " ").replace("_", " ").strip()
    except Exception:
        return ""


def _is_product_url(href: str) -> bool:
    """True only for real /item/ product links (not category nav)."""
    return "/item/" in href and "BestSellers" not in href and href.count("?g=") == 0


# --- Chrome driver -----------------------------------------------------------

def _make_driver():
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service

        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--window-size=1366,768")
        options.add_argument(
            "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)
        options.add_argument("--lang=ja-JP")

        try:
            from webdriver_manager.chrome import ChromeDriverManager
            driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
        except Exception:
            driver = webdriver.Chrome(options=options)

        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        return driver
    except Exception:
        return None


# --- HTML parsing ------------------------------------------------------------

def _extract_item_from_link(a_tag) -> dict | None:
    """
    Given an <a> element pointing to a /item/ URL, extract:
    - href → canonical URL
    - name: from parent container text > URL slug
    - price: from nearby price element
    """
    href = a_tag.get("href", "")
    if not href.startswith("http"):
        href = "https://www.qoo10.jp" + href

    slug_name = _slug_from_url(href)

    # Walk up DOM to find a container holding the product name
    parent = a_tag.parent
    for _ in range(4):
        if parent is None:
            break
        candidate = parent.get_text(" ", strip=True)
        # If parent text is longer than just a rank number, use it as base text
        if len(candidate) > 5 and not candidate.strip().isdigit():
            break
        parent = parent.parent if hasattr(parent, "parent") else None

    container_text = parent.get_text(" ", strip=True) if parent else ""

    # Try to find a dedicated name element inside the container
    name_el = None
    if parent:
        name_el = (
            parent.find(class_=lambda c: c and any(
                x in c.lower() for x in ["name", "title", "goods_nm", "subject", "prd_name", "item_name"]
            ))
            or parent.find(["h2", "h3", "h4", "strong"])
        )
    name = name_el.get_text(strip=True) if name_el else ""

    # Fall back to URL slug if name is too short or just digits
    if not name or name.isdigit() or len(name) < 3:
        name = slug_name or container_text[:80]

    # Price
    price = ""
    if parent:
        price_el = parent.find(class_=lambda c: c and "price" in c.lower())
        if price_el:
            price = price_el.get_text(strip=True)

    return {
        "name": name.strip()[:100],
        "url": href,
        "price": price,
        "container_text": container_text,
        "slug_name": slug_name,
    }


def _parse_products(html: str, log_callback=None) -> list[dict]:
    def log(m):
        if log_callback:
            log_callback(m)
        else:
            print(m)

    soup = BeautifulSoup(html, "lxml")
    products = []

    # ── Strategy 1: CSS selectors for product containers ─────────────────────
    selectors = [
        "ul.best_list li",
        "ul.list_goods li",
        ".best_item",
        ".goods_item",
        ".ranking_item",
        ".item_area",
        "[class*='ranking'] li",
        "li[class*='item']",
        ".goods_wrap li",
        "#bestRankList li",
        ".rank_list li",
        ".prd_list li",
        "ul.rank li",
        "[class*='best_prd'] li",
        "[class*='bestPrd'] li",
    ]

    container_items = []
    for sel in selectors:
        found = soup.select(sel)
        # Must have a /item/ link inside to be a real product
        valid = [el for el in found if el.find("a", href=lambda h: h and "/item/" in h)]
        if valid and len(valid) > 1:
            log(f"[Qoo10] 셀렉터 '{sel}'로 {len(valid)}개 상품 컨테이너 발견")
            container_items = valid
            break

    if container_items:
        for rank, item in enumerate(container_items[:100], 1):
            text = item.get_text(" ", strip=True)
            if not text or len(text) < 2:
                continue

            link_el = item.find("a", href=lambda h: h and "/item/" in h)
            if not link_el:
                continue

            href = link_el.get("href", "")
            if not href.startswith("http"):
                href = "https://www.qoo10.jp" + href

            slug_name = _slug_from_url(href)

            name_el = (
                item.find(class_=lambda c: c and any(
                    x in c.lower() for x in ["name", "title", "goods_nm", "subject", "prd_name"]
                ))
                or item.find(["h2", "h3", "h4", "strong"])
            )
            name = name_el.get_text(strip=True) if name_el else ""
            if not name or name.isdigit() or len(name) < 3:
                name = slug_name or text[:80]

            price_el = item.find(class_=lambda c: c and "price" in c.lower())
            price = price_el.get_text(strip=True) if price_el else ""

            combined = f"{text} {slug_name}".lower()
            is_medicube = any(kw in combined for kw in BRAND_KW)
            is_anua = any(kw in combined for kw in ANUA_KW)

            products.append({
                "rank": rank,
                "name": name.strip()[:100],
                "price": price,
                "url": href,
                "is_medicube": is_medicube,
                "is_anua": is_anua,
            })

        if products:
            log(f"[Qoo10] 컨테이너 방식: {len(products)}개 상품 파싱")
            return products

    # ── Strategy 2: collect all /item/ links directly ────────────────────────
    product_links = [
        a for a in soup.find_all("a", href=True)
        if _is_product_url(a.get("href", ""))
    ]

    # Deduplicate by href
    seen_hrefs: set[str] = set()
    unique_links = []
    for a in product_links:
        h = a.get("href", "")
        if h not in seen_hrefs:
            seen_hrefs.add(h)
            unique_links.append(a)

    if unique_links:
        log(f"[Qoo10] 링크 방식으로 {len(unique_links)}개 /item/ 링크 발견")
        for rank, a_tag in enumerate(unique_links[:100], 1):
            info = _extract_item_from_link(a_tag)
            if not info:
                continue
            combined = f"{info['container_text']} {info['slug_name']}".lower()
            is_medicube = any(kw in combined for kw in BRAND_KW)
            is_anua = any(kw in combined for kw in ANUA_KW)
            products.append({
                "rank": rank,
                "name": info["name"],
                "price": info["price"],
                "url": info["url"],
                "is_medicube": is_medicube,
                "is_anua": is_anua,
            })

        if products:
            return products

    # ── Last resort: log what's on the page ──────────────────────────────────
    page_text = soup.get_text().lower()
    for brand, kws in [("medicube", BRAND_KW), ("anua", ANUA_KW)]:
        hits = sum(page_text.count(kw) for kw in kws)
        if hits > 0:
            log(f"[Qoo10] 페이지 텍스트에서 '{brand}' {hits}회 발견 (구조 파싱 불가)")
    return []


# --- Selenium / requests drivers --------------------------------------------

def _scroll_and_parse(driver, url: str, log_callback=None) -> list[dict]:
    def log(m):
        if log_callback:
            log_callback(m)
        else:
            print(m)

    driver.get(url)
    time.sleep(random.uniform(5, 7))

    # Incremental scroll to load lazy items
    for step in range(1, 10):
        driver.execute_script(f"window.scrollTo(0, document.body.scrollHeight * {step / 9});")
        time.sleep(0.6)
    time.sleep(2)

    products = _parse_products(driver.page_source, log_callback)

    # If still empty, try waiting longer (JS may be slow)
    if not products:
        time.sleep(4)
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(2)
        products = _parse_products(driver.page_source, log_callback)

    return products


def _fetch_via_selenium(log_callback=None) -> list[dict] | None:
    def log(m):
        if log_callback:
            log_callback(m)
        else:
            print(m)

    driver = _make_driver()
    if driver is None:
        log("[Qoo10] Selenium 드라이버 시작 실패")
        return None

    all_products: list[dict] = []
    try:
        for base_url in _BEAUTY_URLS:
            for page_num in range(1, 4):
                url = base_url if page_num == 1 else f"{base_url}&page={page_num}"
                log(f"[Qoo10] 페이지 {page_num} 로딩: {url}")
                products = _scroll_and_parse(driver, url, log_callback)

                if products:
                    offset = len(all_products)
                    for p in products:
                        p["rank"] = offset + p["rank"]
                    all_products.extend(products)
                    log(f"[Qoo10] 페이지 {page_num}: {len(products)}개 (누적: {len(all_products)}개)")
                else:
                    log(f"[Qoo10] 페이지 {page_num} 항목 없음 - 다음 URL 시도")
                    break

                if len(all_products) >= 100:
                    break
                time.sleep(random.uniform(2, 3))

            if all_products:
                break

        if all_products:
            return all_products[:100]

        # 최후 수단: 메디큐브/아누아 직접 검색
        for kw in ["medicube", "anua"]:
            log(f"[Qoo10] 직접 검색 시도: {kw}")
            search_url = f"https://www.qoo10.jp/sr/SearchResult.aspx?keyword={kw}&sort=W"
            products = _scroll_and_parse(driver, search_url, log_callback)
            if products:
                log(f"[Qoo10] '{kw}' 검색 결과: {len(products)}개")
                all_products.extend(products)

        if all_products:
            return all_products[:100]

    except Exception as e:
        log(f"[Qoo10] Selenium 오류: {e}")
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    return all_products if all_products else None


def _fetch_via_requests(log_callback=None) -> list[dict] | None:
    def log(m):
        if log_callback:
            log_callback(m)
        else:
            print(m)

    session = requests.Session()
    session.headers.update(_HEADERS)
    all_products: list[dict] = []

    for base_url in _BEAUTY_URLS:
        for page_num in range(1, 4):
            url = base_url if page_num == 1 else f"{base_url}&page={page_num}"
            log(f"[Qoo10] requests 페이지{page_num}: {url}")
            try:
                resp = session.get(url, timeout=20)
                if resp.status_code != 200:
                    log(f"[Qoo10] HTTP {resp.status_code}")
                    break

                products = _parse_products(resp.text, log_callback)
                if products:
                    offset = len(all_products)
                    for p in products:
                        p["rank"] = offset + p["rank"]
                    all_products.extend(products)
                    log(f"[Qoo10] 페이지{page_num}: {len(products)}개 (누적: {len(all_products)}개)")
                else:
                    break

                if len(all_products) >= 100:
                    break
                time.sleep(random.uniform(1, 2))

            except requests.RequestException as e:
                log(f"[Qoo10] 네트워크 오류: {e}")
                break

        if all_products:
            return all_products[:100]

    return None


# --- Public API --------------------------------------------------------------

def fetch_qoo10_rankings(log_callback=None) -> dict:
    """
    Fetch Qoo10 Japan beauty bestseller rankings.
    Uses Selenium as primary (JavaScript rendering), falls back to requests.
    """
    def log(m):
        if log_callback:
            log_callback(m)
        else:
            print(m)

    log("[Qoo10] 큐텐재팬 뷰티 베스트셀러 수집 중...")

    products = _fetch_via_selenium(log_callback)

    if not products:
        log("[Qoo10] Selenium 실패 → requests 재시도...")
        products = _fetch_via_requests(log_callback)

    if not products:
        log("[Qoo10] 데이터 수집 실패")
        return {
            "platform": "Qoo10 Japan",
            "category": "뷰티",
            "total_scanned": 0,
            "medicube_count": 0,
            "medicube_products": [],
            "anua_count": 0,
            "anua_products": [],
            "all_products_top20": [],
            "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "error": "scraping failed",
        }

    medicube_products = [p for p in products if p.get("is_medicube")]
    anua_products = [p for p in products if p.get("is_anua")]

    for p in medicube_products:
        log(f"[Qoo10] ✅ Medicube 발견! 순위 {p['rank']}: {p['name'][:60]}")
    for p in anua_products:
        log(f"[Qoo10] ✅ Anua 발견! 순위 {p['rank']}: {p['name'][:60]}")

    log(f"[Qoo10] 완료 - 총 {len(products)}개 중 Medicube {len(medicube_products)}개 / Anua {len(anua_products)}개")

    return {
        "platform": "Qoo10 Japan",
        "category": "뷰티",
        "total_scanned": len(products),
        "medicube_count": len(medicube_products),
        "medicube_products": medicube_products,
        "anua_count": len(anua_products),
        "anua_products": anua_products,
        "all_products_top20": products[:20],
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
