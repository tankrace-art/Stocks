"""Qoo10 Japan Bestseller Tracker"""
import time
import requests
from datetime import datetime
from bs4 import BeautifulSoup

from .config import QOO10_URL, BRAND_KEYWORDS, HEADERS


def fetch_qoo10_rankings(log_callback=None) -> dict:
    """
    Fetch Qoo10 Japan bestseller rankings and find Medicube products.
    URL: https://www.qoo10.jp/gmkt.inc/BestSellers/?g=2 (Beauty category)
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    log("[Qoo10] 큐텐재팬 베스트셀러 수집 중...")

    session = requests.Session()
    session.headers.update({
        **HEADERS,
        "Accept-Language": "ja-JP,ja;q=0.9,ko;q=0.8,en;q=0.7",
        "Referer": "https://www.qoo10.jp/",
    })

    medicube_products = []
    all_products = []

    try:
        resp = session.get(QOO10_URL, timeout=20)
        if resp.status_code != 200:
            log(f"[Qoo10] HTTP {resp.status_code} 오류")
            return {"error": f"HTTP {resp.status_code}"}

        soup = BeautifulSoup(resp.text, "lxml")

        # Find product items - Qoo10 uses various selectors
        product_selectors = [
            ".best_item",
            ".goods_item",
            ".item_info",
            "li.item",
            ".ranking_item",
            "ul.list_goods li",
            "[class*='item']",
            "article",
        ]

        items = []
        for selector in product_selectors:
            items = soup.select(selector)
            if items and len(items) > 5:
                log(f"[Qoo10] 셀렉터 '{selector}'로 {len(items)}개 항목 발견")
                break

        if not items:
            # Fallback: search full text
            page_text = resp.text.lower()
            for kw in BRAND_KEYWORDS:
                count = page_text.count(kw.lower())
                if count > 0:
                    log(f"[Qoo10] 텍스트 검색: '{kw}' {count}회 등장")

            # Try parsing anchor tags with product info
            items = soup.find_all("a", href=True)
            items = [a for a in items if "goods" in str(a.get("href", "")).lower() or
                     "item" in str(a.get("href", "")).lower()]

        for rank, item in enumerate(items[:100], 1):
            item_text = item.get_text(strip=True)
            item_link = ""
            if item.get("href"):
                item_link = item.get("href", "")
            elif item.find("a"):
                item_link = item.find("a").get("href", "")

            # Extract product name
            name_el = (
                item.find(class_=lambda c: c and ("name" in c.lower() or "title" in c.lower()))
                or item.find(["h2", "h3", "h4", "strong"])
            )
            product_name = name_el.get_text(strip=True) if name_el else item_text[:60]

            # Extract price
            price_el = item.find(class_=lambda c: c and "price" in c.lower())
            price = price_el.get_text(strip=True) if price_el else ""

            product = {
                "rank": rank,
                "name": product_name,
                "price": price,
                "url": item_link,
            }
            all_products.append(product)

            # Check if Medicube
            is_medicube = any(kw.lower() in item_text.lower() for kw in BRAND_KEYWORDS)
            if is_medicube:
                product["is_medicube"] = True
                medicube_products.append(product)
                log(f"[Qoo10] Medicube 발견! 순위 {rank}: {product_name[:50]}")

        log(f"[Qoo10] 총 {len(all_products)}개 상품 중 Medicube {len(medicube_products)}개 발견")

    except Exception as e:
        log(f"[Qoo10] 오류: {e}")
        return {"error": str(e)}

    return {
        "platform": "Qoo10 Japan",
        "category": "뷰티",
        "total_scanned": len(all_products),
        "medicube_count": len(medicube_products),
        "medicube_products": medicube_products,
        "all_products_top20": all_products[:20],
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
