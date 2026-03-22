"""Configuration for Medicube Trend Tracker"""
import os
from dotenv import load_dotenv

load_dotenv()

# Exolyt (TikTok trends) credentials
EXOLYT_EMAIL = os.getenv("EXOLYT_EMAIL", "hoyounggal@khnp.co.kr")
EXOLYT_PASSWORD = os.getenv("EXOLYT_PASSWORD", "82017rkfgh!")
EXOLYT_HASHTAG_URL = "https://exolyt.com/hashtags/medicube"
EXOLYT_LOGIN_URL = "https://exolyt.com/login"

# Target brand keywords
BRAND_KEYWORDS = ["medicube", "Medicube", "메디큐브"]
APR_BRANDS = ["medicube", "d'alba", "ANUA", "celimax", "BIODANCE"]

# Amazon country configurations
AMAZON_COUNTRIES = {
    "미국": {"url": "https://www.amazon.com/best-sellers-beauty/zgbs/beauty", "domain": "amazon.com"},
    "영국": {"url": "https://www.amazon.co.uk/Best-Sellers-Beauty/zgbs/beauty", "domain": "amazon.co.uk"},
    "독일": {"url": "https://www.amazon.de/Best-Sellers-Beauty/zgbs/beauty", "domain": "amazon.de"},
    "스페인": {"url": "https://www.amazon.es/Best-Sellers-Beauty/zgbs/beauty", "domain": "amazon.es"},
    "이탈리아": {"url": "https://www.amazon.it/Best-Sellers-Beauty/zgbs/beauty", "domain": "amazon.it"},
    "프랑스": {"url": "https://www.amazon.fr/Best-Sellers-Beauty/zgbs/beauty", "domain": "amazon.fr"},
}

# Qoo10 Japan bestsellers
QOO10_URL = "https://www.qoo10.jp/gmkt.inc/BestSellers/?g=2"

# Olive Young Global
OLIVEYOUNG_URL = "https://global.oliveyoung.com/display/page/best-seller?target=pillsTab1Nav1"

# Google Trends
GOOGLE_TRENDS_KEYWORDS = ["medicube"]
GOOGLE_TRENDS_GEO = ""  # Worldwide
GOOGLE_TRENDS_TIMEFRAME = "today 3-m"  # Last 3 months

# Output settings
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "medicube_reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Request headers to avoid blocking
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
