"""Qoo10 Japan Bestseller Tracker - requests + Selenium fallback"""
import time
import random
import requests
from datetime import datetime
from bs4 import BeautifulSoup

from .config import QOO10_URLS, BRAND_KEYWORDS, HEADERS


BRAND_KW = [kw.lower() for kw in BRAND_KEYWORDS]

# Qoo10.jp beauty bestseller category URLs to try in order
_BEAUTY_URLS = QOO10_URLS

_HEADERS = {
    **HEADERS,
    "Accept-Language": "ja-JP,ja;q=0.9,ko;q=0.8,en;q=0.7",
    "Referer": "https://www.qoo10.jp/",
}


# ─── Requests-based fetch ─────────────────────────────────────────────────────

def _fetch_html(url: str, session: requests.Session, log_callback=None) -> str | None:
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)
    try:
        resp = session.get(url, timeout=20)
        if resp.status_code == 200:
            return resp.text
        log(f"[Qoo10] HTTP {resp.status_code} ({url})")
        return None
    except requests.RequestException as e:
        log(f"[Qoo10] 네트워크 오류: {e}")
        return None


def _parse_products(html: str, log_callback=None) -> list[dict]:
    """Extract product list from Qoo10 bestseller HTML."""
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    soup = BeautifulSoup(html, "lxml")
    products = []

    # Selector priority list for Qoo10.jp
    selectors = [
        "ul.best_list li",
        "ul.list_goods li",
        ".best_item",
        ".goods_item",
        ".ranking_item",
        "li.item",
        "[class*='best'] li",
        "[class*='ranking'] li",
        "li[class*='item']",
    ]

    items = []
    for sel in selectors:
        found = soup.select(sel)
        if found and len(found) > 3:
            log(f"[Qoo10] 셀렉터 '{sel}'로 {len(found)}개 발견")
            items = found
            break

    if not items:
        # Fallback: look for anchor tags pointing to product pages
        items = [
            a for a in soup.find_all("a", href=True)
            if any(x in str(a.get("href", "")).lower() for x in ["goods_no=", "/g/", "item"])
        ]
        if items:
            log(f"[Qoo10] 링크 방식으로 {len(items)}개 발견")

    for rank, item in enumerate(items[:100], 1):
        text = item.get_text(" ", strip=True)
        if not text:
            continue

        # Product name
        name_el = (
            item.find(class_=lambda c: c and any(x in c.lower() for x in ["name", "title", "goods_nm"]))
            or item.find(["h2", "h3", "h4", "strong", "span"])
        )
        name = name_el.get_text(strip=True) if name_el else text[:80]

        # Price
        price_el = item.find(class_=lambda c: c and "price" in c.lower())
        price = price_el.get_text(strip=True) if price_el else ""

        # Link
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


def _fetch_via_requests(log_callback=None) -> dict | None:
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    session = requests.Session()
    session.headers.update(_HEADERS)

    for url in _BEAUTY_URLS:
        log(f"[Qoo10] 시도: {url}")
        html = _fetch_html(url, session, log_callback)
        if not html:
            continue

        products = _parse_products(html, log_callback)
        if products:
            return products

        # Even if no structured items, try raw text search
        raw_lower = html.lower()
        hits = sum(raw_lower.count(kw) for kw in BRAND_KW)
        if hits > 0:
            log(f"[Qoo10] 텍스트에서 medicube {hits}회 검출 (구조 파싱 실패)")

    return None


# ─── Selenium fallback ────────────────────────────────────────────────────────

def _fetch_via_selenium(log_callback=None) -> dict | None:
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service

        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1366,768")
        options.add_argument(
            "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        )
        options.add_argument("--lang=ja")

        try:
            from webdriver_manager.chrome import ChromeDriverManager
            driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
        except Exception:
            driver = webdriver.Chrome(options=options)

        try:
            for url in _BEAUTY_URLS:
                log(f"[Qoo10] Selenium 시도: {url}")
                driver.get(url)
                time.sleep(4)
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(2)

                products = _parse_products(driver.page_source, log_callback)
                if products:
                    return products
        finally:
            try:
                driver.quit()
            except Exception:
                pass
    except Exception as e:
        log(f"[Qoo10] Selenium 오류: {e}")

    return None


# ─── Public API ───────────────────────────────────────────────────────────────

def fetch_qoo10_rankings(log_callback=None) -> dict:
    """
    Fetch Qoo10 Japan beauty bestseller rankings.
    Tries requests first; falls back to Selenium.
    """
    def log(m):
        if log_callback: log_callback(m)
        else: print(m)

    log("[Qoo10] 큐텐재팬 뷰티 베스트셀러 수집 중...")

    products = _fetch_via_requests(log_callback)

    if not products:
        log("[Qoo10] requests 실패 → Selenium 재시도...")
        products = _fetch_via_selenium(log_callback)

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
