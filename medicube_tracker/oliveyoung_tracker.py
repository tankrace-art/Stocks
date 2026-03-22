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
        if not text or len(text) < 8:
            continue
        # Skip navigation / UI elements
        text_lower = text.lower()
        if any(phrase in text_lower for phrase in _NAV_PHRASES):
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


def _extract_nextjs_data(driver, log) -> list[dict]:
    """
    Pull product list from Next.js __NEXT_DATA__ embedded JSON.
    Returns list of {rank, brand, name, url} or [].
    """
    try:
        raw = driver.execute_script("return JSON.stringify(window.__NEXT_DATA__ || null)")
        if not raw or raw == "null":
            return []
        import json as _json
        nd = _json.loads(raw)
        log(f"[OliveYoung] __NEXT_DATA__ 발견! 최상위 키: {list(nd.keys())[:6]}")

        # Walk all nested structures to find arrays that look like product lists
        def find_product_arrays(obj, depth=0):
            """Recursively find arrays of objects that look like products."""
            if depth > 8:
                return []
            results = []
            if isinstance(obj, list) and len(obj) > 2:
                first = obj[0] if obj else {}
                if isinstance(first, dict):
                    # Check if it looks like a product list
                    keys = set(first.keys())
                    product_signals = {"goodsName", "goods_name", "name", "brandName", "brand",
                                       "goodsNo", "itemNo", "productId", "salePrice", "price"}
                    if keys & product_signals:
                        results.append(obj)
            elif isinstance(obj, dict):
                for v in obj.values():
                    results.extend(find_product_arrays(v, depth + 1))
            return results

        product_arrays = find_product_arrays(nd)
        if not product_arrays:
            log("[OliveYoung] __NEXT_DATA__에서 상품 배열 미발견")
            return []

        # Use the largest array found
        best = max(product_arrays, key=len)
        log(f"[OliveYoung] __NEXT_DATA__ 상품 배열: {len(best)}개")

        products = []
        for rank, item in enumerate(best[:100], 1):
            name = item.get("goodsName", item.get("name", item.get("goods_name", item.get("productName", ""))))
            brand = item.get("brandName", item.get("brand", item.get("brandEnName", "")))
            price = str(item.get("salePrice", item.get("price", item.get("goods_price", ""))))
            url = item.get("goodsDetailUrl", item.get("url", item.get("goodsUrl", "")))
            if not url.startswith("http") and url:
                url = "https://global.oliveyoung.com" + url

            combined = f"{brand} {name}".lower()
            is_medicube = (
                any(kw in combined for kw in BRAND_KW) or any(kw in combined for kw in MED_PROD_KW)
            )
            is_anua = (
                any(kw in combined for kw in ANUA_KW) or any(kw in combined for kw in ANUA_PROD_KW)
            )
            if not brand:
                brand = "Medicube" if is_medicube else ("ANUA" if is_anua else "")

            products.append({
                "rank": rank, "brand": brand, "name": name,
                "price": price, "url": url,
                "is_medicube": is_medicube, "is_anua": is_anua,
            })

        return products

    except Exception as e:
        log(f"[OliveYoung] __NEXT_DATA__ 파싱 오류: {e}")
        return []


def _js_extract_products(driver, log) -> list[dict]:
    """
    Execute JavaScript inside the browser to extract product data directly
    from the rendered DOM - bypasses CSS selector issues.
    Returns list of {rank, brand, name, url} or empty list.
    """
    js = """
    var results = [];
    var rank = 0;

    // Strategy 1: look for elements with both a link and meaningful text
    var candidates = document.querySelectorAll(
        'li, article, [class*="item"], [class*="product"], [class*="prd"], [class*="goods"], [class*="card"]'
    );
    var seen = new Set();
    candidates.forEach(function(el) {
        var links = el.querySelectorAll('a[href]');
        if (links.length === 0) return;
        var text = (el.innerText || '').trim().replace(/\\s+/g, ' ');
        if (text.length < 5 || text.length > 500) return;
        if (seen.has(text.substr(0, 30))) return;
        seen.add(text.substr(0, 30));

        var href = '';
        links.forEach(function(a) { if (!href) href = a.href; });

        var imgs = el.querySelectorAll('img');
        var alt = '';
        imgs.forEach(function(img) { if (!alt) alt = img.alt || ''; });

        // data-* attributes
        var dataStr = '';
        Array.from(el.attributes).forEach(function(attr) {
            if (attr.name.indexOf('data-') === 0) dataStr += ' ' + attr.value;
        });

        rank++;
        results.push({rank: rank, text: text.substr(0, 150), alt: alt.substr(0, 80),
                      href: href.substr(0, 150), data: dataStr.substr(0, 100)});
        if (rank >= 150) return;
    });

    return JSON.stringify(results);
    """
    try:
        raw = driver.execute_script(js)
        import json as _json
        items = _json.loads(raw) if raw else []
        log(f"[OliveYoung] JS 추출: {len(items)}개 후보 요소")
        if items:
            log(f"[OliveYoung] JS 샘플[0]: text={items[0].get('text','')[:60]!r}")
            sample1 = items[1].get("text", "")[:60] if len(items) > 1 else "N/A"
        log(f"[OliveYoung] JS 샘플[1]: text={sample1!r}")
        return items
    except Exception as e:
        log(f"[OliveYoung] JS 추출 오류: {e}")
        return []


_NAV_PHRASES = {
    "sign in", "sign up", "log in", "login", "register", "logout", "log out",
    "track order", "track orders", "my wishlist", "my account", "my orders",
    "shopping cart", "checkout", "view cart", "language", "currency",
    "cookie", "privacy policy", "terms of service", "contact us", "help center",
    "back to top", "all categories", "search",
}


def _js_items_to_products(js_items: list[dict]) -> list[dict]:
    """Convert raw JS-extracted items to product dicts with brand detection."""
    products = []
    real_rank = 0
    seen_names: set[str] = set()

    for item in js_items:
        name = item.get("text", "")[:80].split("\n")[0].strip()
        name_lower = name.lower()

        # Skip obvious navigation / UI elements
        if len(name_lower) < 8:
            continue
        if any(phrase in name_lower for phrase in _NAV_PHRASES):
            continue

        combined = f"{item.get('text','')} {item.get('alt','')} {item.get('href','')} {item.get('data','')}".lower()

        is_medicube = (
            any(kw in combined for kw in BRAND_KW)
            or any(kw in combined for kw in MED_PROD_KW)
        )
        is_anua = (
            any(kw in combined for kw in ANUA_KW)
            or any(kw in combined for kw in ANUA_PROD_KW)
        )

        # Deduplicate
        if name in seen_names:
            continue
        seen_names.add(name)

        brand = ""
        if is_medicube:
            brand = "Medicube"
        elif is_anua:
            brand = "ANUA"

        real_rank += 1
        products.append({
            "rank": real_rank,
            "brand": brand,
            "name": name,
            "price": "",
            "url": item.get("href", ""),
            "is_medicube": is_medicube,
            "is_anua": is_anua,
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

    all_products = []
    try:
        for url in _OY_URLS[:2]:
            log(f"[OliveYoung] 로딩: {url}")
            driver.get(url)
            time.sleep(10)  # React 렌더링 대기

            for attempt in range(5):
                _scroll_load_all(driver, max_scrolls=15)

                # ── Method 0: __NEXT_DATA__ (most reliable for Next.js apps) ─
                nextjs_products = _extract_nextjs_data(driver, log)
                if nextjs_products:
                    all_products = nextjs_products
                    med_cnt = sum(1 for p in nextjs_products if p.get("is_medicube"))
                    anua_cnt = sum(1 for p in nextjs_products if p.get("is_anua"))
                    log(f"[OliveYoung] __NEXT_DATA__ 성공: {len(nextjs_products)}개 | Medicube={med_cnt} Anua={anua_cnt}")
                    break  # exit attempt loop

                # ── Method 1: BeautifulSoup CSS selector ─────────────────
                soup = BeautifulSoup(driver.page_source, "lxml")
                products = _parse_products_from_soup(soup, log_callback)

                # ── Method 2: JS direct DOM extraction (if BS4 found < 5 brands) ─
                brand_found = sum(1 for p in products if p.get("is_medicube") or p.get("is_anua"))
                if products and brand_found == 0:
                    log("[OliveYoung] BS4로 브랜드 미감지 → JS 방식 시도...")
                    js_items = _js_extract_products(driver, log)
                    if js_items:
                        js_products = _js_items_to_products(js_items)
                        # Merge: prefer JS results if more brands found
                        js_brands = sum(1 for p in js_products if p.get("is_medicube") or p.get("is_anua"))
                        if js_brands > 0:
                            log(f"[OliveYoung] JS 방식으로 브랜드 {js_brands}개 감지!")
                            products = js_products

                if not products:
                    log("[OliveYoung] JS 방식도 실패 → JS 재시도...")
                    js_items = _js_extract_products(driver, log)
                    if js_items:
                        products = _js_items_to_products(js_items)

                if products:
                    all_products = products
                    med_cnt = sum(1 for p in products if p.get("is_medicube"))
                    anua_cnt = sum(1 for p in products if p.get("is_anua"))
                    log(f"[OliveYoung] {len(products)}개 (시도 {attempt+1}) | Medicube={med_cnt} Anua={anua_cnt}")

                    if len(products) >= 95:
                        break

                    clicked = _click_more_button(driver, log)
                    if not clicked:
                        break
                else:
                    break

            if all_products:
                log(f"[OliveYoung] 최종 {len(all_products)}개 수집")
                break

        if not all_products:
            log("[OliveYoung] 구조 파싱 실패 → 페이지 텍스트 스캔...")
            try:
                body_text = driver.find_element("tag name", "body").text.lower()
                for brand, kws in [("medicube", BRAND_KW + MED_PROD_KW), ("anua", ANUA_KW + ANUA_PROD_KW)]:
                    hits = sum(body_text.count(kw) for kw in kws)
                    if hits:
                        log(f"[OliveYoung] 페이지 텍스트에 '{brand}' {hits}회 → 구조 파싱 실패")
            except Exception:
                pass

    except Exception as e:
        log(f"[OliveYoung] Selenium 오류: {e}")
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    # Return all products (not sliced) — brand items may appear anywhere in DOM order
    return all_products if all_products else None


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
