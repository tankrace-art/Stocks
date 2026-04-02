"""
Nuclear News Dashboard - Card-style Korean dashboard for Telegram.
Inspired by the DRAM memory indicator dashboard format.
"""

from datetime import datetime
from nuclear_news.scraper import NUCLEAR_COMPANIES, NewsItem
from nuclear_news.translator import translate_to_korean


# Korean day names
DAY_KO = {
    "Monday": "월", "Tuesday": "화", "Wednesday": "수",
    "Thursday": "목", "Friday": "금", "Saturday": "토", "Sunday": "일",
}

# Korean company names
COMPANY_KO = {
    "OKLO": "오클로",
    "SMR": "뉴스케일파워",
    "LEU": "센트러스에너지",
    "CCJ": "카메코",
    "UEC": "우라늄에너지",
    "NNE": "나노뉴클리어",
}

# Sector config
SECTORS = [
    {
        "name": "SMR · 차세대 원자로",
        "emoji": "\u2622\ufe0f",
        "tickers": ["OKLO", "SMR", "NNE"],
    },
    {
        "name": "우라늄 · 핵연료",
        "emoji": "\u269b\ufe0f",
        "tickers": ["LEU", "CCJ", "UEC"],
    },
]


def format_dashboard(all_news: dict[str, list[NewsItem]]) -> str:
    """Format news into a card-style Korean dashboard."""
    now = datetime.now()
    day_ko = DAY_KO.get(now.strftime("%A"), "")
    date_str = now.strftime(f"%Y.%m.%d ({day_ko})")

    L = []

    # ═══ Header ═══
    L.append(f"<b>☢️ 미국 원자력 핵심 뉴스 대시보드</b>")
    L.append(f"<code>{date_str}</code>")
    L.append("")

    # ═══ Top briefing - pick the most recent headline ═══
    top_items = _pick_top_news(all_news, count=2)
    if top_items:
        L.append(f"\u26a1 <b>오늘의 핵심 브리핑</b>")
        L.append("")
        for ticker, item in top_items:
            ko_title = translate_to_korean(item.title)
            ko_title = _truncate(ko_title, 80)
            company_ko = COMPANY_KO.get(ticker, ticker)
            L.append(f"\u2022 <b>[{company_ko}]</b> {_escape_html(ko_title)}")
        L.append("")

    # ═══ Sector sections ═══
    for sector in SECTORS:
        L.append(f"{'━' * 26}")
        L.append(f"{sector['emoji']} <b>{sector['name']}</b>")
        L.append(f"{'━' * 26}")
        L.append("")

        for ticker in sector["tickers"]:
            news_items = all_news.get(ticker, [])
            company_ko = COMPANY_KO.get(ticker, "")
            company_en = NUCLEAR_COMPANIES[ticker]["name"]

            # ── Company card ──
            L.append(f"┌{'─' * 26}┐")
            L.append(f"│ <b>${ticker}</b> {company_ko}")
            L.append(f"│ <i>{company_en}</i>")
            L.append(f"│{'─' * 26}│")

            if not news_items:
                L.append(f"│ 최근 뉴스 없음")
            else:
                for item in news_items:
                    ko_title = translate_to_korean(item.title)
                    ko_title = _truncate(_escape_html(ko_title), 50)
                    date = _short_date(item.published)
                    source = _escape_html(item.source) if item.source else ""

                    L.append(f"│")
                    if item.url and not item.url.startswith("["):
                        L.append(f'│ \U0001f4f0 <a href="{item.url}">{ko_title}</a>')
                    else:
                        L.append(f"│ \U0001f4f0 {ko_title}")
                    L.append(f"│    <i>{source} · {date}</i>")

            L.append(f"└{'─' * 26}┘")
            L.append("")

    # ═══ Footer ═══
    L.append(f"{'─' * 26}")
    L.append(f"\U0001f4cb <i>출처: Finviz, Google News</i>")
    L.append(f"\U0001f916 <i>자동 생성 · {now.strftime('%H:%M')}</i>")

    return "\n".join(L)


def _pick_top_news(all_news: dict[str, list[NewsItem]], count: int = 2) -> list[tuple[str, NewsItem]]:
    """Pick the most recent/important headlines across all companies."""
    all_items = []
    for ticker, items in all_news.items():
        for item in items:
            all_items.append((ticker, item))

    # Sort by date (most recent first), using "Today" as highest priority
    def sort_key(pair):
        _, item = pair
        pub = item.published
        if "Today" in pub:
            return "9999"
        # Try to extract date for sorting
        return pub

    all_items.sort(key=sort_key, reverse=True)
    return all_items[:count]


def _escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "\u2026"


def _short_date(date_str: str) -> str:
    if not date_str or date_str == "Unknown":
        return ""
    if "Today" in date_str:
        return "오늘"
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M")
        return dt.strftime("%m/%d")
    except ValueError:
        pass
    # Handle "Mar-31-26 05:00AM" style
    parts = date_str.split()
    if parts:
        return parts[0]
    return date_str[:10]
