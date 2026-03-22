"""Olive Young Global Bestseller Tracker"""
import time
import requests
from datetime import datetime
from bs4 import BeautifulSoup

from .config import OLIVEYOUNG_URL, BRAND_KEYWORDS, HEADERS


def fetch_oliveyoung_rankings(log_callback=None) -> dict:
    """
    Fetch Olive Young Global bestseller rankings and find Medicube & APR brand products.
    URL: https://global.oliveyoung.com/display/page/best-seller
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    log("[OliveYoung] 올리브영 글로벌 베스트셀러 수집 중...")

    session = requests.Session()
    session.headers.update({
        **HEADERS,
        "Referer": "https://global.oliveyoung.com/",
    })

    medicube_products = []
    all_products = []

    try:
        resp = session.get(OLIVEYOUNG_URL, timeout=20)
        if resp.status_code != 200:
            log(f"[OliveYoung] HTTP {resp.status_code} 오류")
            return {"error": f"HTTP {resp.status_code}"}

        soup = BeautifulSoup(resp.text, "lxml")

        # Olive Young Global product selectors
        product_selectors = [
            ".prd_info",
            ".product-item",
            ".item-wrap",
            "li.goods",
            "[class*='product']",
            "[class*='prd']",
            "[class*='item']",
            "article",
        ]

        items = []
        for selector in product_selectors:
            items = soup.select(selector)
            if items and len(items) > 3:
                log(f"[OliveYoung] 셀렉터 '{selector}'로 {len(items)}개 항목 발견")
                break

        if not items:
            # Fallback: try all links
            log("[OliveYoung] 대체 파싱 방법 사용 중...")
            items = soup.find_all(["li", "div"], class_=lambda c: c and (
                "item" in c.lower() or "product" in c.lower() or "goods" in c.lower()
            ))

        if not items:
            # Last resort: text search
            page_text = resp.text.lower()
            for kw in BRAND_KEYWORDS:
                count = page_text.count(kw.lower())
                log(f"[OliveYoung] 텍스트 검색: '{kw}' {count}회")

        for rank, item in enumerate(items[:100], 1):
            item_text = item.get_text(strip=True)
            if not item_text:
                continue

            # Extract product name
            name_el = (
                item.find(class_=lambda c: c and ("name" in c.lower() or "title" in c.lower() or "prd" in c.lower()))
                or item.find(["h2", "h3", "h4", "p", "span"])
            )
            product_name = name_el.get_text(strip=True) if name_el else item_text[:80]

            # Extract brand name
            brand_el = item.find(class_=lambda c: c and "brand" in c.lower())
            brand_name = brand_el.get_text(strip=True) if brand_el else ""

            # Extract price
            price_el = item.find(class_=lambda c: c and "price" in c.lower())
            price = price_el.get_text(strip=True) if price_el else ""

            # Extract URL
            link_el = item.find("a", href=True)
            url = link_el.get("href", "") if link_el else ""
            if url and not url.startswith("http"):
                url = "https://global.oliveyoung.com" + url

            product = {
                "rank": rank,
                "brand": brand_name,
                "name": product_name,
                "price": price,
                "url": url,
            }
            all_products.append(product)

            # Check if Medicube
            is_medicube = any(kw.lower() in item_text.lower() for kw in BRAND_KEYWORDS)
            if is_medicube:
                product["is_medicube"] = True
                medicube_products.append(product)
                log(f"[OliveYoung] Medicube 발견! 순위 {rank}: {product_name[:50]}")

        log(f"[OliveYoung] 총 {len(all_products)}개 상품 중 Medicube {len(medicube_products)}개 발견")

    except Exception as e:
        log(f"[OliveYoung] 오류: {e}")
        return {"error": str(e)}

    return {
        "platform": "Olive Young Global",
        "total_scanned": len(all_products),
        "medicube_count": len(medicube_products),
        "medicube_products": medicube_products,
        "all_products_top20": all_products[:20],
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
