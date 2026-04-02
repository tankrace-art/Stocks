"""
US Nuclear Energy Companies News Scraper
Scrapes latest news for Oklo (OKLO), NuScale Power (SMR), Centrus Energy (LEU), etc.
"""

import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from dataclasses import dataclass


@dataclass
class NewsItem:
    title: str
    source: str
    url: str
    published: str
    snippet: str


# Target companies with ticker symbols and search keywords
NUCLEAR_COMPANIES = {
    "OKLO": {
        "name": "Oklo Inc.",
        "keywords": ["Oklo", "OKLO stock"],
    },
    "SMR": {
        "name": "NuScale Power",
        "keywords": ["NuScale Power", "SMR stock NuScale"],
    },
    "LEU": {
        "name": "Centrus Energy",
        "keywords": ["Centrus Energy", "LEU stock"],
    },
    "CCJ": {
        "name": "Cameco Corp",
        "keywords": ["Cameco", "CCJ stock"],
    },
    "UEC": {
        "name": "Uranium Energy Corp",
        "keywords": ["Uranium Energy Corp", "UEC stock"],
    },
    "NNE": {
        "name": "Nano Nuclear Energy",
        "keywords": ["Nano Nuclear Energy", "NNE stock"],
    },
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


def scrape_google_news(query: str, max_results: int = 5) -> list[NewsItem]:
    """Scrape Google News RSS feed for a given query."""
    items = []
    try:
        # URL-encode the query for better compatibility
        from urllib.parse import quote_plus
        encoded_query = quote_plus(query)
        rss_url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"
        resp = requests.get(rss_url, headers=HEADERS, timeout=15)
        resp.raise_for_status()

        # Try xml parser first, fall back to html.parser
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

            # Extract URL - Google News RSS puts URL as text after <link> tag
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


def fetch_all_news(max_per_source: int = 3) -> dict[str, list[NewsItem]]:
    """Fetch news for all tracked nuclear companies."""
    all_news = {}
    for ticker, info in NUCLEAR_COMPANIES.items():
        company_news = []

        # Google News RSS
        for keyword in info["keywords"][:1]:
            google_items = scrape_google_news(keyword, max_results=max_per_source)
            company_news.extend(google_items)

        # Finviz
        finviz_items = scrape_finviz_news(ticker, max_results=max_per_source)
        company_news.extend(finviz_items)

        # Deduplicate by title similarity
        seen_titles = set()
        unique_news = []
        for item in company_news:
            title_key = item.title.lower()[:50]
            if title_key not in seen_titles:
                seen_titles.add(title_key)
                unique_news.append(item)

        all_news[ticker] = unique_news[:2]

    return all_news


def _format_date(date_str: str) -> str:
    """Format RSS date string to readable format."""
    try:
        dt = datetime.strptime(date_str, "%a, %d %b %Y %H:%M:%S %Z")
        return dt.strftime("%Y-%m-%d %H:%M")
    except ValueError:
        try:
            dt = datetime.strptime(date_str, "%a, %d %b %Y %H:%M:%S %z")
            return dt.strftime("%Y-%m-%d %H:%M")
        except ValueError:
            return date_str
