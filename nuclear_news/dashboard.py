"""
Nuclear News Image Dashboard - Generates a visual PNG dashboard for Telegram.
Card-style layout inspired by financial indicator dashboards.
"""

import os
import textwrap
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
from nuclear_news.scraper import NUCLEAR_COMPANIES, NewsItem
from nuclear_news.translator import translate_to_korean


# ── Colors ──
BG_COLOR = (255, 255, 255)
HEADER_BG = (17, 24, 39)        # dark navy
HEADER_TEXT = (255, 255, 255)
SECTION_BG = (241, 245, 249)    # light gray
SECTION_TEXT = (30, 41, 59)
CARD_BG = (255, 255, 255)
CARD_BORDER = (203, 213, 225)   # slate-300
TITLE_COLOR = (15, 23, 42)      # slate-900
SUB_COLOR = (100, 116, 139)     # slate-500
ACCENT_GREEN = (22, 163, 74)
ACCENT_BLUE = (37, 99, 235)
ACCENT_ORANGE = (234, 88, 12)
BRIEFING_BG = (254, 252, 232)   # yellow-50
BRIEFING_BORDER = (234, 179, 8) # yellow-500
SECTOR1_ACCENT = (220, 38, 38)  # red for nuclear
SECTOR2_ACCENT = (37, 99, 235)  # blue for uranium

# ── Layout ──
W = 1000  # image width
PADDING = 30
CARD_PAD = 16
CARD_GAP = 14
CARD_RADIUS = 10

# ── Korean mappings ──
DAY_KO = {
    "Monday": "월", "Tuesday": "화", "Wednesday": "수",
    "Thursday": "목", "Friday": "금", "Saturday": "토", "Sunday": "일",
}
COMPANY_KO = {
    "OKLO": "오클로", "SMR": "뉴스케일파워", "LEU": "센트러스에너지",
    "CCJ": "카메코", "UEC": "우라늄에너지", "NNE": "나노뉴클리어",
}
SECTORS = [
    {"name": "SMR · 차세대 원자로", "accent": SECTOR1_ACCENT, "tickers": ["OKLO", "SMR", "NNE"]},
    {"name": "우라늄 · 핵연료", "accent": SECTOR2_ACCENT, "tickers": ["LEU", "CCJ", "UEC"]},
]


def _load_fonts():
    """Load fonts with fallback."""
    # Try common Korean font paths
    ko_font_paths = [
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",              # Linux (WenQuanYi)
        "C:/Windows/Fonts/malgun.ttf",                                 # Windows (맑은 고딕)
        "C:/Windows/Fonts/NanumGothic.ttf",                           # Windows (나눔고딕)
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",                 # macOS
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",            # Linux (Nanum)
    ]
    font_path = None
    for p in ko_font_paths:
        if os.path.exists(p):
            font_path = p
            break

    if font_path:
        return {
            "title_lg": ImageFont.truetype(font_path, 28),
            "title_md": ImageFont.truetype(font_path, 22),
            "title_sm": ImageFont.truetype(font_path, 18),
            "body": ImageFont.truetype(font_path, 16),
            "body_sm": ImageFont.truetype(font_path, 14),
            "caption": ImageFont.truetype(font_path, 12),
        }
    else:
        # Fallback to default
        return {k: ImageFont.load_default() for k in
                ["title_lg", "title_md", "title_sm", "body", "body_sm", "caption"]}


def _draw_rounded_rect(draw, xy, radius, fill=None, outline=None, width=1):
    """Draw a rounded rectangle."""
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def _wrap_text(text, font, max_width, draw):
    """Word-wrap text to fit within max_width pixels."""
    lines = []
    # For Korean text, wrap by character count estimation
    avg_char_w = draw.textlength("가", font=font)
    if avg_char_w == 0:
        avg_char_w = 14
    chars_per_line = max(1, int(max_width / avg_char_w))

    for line in textwrap.wrap(text, width=chars_per_line):
        lines.append(line)
    return lines if lines else [text]


def format_dashboard(all_news: dict[str, list[NewsItem]]) -> str:
    """Generate dashboard image and return the file path."""
    fonts = _load_fonts()

    # ── First pass: calculate total height ──
    y = 0
    y += 80   # header
    y += 10   # gap

    # briefing
    top_items = _pick_top_news(all_news, count=2)
    y += 20   # padding
    y += 30   # briefing title
    y += len(top_items) * 50 + 20

    # sectors
    for sector in SECTORS:
        y += 50  # sector header
        for ticker in sector["tickers"]:
            y += 20  # gap
            y += 50  # company header in card
            news_items = all_news.get(ticker, [])
            if not news_items:
                y += 40
            else:
                for item in news_items:
                    y += 65  # each news item
            y += CARD_PAD  # card bottom padding

    y += 60  # footer
    y += PADDING

    H = max(y, 400)

    # ── Create image ──
    img = Image.new("RGB", (W, H), BG_COLOR)
    draw = ImageDraw.Draw(img)
    y = 0

    # ═══════════════════════════════════════
    # HEADER
    # ═══════════════════════════════════════
    draw.rectangle([(0, 0), (W, 80)], fill=HEADER_BG)

    now = datetime.now()
    day_ko = DAY_KO.get(now.strftime("%A"), "")
    date_str = now.strftime(f"%Y.%m.%d ({day_ko})")

    draw.text((PADDING, 16), "☢️  미국 원자력 핵심 뉴스 대시보드", fill=HEADER_TEXT, font=fonts["title_lg"])
    draw.text((W - PADDING - draw.textlength(date_str, font=fonts["title_sm"]), 22),
              date_str, fill=(148, 163, 184), font=fonts["title_sm"])
    y = 80

    # ═══════════════════════════════════════
    # TOP BRIEFING BOX
    # ═══════════════════════════════════════
    y += 14
    if top_items:
        briefing_h = 30 + len(top_items) * 50 + 10
        _draw_rounded_rect(draw,
                           (PADDING, y, W - PADDING, y + briefing_h),
                           radius=8, fill=BRIEFING_BG, outline=BRIEFING_BORDER, width=2)

        # Left accent bar
        draw.rectangle([(PADDING, y + 4), (PADDING + 5, y + briefing_h - 4)],
                       fill=BRIEFING_BORDER)

        by = y + 12
        draw.text((PADDING + 16, by), "⚡  오늘의 핵심 브리핑", fill=ACCENT_ORANGE, font=fonts["title_sm"])
        by += 32

        for ticker, item in top_items:
            ko_title = translate_to_korean(item.title)
            ko_title = _truncate(ko_title, 60)
            company_ko = COMPANY_KO.get(ticker, ticker)

            draw.text((PADDING + 20, by), f"▸ [{company_ko}]", fill=TITLE_COLOR, font=fonts["body"])
            tag_w = draw.textlength(f"▸ [{company_ko}] ", font=fonts["body"])
            draw.text((PADDING + 20 + tag_w, by), ko_title, fill=SUB_COLOR, font=fonts["body"])
            by += 44

        y += briefing_h + 10

    # ═══════════════════════════════════════
    # SECTOR SECTIONS
    # ═══════════════════════════════════════
    for sector in SECTORS:
        y += 10

        # Sector header bar
        draw.rectangle([(PADDING, y), (W - PADDING, y + 38)], fill=SECTION_BG)
        draw.rectangle([(PADDING, y), (PADDING + 5, y + 38)], fill=sector["accent"])
        draw.text((PADDING + 16, y + 8), f"  {sector['name']}", fill=SECTION_TEXT, font=fonts["title_sm"])
        y += 48

        # Company cards (side by side if possible, else stacked)
        tickers = sector["tickers"]
        card_w = (W - 2 * PADDING - (len(tickers) - 1) * CARD_GAP) // len(tickers)

        # Calculate max card height for this sector
        card_heights = []
        for ticker in tickers:
            news_items = all_news.get(ticker, [])
            ch = 50  # header
            if not news_items:
                ch += 35
            else:
                ch += len(news_items) * 65
            ch += CARD_PAD
            card_heights.append(ch)
        max_card_h = max(card_heights)

        # Draw cards side by side
        for i, ticker in enumerate(tickers):
            cx = PADDING + i * (card_w + CARD_GAP)
            news_items = all_news.get(ticker, [])
            company_ko = COMPANY_KO.get(ticker, "")
            company_en = NUCLEAR_COMPANIES[ticker]["name"]

            # Card background
            _draw_rounded_rect(draw,
                               (cx, y, cx + card_w, y + max_card_h),
                               radius=CARD_RADIUS, fill=CARD_BG,
                               outline=CARD_BORDER, width=1)

            # Top accent line
            draw.rectangle([(cx + 1, y + 1), (cx + card_w - 1, y + 4)],
                           fill=sector["accent"])

            # Company name
            cy = y + 10
            draw.text((cx + CARD_PAD, cy), f"${ticker}", fill=sector["accent"], font=fonts["title_sm"])
            ticker_w = draw.textlength(f"${ticker} ", font=fonts["title_sm"])
            draw.text((cx + CARD_PAD + ticker_w, cy + 2), company_ko, fill=TITLE_COLOR, font=fonts["body"])
            cy += 24
            draw.text((cx + CARD_PAD, cy), company_en, fill=SUB_COLOR, font=fonts["body_sm"])
            cy += 22

            # Divider
            draw.line([(cx + CARD_PAD, cy), (cx + card_w - CARD_PAD, cy)],
                      fill=CARD_BORDER, width=1)
            cy += 8

            # News items
            if not news_items:
                draw.text((cx + CARD_PAD, cy + 4), "최근 뉴스 없음", fill=SUB_COLOR, font=fonts["body_sm"])
            else:
                for item in news_items:
                    ko_title = translate_to_korean(item.title)
                    max_title_chars = max(1, (card_w - 2 * CARD_PAD) // 14)
                    ko_title = _truncate(ko_title, max_title_chars)
                    date = _short_date(item.published)
                    source = item.source if item.source else ""

                    draw.text((cx + CARD_PAD, cy), "📰", fill=TITLE_COLOR, font=fonts["body_sm"])
                    draw.text((cx + CARD_PAD + 20, cy), ko_title, fill=TITLE_COLOR, font=fonts["body_sm"])
                    cy += 20
                    draw.text((cx + CARD_PAD + 20, cy), f"{source} · {date}",
                              fill=SUB_COLOR, font=fonts["caption"])
                    cy += 24

                    # Small divider between news items
                    if item != news_items[-1]:
                        draw.line([(cx + CARD_PAD + 20, cy - 4), (cx + card_w - CARD_PAD, cy - 4)],
                                  fill=(226, 232, 240), width=1)

        y += max_card_h + CARD_GAP

    # ═══════════════════════════════════════
    # FOOTER
    # ═══════════════════════════════════════
    y += 6
    draw.line([(PADDING, y), (W - PADDING, y)], fill=CARD_BORDER, width=1)
    y += 10
    footer = f"📋 출처: Finviz, Google News  |  🤖 자동 생성 · {now.strftime('%H:%M')}"
    draw.text((PADDING, y), footer, fill=SUB_COLOR, font=fonts["body_sm"])

    # ── Save ──
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, f"dashboard_{now.strftime('%Y%m%d_%H%M')}.png")
    img.save(filepath, "PNG", quality=95)
    print(f"  Dashboard image saved: {filepath}")

    return filepath


def _pick_top_news(all_news, count=2):
    all_items = []
    for ticker, items in all_news.items():
        for item in items:
            all_items.append((ticker, item))

    def sort_key(pair):
        _, item = pair
        pub = item.published
        if "Today" in pub:
            return "9999"
        return pub

    all_items.sort(key=sort_key, reverse=True)
    return all_items[:count]


def _truncate(text, max_len):
    if len(text) <= max_len:
        return text
    return text[:max_len - 1] + "…"


def _short_date(date_str):
    if not date_str or date_str == "Unknown":
        return ""
    if "Today" in date_str:
        return "오늘"
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M")
        return dt.strftime("%m/%d")
    except ValueError:
        pass
    parts = date_str.split()
    return parts[0] if parts else date_str[:10]
