"""Qoo10 Japan Bestseller Tracker - Selenium primary, requests fallback"""
import time
import random
import requests
from datetime import datetime
from bs4 import BeautifulSoup

from .config import QOO10_URLS, BRAND_KEYWORDS, HEADERS


BRAND_KW = [kw.lower() for kw in BRAND_KEYWORDS]

# 베스트셀러 URL: &page=N 또는 &pageNum=N 로 페이지네이션
_BEAUTY_URLS = [
    "https://www.qoo10.jp/gmkt.inc/BestSellers/?g=2",
    "https://www.qoo10.jp/gmkt.inc/BestSellers/?g=28000",
    "https://www.qoo10.jp/gmkt.inc/BestSellers/",
    "https://www.qoo10.jp/sr/SearchResult.aspx?keyword=medicube&sort=W",
]
# 각 베스트셀러 URL에 추가할 페이지 파라미터 패턴들
_PAGE_PARAMS = ["&page={}", "&pageNum={}", "&p={}", "?page={}", "?p={}"]

_HEADERS = {
    **HEADERS,
    "Accept-Language": "ja-JP,ja;q=0.9,ko;q=0.8,en;q=0.7",
    "Referer": "https://www.qoo10.jp/",
}


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


def _parse_products(html: str, log_callback=None) -> list[dict]:
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    soup = BeautifulSoup(html, "lxml")
    products = []

    # Updated selector list for Qoo10.jp
    selectors = [
        "ul.best_list li",
        "ul.list_goods li",
        ".best_item",
        ".goods_item",
        ".ranking_item",
        "li.item",
        ".item_area",
        "[class*='best'] li",
        "[class*='ranking'] li",
        "li[class*='item']",
        ".goods_wrap li",
        "#bestRankList li",
        ".rank_list li",
        ".prd_list li",
        "ul.rank li",
        # Qoo10 may render table-based
        "table.best_table tr",
        "tbody tr",
    ]

    items = []
    for sel in selectors:
        found = soup.select(sel)
        if found and len(found) > 2:
            log(f"[Qoo10] 셀렉터 '{sel}'로 {len(found)}개 발견")
            items = found
            break

    if not items:
        # Fallback: product links
        items = [
            a for a in soup.find_all("a", href=True)
            if any(x in str(a.get("href", "")).lower() for x in ["goods_no=", "/g/", "item", "goods"])
        ]
        if items:
            log(f"[Qoo10] 링크 방식으로 {len(items)}개 발견")

    if not items:
        # Last resort: check if page contains medicube text
        page_text = soup.get_text().lower()
        if any(kw in page_text for kw in BRAND_KW):
            log(f"[Qoo10] 페이지에서 medicube 키워드 발견 (구조 파싱 불가)")
        return []

    for rank, item in enumerate(items[:100], 1):
        text = item.get_text(" ", strip=True)
        if not text or len(text) < 3:
            continue

        name_el = (
            item.find(class_=lambda c: c and any(x in c.lower() for x in ["name", "title", "goods_nm", "subject"]))
            or item.find(["h2", "h3", "h4", "strong", "span", "p"])
        )
        name = name_el.get_text(strip=True) if name_el else text[:80]

        price_el = item.find(class_=lambda c: c and "price" in c.lower())
        price = price_el.get_text(strip=True) if price_el else ""

        link_el = item if item.name == "a" else item.find("a", href=True)
        url_link = ""
        if link_el:
            url_link = link_el.get("href", "")
            if url_link and not url_link.startswith("http"):
                url_link = "https://www.qoo10.jp" + url_link

        is_medicube = any(kw in text.lower() for kw in BRAND_KW)
        products.append({
            "rank": rank,
            "name": name,
            "price": price,
            "url": url_link,
            "is_medicube": is_medicube,
        })

    return products


def _scroll_and_parse(driver, url: str, log_callback=None) -> list[dict]:
    """Load URL, scroll fully, parse products."""
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    driver.get(url)
    time.sleep(random.uniform(4, 6))

    # Incremental scroll to trigger lazy-loading
    for step in range(1, 8):
        driver.execute_script(f"window.scrollTo(0, document.body.scrollHeight * {step / 7});")
        time.sleep(0.7)
    time.sleep(2)

    return _parse_products(driver.page_source, log_callback)


def _fetch_via_selenium(log_callback=None) -> list[dict] | None:
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    driver = _make_driver()
    if driver is None:
        log("[Qoo10] Selenium 드라이버 시작 실패")
        return None

    all_products: list[dict] = []
    try:
        base_url = _BEAUTY_URLS[0]  # 뷰티 베스트셀러 우선
        # 페이지 1~3 시도 (페이지당 최대 40~50개 → 총 100개 확보)
        for page_num in range(1, 4):
            if page_num == 1:
                url = base_url
            else:
                url = f"{base_url}&page={page_num}"

            log(f"[Qoo10] 페이지 {page_num} 로딩: {url}")
            products = _scroll_and_parse(driver, url, log_callback)

            if not products and page_num == 1:
                # 페이지1 실패시 다른 URL 시도
                for alt_url in _BEAUTY_URLS[1:3]:
                    log(f"[Qoo10] 대체 URL 시도: {alt_url}")
                    products = _scroll_and_parse(driver, alt_url, log_callback)
                    if products:
                        break

            if products:
                # rank 번호 재조정 (누적)
                offset = len(all_products)
                for p in products:
                    p["rank"] = offset + p["rank"]
                all_products.extend(products)
                log(f"[Qoo10] 페이지 {page_num}: {len(products)}개 (누적: {len(all_products)}개)")
            else:
                log(f"[Qoo10] 페이지 {page_num} 항목 없음 - 중단")
                break

            if len(all_products) >= 100:
                break
            time.sleep(random.uniform(2, 3))

        if all_products:
            return all_products[:100]

        # 최후 수단: 메디큐브 직접 검색
        log("[Qoo10] 베스트셀러 파싱 실패 → 메디큐브 직접 검색 시도...")
        search_url = "https://www.qoo10.jp/sr/SearchResult.aspx?keyword=medicube&sort=W"
        products = _scroll_and_parse(driver, search_url, log_callback)
        if products:
            log(f"[Qoo10] 검색 결과: {len(products)}개")
            return products[:100]

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
        if log_callback: log_callback(m)
        else: print(m)

    session = requests.Session()
    session.headers.update(_HEADERS)

    all_products: list[dict] = []

    for base_url in _BEAUTY_URLS[:3]:
        # 페이지 1~3 시도
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
                    raw_lower = resp.text.lower()
                    hits = sum(raw_lower.count(kw) for kw in BRAND_KW)
                    if hits > 0:
                        log(f"[Qoo10] 텍스트에서 medicube {hits}회 발견 (구조 파싱 불가)")
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


def fetch_qoo10_rankings(log_callback=None) -> dict:
    """
    Fetch Qoo10 Japan beauty bestseller rankings.
    Uses Selenium as primary (JavaScript rendering), falls back to requests.
    """
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    log("[Qoo10] 큐텐재팬 뷰티 베스트셀러 수집 중...")

    # Try Selenium first (handles JS rendering)
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
            "all_products_top20": [],
            "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "error": "scraping failed",
        }

    medicube_products = [p for p in products if p.get("is_medicube")]

    for p in medicube_products:
        log(f"[Qoo10] ✅ Medicube 발견! 순위 {p['rank']}: {p['name'][:50]}")

    log(f"[Qoo10] 완료 - 총 {len(products)}개 중 Medicube {len(medicube_products)}개")

    return {
        "platform": "Qoo10 Japan",
        "category": "뷰티",
        "total_scanned": len(products),
        "medicube_count": len(medicube_products),
        "medicube_products": medicube_products,
        "all_products_top20": products[:20],
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
