"""
US Nuclear Energy Companies News Scraper
Filters for material company events only (contracts, regulatory, earnings, tech milestones).
Excludes analyst opinions, price targets, and stock recommendation articles.
"""

import requests
from bs4 import BeautifulSoup
from datetime import datetime
from dataclasses import dataclass, field
from urllib.parse import quote_plus


@dataclass
class NewsItem:
    title: str
    source: str
    url: str
    published: str
    snippet: str
    score: int = 0
    verified: bool = False
    tags: list = field(default_factory=list)


# ── Sources that publish actual company news (not opinions) ──
PRIMARY_SOURCES = {
    "Reuters", "Bloomberg", "AP News", "The Wall Street Journal",
    "CNBC", "Financial Times",
    "PR Newswire", "Business Wire", "GlobeNewswire", "Accesswire",  # company press releases
    "SEC Filing", "Nuclear Newswire", "World Nuclear News",
    "Power Magazine", "Utility Dive", "Energy.gov",
}
SECONDARY_SOURCES = {
    "MarketWatch", "Yahoo Finance", "Benzinga", "Nasdaq",
    "Exec Edge", "TMX Newsfilo",
}

# ── JUNK: these keywords = skip the article entirely ──
JUNK_PATTERNS = [
    # Analyst/broker opinions
    "price target", "raised to", "lowered to", "upgraded", "downgraded",
    "buy rating", "sell rating", "hold rating", "overweight", "underweight",
    "outperform", "neutral rating",
    # Stock picking / listicles
    "stocks to buy", "stocks to watch", "top picks", "best stocks",
    "should you buy", "is it a buy", "millionaire", "get rich",
    "short seller", "meme stock", "you won't believe",
    "stocks are a short seller's dream", "likely losers",
    "most popular stock", "wall street loves", "cathie wood buys",
    "ark invest", "whale alert",
    # Generic market commentary
    "why is.*moving", "why is.*up today", "why is.*down today",
    "what happened to", "stock alert",
    "fiduciary review", "class action", "lawsuit filed",  # legal spam
]

# ── SIGNAL: these keywords = actual company events worth knowing ──
SIGNAL_KEYWORDS = {
    # Regulatory / Licensing (가장 중요)
    "nrc": ("인허가", 25), "nuclear regulatory": ("인허가", 25),
    "license": ("인허가", 20), "permit": ("인허가", 20),
    "approved": ("승인", 20), "approval": ("승인", 20),
    "regulatory": ("규제", 15),
    # Contracts & Business
    "contract": ("계약", 20), "agreement": ("계약", 18),
    "partnership": ("제휴", 18), "strategic": ("전략", 12),
    "signed": ("계약체결", 18), "awarded": ("수주", 20),
    "memorandum": ("MOU", 15), "mou": ("MOU", 15),
    # Financials
    "earnings": ("실적", 18), "revenue": ("실적", 15),
    "quarterly results": ("분기실적", 20), "annual report": ("연간실적", 18),
    "profit": ("실적", 12), "loss": ("실적", 12),
    # Technology & Operations
    "construction": ("건설", 18), "deployment": ("배치", 18),
    "operational": ("운영", 15), "commissioning": ("시운전", 20),
    "milestone": ("이정표", 15), "first criticality": ("임계", 25),
    "enrichment": ("농축", 15), "production": ("생산", 12),
    "fuel delivery": ("연료공급", 20), "fuel fabrication": ("연료제조", 18),
    # Government & Policy
    "doe": ("에너지부", 15), "department of energy": ("에너지부", 15),
    "funding": ("자금지원", 15), "grant": ("보조금", 15),
    "executive order": ("행정명령", 20), "legislation": ("법안", 15),
    "bipartisan": ("초당적", 10),
    # Major corporate events
    "acquisition": ("인수", 20), "merger": ("합병", 20),
    "ipo": ("IPO", 18), "offering": ("증자", 12),
    "ceo": ("CEO", 10), "appointed": ("인사", 12), "resigned": ("인사", 15),
}

NUCLEAR_COMPANIES = {
    "OKLO": {"name": "Oklo Inc.", "keywords": ["Oklo Inc"]},
    "SMR": {"name": "NuScale Power", "keywords": ["NuScale Power"]},
    "LEU": {"name": "Centrus Energy", "keywords": ["Centrus Energy"]},
    "CCJ": {"name": "Cameco Corp", "keywords": ["Cameco corporation"]},
    "UEC": {"name": "Uranium Energy Corp", "keywords": ["Uranium Energy Corp"]},
    "NNE": {"name": "Nano Nuclear Energy", "keywords": ["Nano Nuclear Energy"]},
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


def _is_junk(item: NewsItem) -> bool:
    """Return True if this is an analyst opinion or clickbait article."""
    text = (item.title + " " + item.snippet).lower()
    for pattern in JUNK_PATTERNS:
        if pattern in text:
            return True
    return False


def _score_news(item: NewsItem) -> tuple[int, list[str]]:
    """Score by how material the news is for investment decisions.
    Returns (score, tags). Higher = more important company event."""
    score = 0
    tags = []
    seen_tags = set()
    text = (item.title + " " + item.snippet).lower()

    # Signal keyword matching
    for keyword, (tag, points) in SIGNAL_KEYWORDS.items():
        if keyword in text:
            score += points
            if tag not in seen_tags:
                tags.append(tag)
                seen_tags.add(tag)

    # Source credibility
    src = item.source
    if src in PRIMARY_SOURCES or any(s.lower() in src.lower() for s in PRIMARY_SOURCES):
        score += 20
    elif src in SECONDARY_SOURCES or any(s.lower() in src.lower() for s in SECONDARY_SOURCES):
        score += 8

    # Press releases are usually material company announcements
    if any(pr in src for pr in ["PR Newswire", "Business Wire", "GlobeNewswire", "Accesswire"]):
        score += 10
        if "보도자료" not in seen_tags:
            tags.append("보도자료")

    # Recency
    if "Today" in item.published:
        score += 10
    elif _is_within_days(item.published, 3):
        score += 5

    # Has substance (snippet available)
    if item.snippet and len(item.snippet) > 50:
        score += 5

    return score, tags[:3]


def _is_within_days(date_str: str, days: int) -> bool:
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M")
        return (datetime.now() - dt).days <= days
    except ValueError:
        return False


def _cross_verify(all_items: list[NewsItem]) -> None:
    """Mark items as verified if similar titles appear from different sources."""
    for i, a in enumerate(all_items):
        for j, b in enumerate(all_items):
            if i >= j or a.source == b.source:
                continue
            words_a = set(a.title.lower().split())
            words_b = set(b.title.lower().split())
            stop = {"the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "is", "with", "as"}
            overlap = (words_a & words_b) - stop
            if len(overlap) >= 3:
                a.verified = True
                b.verified = True


def scrape_google_news(query: str, max_results: int = 8) -> list[NewsItem]:
    """Scrape Google News RSS feed."""
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

        for entry in soup.find_all("item", limit=max_results):
            title = entry.find("title")
            link = entry.find("link")
            pub_date = entry.find("pubDate")
            source = entry.find("source")
            description = entry.find("description")

            snippet = ""
            if description and description.text:
                desc_soup = BeautifulSoup(description.text, "html.parser")
                snippet = desc_soup.get_text(strip=True)[:300]

            news_url = ""
            if link:
                if link.string:
                    news_url = link.string.strip()
                elif link.next_sibling and isinstance(link.next_sibling, str):
                    news_url = link.next_sibling.strip()

            items.append(NewsItem(
                title=title.text.strip() if title else "",
                source=source.text.strip() if source else "Unknown",
                url=news_url,
                published=_format_date(pub_date.text.strip()) if pub_date else "Unknown",
                snippet=snippet,
            ))
    except Exception as e:
        print(f"  [WARN] Google News failed for '{query}': {type(e).__name__}")
    return items


def scrape_finviz_news(ticker: str, max_results: int = 8) -> list[NewsItem]:
    """Scrape news from Finviz."""
    items = []
    try:
        url = f"https://finviz.com/quote.ashx?t={ticker}"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        news_table = soup.find("table", {"id": "news-table"})
        if not news_table:
            return items

        current_date = ""
        for row in news_table.find_all("tr", limit=max_results):
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
                items.append(NewsItem(
                    title=link.text.strip(),
                    source=source_span.text.strip() if source_span else "Finviz",
                    url=link.get("href", ""),
                    published=f"{current_date} {time_str}".strip() if current_date else "Recent",
                    snippet="",
                ))
    except Exception as e:
        print(f"  [WARN] Finviz failed for '{ticker}': {type(e).__name__}")
    return items


def fetch_all_news(max_per_source: int = 8) -> dict[str, list[NewsItem]]:
    """Fetch, filter junk, score, and return only material news.
    Companies with no meaningful news are returned with empty lists."""
    all_news = {}
    all_items_flat = []

    for ticker, info in NUCLEAR_COMPANIES.items():
        raw_news = []

        # Fetch from multiple sources
        for keyword in info["keywords"]:
            raw_news.extend(scrape_google_news(keyword, max_results=max_per_source))
        raw_news.extend(scrape_finviz_news(ticker, max_results=max_per_source))

        # Deduplicate
        seen = set()
        unique = []
        for item in raw_news:
            key = item.title.lower()[:60]
            if key not in seen and item.title:
                seen.add(key)
                unique.append(item)

        # Step 1: Remove junk (analyst opinions, clickbait)
        filtered = [item for item in unique if not _is_junk(item)]
        junk_count = len(unique) - len(filtered)
        if junk_count:
            print(f"  [{ticker}] Filtered out {junk_count} junk articles")

        # Step 2: Score remaining by materiality
        for item in filtered:
            item.score, item.tags = _score_news(item)

        all_items_flat.extend(filtered)

        # Step 3: Keep only material news (score >= 25)
        material = [n for n in filtered if n.score >= 25]
        material.sort(key=lambda x: x.score, reverse=True)

        # Max 2 per company
        all_news[ticker] = material[:2]

    # Cross-verify
    _cross_verify(all_items_flat)

    # Summary
    total = sum(len(v) for v in all_news.values())
    companies_with_news = sum(1 for v in all_news.values() if v)
    verified = sum(1 for items in all_news.values() for i in items if i.verified)
    print(f"  Result: {total} material articles from {companies_with_news} companies ({verified} cross-verified)")

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
