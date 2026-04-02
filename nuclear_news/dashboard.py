"""
Nuclear News Dashboard - Formats news into a Telegram-friendly dashboard.
"""

from datetime import datetime
from nuclear_news.scraper import NUCLEAR_COMPANIES, NewsItem


# Emoji mapping per company
TICKER_EMOJI = {
    "OKLO": "\u2622\ufe0f",   # radioactive
    "SMR": "\u26a1",           # lightning
    "LEU": "\u269b\ufe0f",    # atom
    "CCJ": "\u26cf\ufe0f",    # pick
    "UEC": "\U0001f4a1",      # lightbulb
    "NNE": "\U0001f52c",      # microscope
}


def format_dashboard(all_news: dict[str, list[NewsItem]]) -> str:
    """Format all news into a dashboard-style HTML message for Telegram."""
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d (%A)")

    lines = []
    lines.append(f"\U0001f4ca <b>US Nuclear Energy Daily News</b>")
    lines.append(f"\U0001f4c5 {date_str}")
    lines.append(f"\u23f0 Report generated at {now.strftime('%H:%M')}")
    lines.append("")
    lines.append("\u2501" * 25)

    for ticker, news_items in all_news.items():
        emoji = TICKER_EMOJI.get(ticker, "\U0001f4cb")
        company_name = NUCLEAR_COMPANIES[ticker]["name"]

        lines.append("")
        lines.append(f"{emoji} <b>{company_name} (${ticker})</b>")
        lines.append("\u2500" * 20)

        if not news_items:
            lines.append("  \u2022 No recent news found")
            continue

        for i, item in enumerate(news_items, 1):
            if item.url and not item.url.startswith("["):
                lines.append(f'  {i}. <a href="{item.url}">{_escape_html(item.title)}</a>')
            else:
                lines.append(f"  {i}. {_escape_html(item.title)}")

            meta = []
            if item.source and item.source != "Error":
                meta.append(f"\U0001f4f0 {_escape_html(item.source)}")
            if item.published and item.published != "Unknown":
                meta.append(f"\U0001f552 {item.published}")
            if meta:
                lines.append(f"     {' | '.join(meta)}")

    lines.append("")
    lines.append("\u2501" * 25)
    lines.append(
        "\U0001f4a1 <i>Sources: Google News, Finviz</i>"
    )
    lines.append(
        f"\U0001f916 <i>Auto-generated Nuclear News Dashboard</i>"
    )

    return "\n".join(lines)


def _escape_html(text: str) -> str:
    """Escape HTML special characters for Telegram HTML mode."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
