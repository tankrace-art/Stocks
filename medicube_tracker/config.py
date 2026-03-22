"""Configuration for Medicube Trend Tracker"""
import os
from dotenv import load_dotenv

load_dotenv()

# Exolyt (TikTok analytics) credentials
EXOLYT_EMAIL = os.getenv("EXOLYT_EMAIL", "hoyounggal@khnp.co.kr")
EXOLYT_PASSWORD = os.getenv("EXOLYT_PASSWORD", "82017rkf!")
EXOLYT_HASHTAG_URL = "https://exolyt.com/hashtags/medicube"
EXOLYT_LOGIN_URL = "https://exolyt.com/en/login"

# Target brand keywords
BRAND_KEYWORDS = ["medicube", "Medicube", "메디큐브", "메디뷰트"]
APR_BRANDS = ["medicube", "d'alba", "ANUA", "celimax", "BIODANCE"]

# Amazon country configurations (Beauty Top 100)
# lang: Accept-Language header value for each country
AMAZON_COUNTRIES = {
    "미국":    {"url": "https://www.amazon.com/Best-Sellers-Beauty/zgbs/beauty/",    "domain": "amazon.com",    "lang": "en-US,en;q=0.9"},
    "일본":    {"url": "https://www.amazon.co.jp/gp/bestsellers/beauty/",           "domain": "amazon.co.jp",  "lang": "ja-JP,ja;q=0.9,en;q=0.8"},
    "영국":    {"url": "https://www.amazon.co.uk/Best-Sellers-Beauty/zgbs/beauty/", "domain": "amazon.co.uk",  "lang": "en-GB,en;q=0.9"},
    "독일":    {"url": "https://www.amazon.de/Best-Sellers-Beauty/zgbs/beauty/",    "domain": "amazon.de",     "lang": "de-DE,de;q=0.9,en;q=0.8"},
    "프랑스":  {"url": "https://www.amazon.fr/Best-Sellers-Beauty/zgbs/beauty/",    "domain": "amazon.fr",     "lang": "fr-FR,fr;q=0.9,en;q=0.8"},
    "스페인":  {"url": "https://www.amazon.es/Best-Sellers-Beauty/zgbs/beauty/",    "domain": "amazon.es",     "lang": "es-ES,es;q=0.9,en;q=0.8"},
    "이탈리아":{"url": "https://www.amazon.it/Best-Sellers-Beauty/zgbs/beauty/",    "domain": "amazon.it",     "lang": "it-IT,it;q=0.9,en;q=0.8"},
    "캐나다":  {"url": "https://www.amazon.ca/Best-Sellers-Beauty/zgbs/beauty/",    "domain": "amazon.ca",     "lang": "en-CA,en;q=0.9"},
}

# Qoo10 Japan - beauty bestsellers
QOO10_URLS = [
    "https://www.qoo10.jp/gmkt.inc/BestSellers/?g=2",         # 뷰티
    "https://www.qoo10.jp/gmkt.inc/BestSellers/?g=28000",     # 여성 건강&뷰티
    "https://www.qoo10.jp/gmkt.inc/BestSellers/",             # 전체 베스트
]
QOO10_URL = QOO10_URLS[0]

# Olive Young Global
OLIVEYOUNG_URL = "https://global.oliveyoung.com/display/page/best-seller"

# Google Trends
GOOGLE_TRENDS_KEYWORDS = ["medicube"]
GOOGLE_TRENDS_GEO = ""  # Worldwide
GOOGLE_TRENDS_TIMEFRAME = "today 3-m"  # Last 3 months

# SerpAPI (Google Trends 대체 - 월 100건 무료)
# API 키 발급: https://serpapi.com/ 에서 무료 가입
SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")

# Output settings
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "medicube_reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Base request headers
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}
