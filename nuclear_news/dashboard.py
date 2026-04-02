"""
Nuclear News Image Dashboard - Visual PNG dashboard for Telegram.
Wide card layout with Korean summaries for readability.
"""

import os
import textwrap
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
from nuclear_news.scraper import NUCLEAR_COMPANIES, NewsItem
from nuclear_news.translator import translate_to_korean


# ── Colors ──
BG = (246, 248, 250)
HEADER_BG = (17, 24, 39)
HEADER_TEXT = (255, 255, 255)
WHITE = (255, 255, 255)
BORDER = (209, 213, 219)
TITLE = (15, 23, 42)
BODY = (51, 65, 85)
SUB = (100, 116, 139)
LIGHT_LINE = (226, 232, 240)
BRIEFING_BG = (255, 251, 235)
BRIEFING_BORDER = (245, 158, 11)
RED = (220, 38, 38)
BLUE = (37, 99, 235)
ORANGE = (234, 88, 12)
TAG_BG_RED = (254, 226, 226)
TAG_BG_BLUE = (219, 234, 254)

# ── Layout ──
W = 1080
PAD = 32
CARD_PAD = 20
RADIUS = 12

# ── Korean ──
DAY_KO = {"Monday": "월", "Tuesday": "화", "Wednesday": "수",
           "Thursday": "목", "Friday": "금", "Saturday": "토", "Sunday": "일"}
COMPANY_KO = {
    "OKLO": "오클로", "SMR": "뉴스케일파워", "LEU": "센트러스에너지",
    "CCJ": "카메코", "UEC": "우라늄에너지", "NNE": "나노뉴클리어",
}
SECTORS = [
    {"name": "차세대 원자로 (SMR)", "accent": RED, "tag_bg": TAG_BG_RED,
     "tickers": ["OKLO", "SMR", "NNE"]},
    {"name": "우라늄 · 핵연료", "accent": BLUE, "tag_bg": TAG_BG_BLUE,
     "tickers": ["LEU", "CCJ", "UEC"]},
]


def _load_fonts():
    paths = [
        "C:/Windows/Fonts/malgun.ttf",
        "C:/Windows/Fonts/malgunbd.ttf",
        "C:/Windows/Fonts/NanumGothicBold.ttf",
        "C:/Windows/Fonts/NanumGothic.ttf",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    ]
    # Find bold and regular fonts
    font_path = None
    for p in paths:
        if os.path.exists(p):
            font_path = p
            break

    # Try to find bold variant
    bold_path = font_path
    bold_candidates = [
        "C:/Windows/Fonts/malgunbd.ttf",
        "C:/Windows/Fonts/NanumGothicBold.ttf",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    ]
    for p in bold_candidates:
        if os.path.exists(p):
            bold_path = p
            break

    if font_path:
        return {
            "header": ImageFont.truetype(bold_path, 30),
            "section": ImageFont.truetype(bold_path, 22),
            "company": ImageFont.truetype(bold_path, 20),
            "ticker": ImageFont.truetype(bold_path, 18),
            "news_title": ImageFont.truetype(bold_path, 17),
            "news_body": ImageFont.truetype(font_path, 15),
            "caption": ImageFont.truetype(font_path, 14),
            "date": ImageFont.truetype(font_path, 13),
        }
    return {k: ImageFont.load_default() for k in
            ["header", "section", "company", "ticker", "news_title",
             "news_body", "caption", "date"]}


def _wrap(text, font, max_w, draw):
    """Wrap Korean text to fit pixel width."""
    if not text:
        return [""]
    char_w = draw.textlength("가나", font=font) / 2
    if char_w == 0:
        char_w = 15
    cpl = max(1, int(max_w / char_w))
    lines = textwrap.wrap(text, width=cpl)
    return lines if lines else [text]


def format_dashboard(all_news: dict[str, list[NewsItem]]) -> str:
    """Generate dashboard image, return file path."""
    fonts = _load_fonts()
    now = datetime.now()
    day_ko = DAY_KO.get(now.strftime("%A"), "")

    # ── Translate all news upfront ──
    translated = {}  # ticker -> list of (ko_title, ko_summary)
    for ticker, items in all_news.items():
        translated[ticker] = []
        for item in items:
            ko_title = translate_to_korean(item.title)
            ko_summary = ""
            if item.snippet:
                ko_summary = translate_to_korean(item.snippet)
            else:
                # Create a brief context from the title
                ko_summary = ko_title
            translated[ticker].append((ko_title, ko_summary))

    # ── Two-pass rendering: measure then draw ──
    # We'll render to a tall canvas, then crop
    MAX_H = 3000
    img = Image.new("RGB", (W, MAX_H), BG)
    draw = ImageDraw.Draw(img)
    content_w = W - 2 * PAD

    y = 0

    # ═══ HEADER ═══
    header_h = 70
    draw.rectangle([(0, 0), (W, header_h)], fill=HEADER_BG)
    draw.text((PAD, 18), "☢  미국 원자력 핵심 뉴스 대시보드",
              fill=HEADER_TEXT, font=fonts["header"])
    date_text = now.strftime(f"%Y.%m.%d ({day_ko})")
    dw = draw.textlength(date_text, font=fonts["ticker"])
    draw.text((W - PAD - dw, 26), date_text, fill=(148, 163, 184), font=fonts["ticker"])
    y = header_h + 16

    # ═══ BRIEFING BOX ═══
    top_items = _pick_top_news(all_news, count=3)
    if top_items:
        # Calculate briefing height
        briefing_lines = []
        for ticker, item in top_items:
            ko_title = translate_to_korean(item.title)
            company_ko = COMPANY_KO.get(ticker, ticker)
            line = f"[{company_ko}] {ko_title}"
            wrapped = _wrap(line, fonts["news_body"], content_w - 60, draw)
            briefing_lines.append(wrapped)

        total_lines = sum(len(wl) for wl in briefing_lines)
        brief_h = 44 + total_lines * 22 + len(briefing_lines) * 8 + 8

        # Box
        draw.rounded_rectangle(
            [(PAD, y), (W - PAD, y + brief_h)],
            radius=10, fill=BRIEFING_BG, outline=BRIEFING_BORDER, width=2)
        # Left accent
        draw.rectangle([(PAD + 1, y + 6), (PAD + 6, y + brief_h - 6)],
                       fill=BRIEFING_BORDER)

        by = y + 14
        draw.text((PAD + 18, by), "⚡ 오늘의 핵심 브리핑",
                  fill=ORANGE, font=fonts["section"])
        by += 34

        for wl in briefing_lines:
            draw.text((PAD + 22, by), "▸", fill=ORANGE, font=fonts["news_body"])
            for i, line in enumerate(wl):
                x_off = PAD + 38 if i == 0 else PAD + 38
                draw.text((x_off, by), line, fill=BODY, font=fonts["news_body"])
                by += 22
            by += 8

        y += brief_h + 18

    # ═══ SECTORS ═══
    for sector in SECTORS:
        # Section header
        draw.rounded_rectangle(
            [(PAD, y), (W - PAD, y + 40)],
            radius=8, fill=sector["accent"])
        draw.text((PAD + 16, y + 8), f"  {sector['name']}",
                  fill=WHITE, font=fonts["section"])
        y += 52

        # Company cards - 1 per row, full width for readability
        for ticker in sector["tickers"]:
            items = all_news.get(ticker, [])
            trans = translated.get(ticker, [])
            company_ko = COMPANY_KO.get(ticker, "")
            company_en = NUCLEAR_COMPANIES[ticker]["name"]

            # Calculate card height
            card_content_h = 0
            news_blocks = []
            for idx, item in enumerate(items):
                ko_title = trans[idx][0] if idx < len(trans) else item.title
                ko_summary = trans[idx][1] if idx < len(trans) else ""

                title_lines = _wrap(ko_title, fonts["news_title"], content_w - 80, draw)
                summary_lines = []
                if ko_summary and ko_summary != ko_title:
                    summary_text = _truncate(ko_summary, 120)
                    summary_lines = _wrap(summary_text, fonts["news_body"], content_w - 80, draw)
                    summary_lines = summary_lines[:2]  # max 2 lines

                block_h = len(title_lines) * 24 + len(summary_lines) * 20 + 22 + 12
                card_content_h += block_h
                news_blocks.append((item, ko_title, title_lines, summary_lines, block_h))

            if not items:
                card_content_h = 36

            card_h = 56 + card_content_h + 8  # header + content + padding
            card_x = PAD
            card_w = content_w

            # Card background
            draw.rounded_rectangle(
                [(card_x, y), (card_x + card_w, y + card_h)],
                radius=RADIUS, fill=WHITE, outline=BORDER, width=1)

            # Top accent stripe
            draw.rectangle(
                [(card_x + 1, y + 1), (card_x + card_w - 1, y + 5)],
                fill=sector["accent"])

            # Company header
            cy = y + 12
            # Ticker tag
            tag_text = f" ${ticker} "
            tw = draw.textlength(tag_text, font=fonts["ticker"])
            draw.rounded_rectangle(
                [(card_x + CARD_PAD, cy - 2), (card_x + CARD_PAD + tw + 8, cy + 22)],
                radius=4, fill=sector["tag_bg"])
            draw.text((card_x + CARD_PAD + 4, cy), tag_text,
                      fill=sector["accent"], font=fonts["ticker"])

            # Company name
            draw.text((card_x + CARD_PAD + tw + 18, cy),
                      f"{company_ko}  {company_en}",
                      fill=TITLE, font=fonts["company"])
            cy += 32

            # Divider
            draw.line([(card_x + CARD_PAD, cy), (card_x + card_w - CARD_PAD, cy)],
                      fill=LIGHT_LINE, width=1)
            cy += 12

            # News items
            if not news_blocks:
                draw.text((card_x + CARD_PAD, cy + 4), "  최근 뉴스 없음",
                          fill=SUB, font=fonts["news_body"])
            else:
                for bi, (item, ko_title, title_lines, summary_lines, bh) in enumerate(news_blocks):
                    date = _short_date(item.published)
                    source = item.source or ""

                    # Date/source tag
                    tag = f"{source} · {date}" if source else date
                    draw.text((card_x + CARD_PAD + 4, cy), tag,
                              fill=SUB, font=fonts["date"])
                    cy += 20

                    # Title (bold)
                    for line in title_lines:
                        draw.text((card_x + CARD_PAD + 4, cy), line,
                                  fill=TITLE, font=fonts["news_title"])
                        cy += 24

                    # Summary (lighter, smaller)
                    for line in summary_lines:
                        draw.text((card_x + CARD_PAD + 4, cy), line,
                                  fill=SUB, font=fonts["news_body"])
                        cy += 20

                    cy += 6

                    # Divider between news
                    if bi < len(news_blocks) - 1:
                        draw.line(
                            [(card_x + CARD_PAD + 4, cy),
                             (card_x + card_w - CARD_PAD, cy)],
                            fill=LIGHT_LINE, width=1)
                        cy += 8

            y += card_h + 12

        y += 8

    # ═══ FOOTER ═══
    y += 4
    draw.line([(PAD, y), (W - PAD, y)], fill=BORDER, width=1)
    y += 12
    footer = f"출처: Finviz · Google News   |   자동 생성 {now.strftime('%H:%M')}"
    draw.text((PAD, y), footer, fill=SUB, font=fonts["caption"])
    y += 30

    # ── Crop and save ──
    img = img.crop((0, 0, W, y))
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, f"dashboard_{now.strftime('%Y%m%d_%H%M')}.png")
    img.save(filepath, "PNG", quality=95)
    print(f"  Dashboard image saved: {filepath}")
    return filepath


def _pick_top_news(all_news, count=3):
    all_items = []
    for ticker, items in all_news.items():
        for item in items:
            all_items.append((ticker, item))

    def sort_key(pair):
        _, item = pair
        if "Today" in item.published:
            return "9999"
        return item.published

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
