"""
Diagnostic script - saves raw Selenium-rendered HTML to files and
prints what the parser actually sees.

Run:  python debug_scrape.py
Output files:
  medicube_reports/debug_qoo10.html
  medicube_reports/debug_oliveyoung.html
"""
import sys, os, time, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from bs4 import BeautifulSoup
from medicube_tracker.config import OUTPUT_DIR

os.makedirs(OUTPUT_DIR, exist_ok=True)


def _make_driver():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    try:
        from selenium.webdriver.chrome.service import Service
        from webdriver_manager.chrome import ChromeDriverManager
    except ImportError:
        pass

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1440,900")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    try:
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    except Exception:
        driver = webdriver.Chrome(options=options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver


def scroll_page(driver):
    for step in range(1, 10):
        driver.execute_script(f"window.scrollTo(0, document.body.scrollHeight * {step/9});")
        time.sleep(0.5)
    time.sleep(3)


def analyze_html(html: str, label: str, save_path: str):
    with open(save_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\n{'='*60}")
    print(f" {label}  (HTML saved → {save_path})")
    print(f"{'='*60}")

    soup = BeautifulSoup(html, "lxml")

    # 1. /item/ 링크 확인
    item_links = [a for a in soup.find_all("a", href=True) if "/item/" in a.get("href", "")]
    print(f"\n[/item/ 링크] {len(item_links)}개")
    for a in item_links[:10]:
        href = a.get("href", "")
        text = a.get_text(strip=True)[:30]
        print(f"  text={text!r:35} href={href[:70]}")

    # 2. 각 CSS 셀렉터가 몇 개 잡히는지
    print("\n[셀렉터 탐색]")
    selectors = [
        "ul.best_list li", "ul.list_goods li", ".best_item", ".goods_item",
        ".ranking_item", ".item_area", "[class*='ranking'] li",
        "li[class*='item']", ".goods_wrap li", "#bestRankList li",
        ".rank_list li", ".prd_list li", "ul.rank li",
        ".product-item", ".prd_info", "[class*='ProductCard']",
        "[class*='product-card']", "[class*='prd_wrap']",
        "article", ".grid_item", ".swiper-slide",
    ]
    for sel in selectors:
        found = soup.select(sel)
        if found:
            print(f"  {sel:40} → {len(found):3}개  example: {found[0].get_text(strip=True)[:40]!r}")

    # 3. 모든 <li> 요소의 class 분포 (상위 20)
    print("\n[<li> class 분포 상위 20]")
    from collections import Counter
    li_classes = Counter()
    for li in soup.find_all("li"):
        cls = " ".join(li.get("class", []))
        if cls:
            li_classes[cls] += 1
    for cls, cnt in li_classes.most_common(20):
        print(f"  {cnt:3}x  .{cls}")

    # 4. 브랜드 키워드 등장 여부
    print("\n[키워드 검색]")
    text_lower = html.lower()
    for kw in ["medicube", "メディキューブ", "anua", "アヌア", "age-r", "agr-r", "pdrn", "zero pore"]:
        count = text_lower.count(kw.lower())
        if count:
            # Find context
            idx = text_lower.find(kw.lower())
            ctx = html[max(0,idx-50):idx+80].replace("\n", " ").strip()
            print(f"  {kw!r:20}: {count}회  context: {ctx!r}")
        else:
            print(f"  {kw!r:20}: 없음")

    # 5. 첫 번째 /item/ 링크의 부모 구조 출력
    if item_links:
        print("\n[첫 번째 /item/ 링크 부모 HTML (3레벨)]")
        el = item_links[0]
        for _ in range(3):
            if el.parent:
                el = el.parent
        print(str(el)[:800])


def debug_qoo10():
    print("\n▶ QOO10 Japan 뷰티 베스트셀러 디버그 시작...")
    driver = _make_driver()
    try:
        url = "https://www.qoo10.jp/gmkt.inc/BestSellers/?g=2"
        driver.get(url)
        time.sleep(8)
        scroll_page(driver)
        html = driver.page_source
        analyze_html(html, "QOO10 BEAUTY BESTSELLER", os.path.join(OUTPUT_DIR, "debug_qoo10.html"))
    finally:
        driver.quit()


def debug_oliveyoung():
    print("\n▶ Olive Young Global 베스트셀러 디버그 시작...")
    driver = _make_driver()
    try:
        url = "https://global.oliveyoung.com/display/page/best-seller"
        driver.get(url)
        time.sleep(10)
        scroll_page(driver)
        html = driver.page_source
        analyze_html(html, "OLIVE YOUNG GLOBAL BESTSELLER", os.path.join(OUTPUT_DIR, "debug_oliveyoung.html"))
    finally:
        driver.quit()


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "both"
    if target in ("qoo10", "both"):
        debug_qoo10()
    if target in ("oliveyoung", "both"):
        debug_oliveyoung()
    print("\n✅ 디버그 완료. medicube_reports/ 폴더의 debug_*.html 파일을 확인하세요.")
