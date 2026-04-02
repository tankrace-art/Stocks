"""
US Nuclear Energy Companies News Scraper
With reliability scoring and cross-source verification.
"""

import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from urllib.parse import quote_plus


@dataclass
class NewsItem:
    title: str
    source: str
    url: str
    published: str
    snippet: str
    score: int = 0           # importance/reliability score (0-100)
    verified: bool = False   # appeared in 2+ sources
    tags: list = field(default_factory=list)  # e.g. ["공시", "실적", "계약"]


# ── Trusted source tiers ──
TIER1_SOURCES = {
    "Reuters", "Bloomberg", "CNBC", "AP News", "The Wall Street Journal",
    "Financial Times", "Barron's", "MarketWatch", "Yahoo Finance",
    "PR Newswire", "Business Wire", "GlobeNewswire", "SEC Filing",
}
TIER2_SOURCES = {
    "Seeking Alpha", "Benzinga", "Investopedia", "TipRanks",
    "GuruFocus.com", "Barchart", "Zacks", "InvestorPlace",
    "The Motley Fool", "Exec Edge", "Nasdaq", "24/7 Wall St.",
}
SPAM_KEYWORDS = [
    "short seller", "meme stock", "you won't believe",
    "millionaire", "retire early", "get rich",
]

# ── News category tags (keyword → Korean tag) ──
CATEGORY_KEYWORDS = {
    "SEC": "공시", "filing": "공시", "report": "공시",
    "earnings": "실적", "revenue": "실적", "profit": "실적", "quarterly": "실적",
    "contract": "계약", "deal": "계약", "partnership": "제휴", "agreement": "계약",
    "NRC": "규제", "license": "인허가", "permit": "인허가", "regulatory": "규제", "approval": "인허가",
    "reactor": "원자로", "SMR": "SMR", "microreactor": "마이크로원자로",
    "uranium": "우라늄", "enrichment": "농축", "fuel": "핵연료",
    "price target": "목표가", "upgrade": "투자의견", "downgrade": "투자의견", "analyst": "애널리스트",
    "construction": "건설", "deployment": "배치", "operation": "운영",
    "DOE": "에너지부", "funding": "자금", "investment": "투자",
}

NUCLEAR_COMPANIES = {
    "OKLO": {"name": "Oklo Inc.", "keywords": ["Oklo", "OKLO stock"]},
    "SMR": {"name": "NuScale Power", "keywords": ["NuScale Power", "SMR stock NuScale"]},
    "LEU": {"name": "Centrus Energy", "keywords": ["Centrus Energy", "LEU stock"]},
    "CCJ": {"name": "Cameco Corp", "keywords": ["Cameco", "CCJ stock"]},
    "UEC": {"name": "Uranium Energy Corp", "keywords": ["Uranium Energy Corp", "UEC stock"]},
    "NNE": {"name": "Nano Nuclear Energy", "keywords": ["Nano Nuclear Energy", "NNE stock"]},
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


def _score_news(item: NewsItem) -> int:
    """Score a news item by reliability and importance (0-100)."""
    score = 30  # base score

    # Source tier scoring
    if item.source in TIER1_SOURCES:
        score += 30
    elif item.source in TIER2_SOURCES:
        score += 15
    elif any(t1.lower() in item.source.lower() for t1 in TIER1_SOURCES):
        score += 25
    elif any(t2.lower() in item.source.lower() for t2 in TIER2_SOURCES):
        score += 10

    # Has snippet (more informative)
    if item.snippet:
        score += 10

    # Recency bonus
    if "Today" in item.published:
        score += 15
    elif _is_within_days(item.published, 2):
        score += 10
    elif _is_within_days(item.published, 7):
        score += 5

    # Important keyword bonus
    title_lower = item.title.lower()
    important_keywords = ["contract", "deal", "partnership", "license", "approval",
                          "nrc", "doe", "earnings", "revenue", "sec filing",
                          "construction", "deployment", "reactor"]
    for kw in important_keywords:
        if kw in title_lower:
            score += 8
            break

    # Spam penalty
    for spam in SPAM_KEYWORDS:
        if spam in title_lower:
            score -= 30
            break

    return max(0, min(100, score))


def _tag_news(item: NewsItem) -> list[str]:
    """Assign Korean category tags to a news item."""
    tags = []
    text = (item.title + " " + item.snippet).lower()
    seen = set()
    for keyword, tag in CATEGORY_KEYWORDS.items():
        if keyword.lower() in text and tag not in seen:
            tags.append(tag)
            seen.add(tag)
        if len(tags) >= 2:
            break
    return tags


def _is_within_days(date_str: str, days: int) -> bool:
    """Check if a date string is within N days of now."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M")
        return (datetime.now() - dt).days <= days
    except ValueError:
        return False


def _cross_verify(all_items: list[NewsItem]) -> list[NewsItem]:
    """Mark items as verified if similar titles appear from different sources."""
    for i, item_a in enumerate(all_items):
        for j, item_b in enumerate(all_items):
            if i >= j:
                continue
            if item_a.source == item_b.source:
                continue
            # Simple similarity: check if 3+ words overlap
            words_a = set(item_a.title.lower().split())
            words_b = set(item_b.title.lower().split())
            overlap = words_a & words_b
            # Remove common stop words
            stop = {"the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "is", "with"}
            meaningful_overlap = overlap - stop
            if len(meaningful_overlap) >= 3:
                item_a.verified = True
                item_b.verified = True
    return all_items


def scrape_google_news(query: str, max_results: int = 5) -> list[NewsItem]:
    """Scrape Google News RSS feed for a given query."""
    items = []
    try:
        encoded_query = quote_plus(query)
        rss_url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"
        resp = requests.get(rss_url, headers=HEADERS, timeout=15)
        resp.raise_for_status()

        try:
            soup = BeautifulSoup(resp.content, "xml")
        except Exception:
            soup = BeautifulSoup(resp.content, "html.parser")
        entries = soup.find_all("item", limit=max_results)

        for entry in entries:
            title = entry.find("title")
            link = entry.find("link")
            pub_date = entry.find("pubDate")
            source = entry.find("source")
            description = entry.find("description")

            snippet = ""
            if description and description.text:
                desc_soup = BeautifulSoup(description.text, "html.parser")
                snippet = desc_soup.get_text(strip=True)[:200]

            news_url = ""
            if link:
                if link.string:
                    news_url = link.string.strip()
                elif link.next_sibling and isinstance(link.next_sibling, str):
                    news_url = link.next_sibling.strip()

            items.append(
                NewsItem(
                    title=title.text.strip() if title else "No title",
                    source=source.text.strip() if source else "Unknown",
                    url=news_url,
                    published=_format_date(pub_date.text.strip()) if pub_date else "Unknown",
                    snippet=snippet,
                )
            )
    except Exception as e:
        print(f"  [WARN] Google News fetch failed for '{query}': {type(e).__name__}")
    return items


def scrape_finviz_news(ticker: str, max_results: int = 5) -> list[NewsItem]:
    """Scrape news from Finviz for a given ticker."""
    items = []
    try:
        url = f"https://finviz.com/quote.ashx?t={ticker}"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        news_table = soup.find("table", {"id": "news-table"})
        if not news_table:
            return items

        rows = news_table.find_all("tr", limit=max_results)
        current_date = ""
        for row in rows:
            date_cell = row.find("td", {"align": "right"})
            content_cell = row.find("td", {"align": "left"})
            if not content_cell:
                continue

            if date_cell:
                date_text = date_cell.text.strip()
                if len(date_text) > 8:
                    current_date = date_text.split()[0]
                    time_str = date_text.split()[-1] if len(date_text.split()) > 1 else ""
                else:
                    time_str = date_text

            link = content_cell.find("a")
            if link:
                source_span = content_cell.find("span")
                items.append(
                    NewsItem(
                        title=link.text.strip(),
                        source=source_span.text.strip() if source_span else "Finviz",
                        url=link.get("href", ""),
                        published=f"{current_date} {time_str}".strip() if current_date else "Recent",
                        snippet="",
                    )
                )
    except Exception as e:
        print(f"  [WARN] Finviz fetch failed for '{ticker}': {type(e).__name__}")
    return items


def fetch_all_news(max_per_source: int = 5) -> dict[str, list[NewsItem]]:
    """Fetch, score, verify, and filter news for all companies."""
    all_news = {}
    all_items_flat = []  # for cross-verification

    for ticker, info in NUCLEAR_COMPANIES.items():
        company_news = []

        # Google News RSS (fetch more for better filtering)
        for keyword in info["keywords"][:1]:
            google_items = scrape_google_news(keyword, max_results=max_per_source)
            company_news.extend(google_items)

        # Finviz
        finviz_items = scrape_finviz_news(ticker, max_results=max_per_source)
        company_news.extend(finviz_items)

        # Deduplicate
        seen_titles = set()
        unique_news = []
        for item in company_news:
            title_key = item.title.lower()[:50]
            if title_key not in seen_titles:
                seen_titles.add(title_key)
                unique_news.append(item)

        # Score and tag each item
        for item in unique_news:
            item.score = _score_news(item)
            item.tags = _tag_news(item)

        all_items_flat.extend(unique_news)

        # Sort by score (highest first), keep top 2
        unique_news.sort(key=lambda x: x.score, reverse=True)

        # Filter out low-quality news (score < 20)
        quality_news = [n for n in unique_news if n.score >= 20]
        all_news[ticker] = quality_news[:2]

    # Cross-verify across all companies
    _cross_verify(all_items_flat)

    # Print verification summary
    total = sum(len(v) for v in all_news.values())
    verified = sum(1 for items in all_news.values() for i in items if i.verified)
    print(f"  Quality filter: {total} articles selected, {verified} cross-verified")

    return all_news


def _format_date(date_str: str) -> str:
    try:
        dt = datetime.strptime(date_str, "%a, %d %b %Y %H:%M:%S %Z")
        return dt.strftime("%Y-%m-%d %H:%M")
    except ValueError:
        try:
            dt = datetime.strptime(date_str, "%a, %d %b %Y %H:%M:%S %z")
            return dt.strftime("%Y-%m-%d %H:%M")
        except ValueError:
            return date_str
