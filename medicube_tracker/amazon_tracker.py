"""Amazon Beauty Bestseller Tracker - Multi-country brand ranking counter"""
import time
import random
import requests
from datetime import datetime
from typing import Optional
from bs4 import BeautifulSoup

from .config import AMAZON_COUNTRIES, BRAND_KEYWORDS, APR_BRANDS, HEADERS


# Track pages to scan per country (Top 100 = ~3-4 pages of 20-25 items each)
PAGES_TO_SCAN = 4


def _get_brand_variants(brand: str) -> list:
    """Return multiple spelling variants for a brand name."""
    variants = [brand.lower()]
    mapping = {
        "medicube": ["medicube", "medi cube"],
        "d'alba": ["d'alba", "d alba", "dalba"],
        "anua": ["anua"],
        "celimax": ["celimax"],
        "biodance": ["biodance", "bio dance"],
    }
    return mapping.get(brand.lower(), variants)


def _count_brand_in_page(soup: BeautifulSoup, brands: list) -> dict:
    """Count occurrences of each brand in a bestseller page."""
    counts = {brand: 0 for brand in brands}

    # Amazon bestseller item selectors
    items = soup.select(
        "#zg-ordered-list li, "
        ".p13n-gridRow li, "
        "[class*='zg_item_block'], "
        ".s-result-item"
    )

    if not items:
        # Fallback: search entire text
        page_text = soup.get_text().lower()
        for brand in brands:
            for variant in _get_brand_variants(brand):
                counts[brand] += page_text.count(variant)
        return counts

    for item in items:
        item_text = item.get_text().lower()
        for brand in brands:
            for variant in _get_brand_variants(brand):
                if variant in item_text:
                    counts[brand] += 1
                    break  # Don't double-count variants

    return counts


def _fetch_amazon_country(country_name: str, country_info: dict, log_callback=None) -> dict:
    """Fetch Amazon beauty bestsellers for one country and count APR brand products."""
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    base_url = country_info["url"]
    session = requests.Session()
    session.headers.update(HEADERS)

    brand_counts = {brand: 0 for brand in APR_BRANDS}
    total_items_seen = 0

    for page_num in range(1, PAGES_TO_SCAN + 1):
        if page_num == 1:
            url = base_url
        else:
            url = f"{base_url}?pg={page_num}"

        try:
            resp = session.get(url, timeout=20)
            if resp.status_code != 200:
                log(f"[Amazon {country_name}] 페이지 {page_num} HTTP {resp.status_code}")
                break

            soup = BeautifulSoup(resp.text, "lxml")

            # Count items on this page
            items = soup.select(
                "#zg-ordered-list li, "
                ".p13n-gridRow li, "
                "[class*='zg_item_block']"
            )
            total_items_seen += len(items)

            page_counts = _count_brand_in_page(soup, APR_BRANDS)
            for brand in APR_BRANDS:
                brand_counts[brand] += page_counts[brand]

            log(f"[Amazon {country_name}] 페이지 {page_num}: 항목 {len(items)}개, Medicube {page_counts.get('medicube', 0)}개")

            # Stop if we've seen 100+ items
            if total_items_seen >= 100:
                break

            # Polite delay
            time.sleep(random.uniform(1.5, 3.0))

        except requests.exceptions.RequestException as e:
            log(f"[Amazon {country_name}] 페이지 {page_num} 오류: {e}")
            break

    return {
        "country": country_name,
        "brand_counts": brand_counts,
        "total_items_scanned": min(total_items_seen, 100),
    }


def fetch_amazon_rankings(countries: dict = None, log_callback=None) -> dict:
    """
    Fetch Amazon beauty bestseller rankings for all configured countries.
    Returns a dict matching the image format (brand x country matrix).
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    if countries is None:
        countries = AMAZON_COUNTRIES

    log("[Amazon] 아마존 뷰티 Top 100 데이터 수집 시작...")

    results = {}
    for country_name, country_info in countries.items():
        log(f"[Amazon] {country_name} 데이터 수집 중...")
        country_result = _fetch_amazon_country(country_name, country_info, log_callback)
        results[country_name] = country_result
        time.sleep(random.uniform(2.0, 4.0))

    # Build summary table
    country_names = list(countries.keys())
    summary = {}
    for brand in APR_BRANDS:
        row = {}
        total = 0
        for cn in country_names:
            count = results.get(cn, {}).get("brand_counts", {}).get(brand, 0)
            row[cn] = count
            total += count
        row["총합계"] = total
        summary[brand] = row

    log(f"[Amazon] 데이터 수집 완료! Medicube 총합계: {summary.get('medicube', {}).get('총합계', 0)}")

    return {
        "countries": country_names,
        "brands": APR_BRANDS,
        "summary": summary,
        "raw": results,
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
