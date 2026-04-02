"""
Nuclear News Dashboard - Formats news into a compact, A4-style Telegram dashboard.
"""

from datetime import datetime
from nuclear_news.scraper import NUCLEAR_COMPANIES, NewsItem


# Sector grouping
SECTORS = {
    "SMR / Advanced Reactors": {
        "emoji": "\u2622\ufe0f",
        "tickers": ["OKLO", "SMR", "NNE"],
    },
    "Uranium / Fuel": {
        "emoji": "\u269b\ufe0f",
        "tickers": ["LEU", "CCJ", "UEC"],
    },
}


def format_dashboard(all_news: dict[str, list[NewsItem]]) -> str:
    """Format all news into a compact A4-style dashboard for Telegram."""
    now = datetime.now()
    date_str = now.strftime("%Y.%m.%d %A")

    L = []

    # ── Header ──
    L.append("\u2500" * 28)
    L.append(f"\u26a1 <b>US NUCLEAR DAILY BRIEF</b>")
    L.append(f"\U0001f4c5 {date_str}")
    L.append("\u2500" * 28)

    # ── News by sector ──
    for sector_name, sector_info in SECTORS.items():
        L.append("")
        L.append(f"{sector_info['emoji']} <b>{sector_name}</b>")
        L.append("")

        for ticker in sector_info["tickers"]:
            company_name = NUCLEAR_COMPANIES[ticker]["name"]
            news_items = all_news.get(ticker, [])

            L.append(f"  <b>${ticker}</b> {company_name}")

            if not news_items:
                L.append(f"    \u2514 <i>No recent news</i>")
            else:
                for i, item in enumerate(news_items):
                    connector = "\u251c" if i < len(news_items) - 1 else "\u2514"
                    title = _truncate(_escape_html(item.title), 65)
                    date = _short_date(item.published)

                    if item.url and not item.url.startswith("["):
                        L.append(f'    {connector} <a href="{item.url}">{title}</a>')
                    else:
                        L.append(f"    {connector} {title}")
                    L.append(f"      {_escape_html(item.source)} \u00b7 {date}")

            L.append("")

    # ── Footer ──
    L.append("\u2500" * 28)
    L.append(f"\U0001f4f0 <i>Finviz, Google News</i>")
    L.append(f"\U0001f916 <i>Auto-generated at {now.strftime('%H:%M')}</i>")

    return "\n".join(L)


def _escape_html(text: str) -> str:
    """Escape HTML special characters for Telegram HTML mode."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _truncate(text: str, max_len: int) -> str:
    """Truncate text with ellipsis if too long."""
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "\u2026"


def _short_date(date_str: str) -> str:
    """Convert date string to compact format."""
    if not date_str or date_str == "Unknown":
        return ""
    # Already short like "Mar-31-26 05:00AM"
    if "Today" in date_str:
        return "Today"
    # Try to shorten "2026-04-01 12:30" -> "Apr 01"
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M")
        return dt.strftime("%b %d")
    except ValueError:
        pass
    # Return as-is but truncate
    return date_str[:16]
