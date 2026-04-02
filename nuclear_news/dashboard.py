"""
Nuclear News Mobile Dashboard - 2 portrait images for phone viewing.
Image 1: Header + Briefing + Sector 1 (SMR/차세대 원자로)
Image 2: Sector 2 (우라늄/핵연료) + Footer
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
WHITE = (255, 255, 255)
BORDER = (209, 213, 219)
TITLE = (15, 23, 42)
BODY = (51, 65, 85)
SUB = (100, 116, 139)
LINE = (226, 232, 240)
BRIEFING_BG = (255, 251, 235)
BRIEFING_BORDER = (245, 158, 11)
RED = (220, 38, 38)
BLUE = (37, 99, 235)
GREEN = (22, 163, 74)
ORANGE = (234, 88, 12)
TAG_RED_BG = (254, 226, 226)
TAG_BLUE_BG = (219, 234, 254)
TAG_GREEN_BG = (220, 252, 231)
TAG_GRAY_BG = (241, 245, 249)
VERIFIED_BG = (220, 252, 231)
VERIFIED_TEXT = (22, 101, 52)
SCORE_HIGH = (22, 163, 74)
SCORE_MED = (245, 158, 11)
SCORE_LOW = (156, 163, 175)

# ── Mobile Layout (phone-friendly) ──
W = 1080           # standard phone width
MAX_H = 2400       # max height per image
PAD = 36
CARD_PAD = 24
RADIUS = 14

# ── Korean ──
DAY_KO = {"Monday": "월", "Tuesday": "화", "Wednesday": "수",
           "Thursday": "목", "Friday": "금", "Saturday": "토", "Sunday": "일"}
COMPANY_KO = {
    "OKLO": "오클로", "SMR": "뉴스케일파워", "LEU": "센트러스에너지",
    "CCJ": "카메코", "UEC": "우라늄에너지", "NNE": "나노뉴클리어",
}
SECTORS = [
    {"name": "차세대 원자로 (SMR)", "accent": RED, "tag_bg": TAG_RED_BG,
     "tickers": ["OKLO", "SMR", "NNE"]},
    {"name": "우라늄 · 핵연료", "accent": BLUE, "tag_bg": TAG_BLUE_BG,
     "tickers": ["LEU", "CCJ", "UEC"]},
]


def _load_fonts():
    paths = [
        "C:/Windows/Fonts/malgun.ttf",
        "C:/Windows/Fonts/NanumGothic.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    ]
    bold_paths = [
        "C:/Windows/Fonts/malgunbd.ttf",
        "C:/Windows/Fonts/NanumGothicBold.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    ]

    font_path = None
    for p in paths:
        if os.path.exists(p):
            font_path = p
            break

    bold_path = font_path
    for p in bold_paths:
        if os.path.exists(p):
            bold_path = p
            break

    if font_path:
        return {
            "header": ImageFont.truetype(bold_path, 36),
            "section": ImageFont.truetype(bold_path, 26),
            "company": ImageFont.truetype(bold_path, 24),
            "ticker": ImageFont.truetype(bold_path, 22),
            "news_title": ImageFont.truetype(bold_path, 20),
            "news_body": ImageFont.truetype(font_path, 18),
            "tag": ImageFont.truetype(bold_path, 15),
            "caption": ImageFont.truetype(font_path, 16),
            "date": ImageFont.truetype(font_path, 15),
            "score": ImageFont.truetype(bold_path, 14),
        }
    return {k: ImageFont.load_default() for k in
            ["header", "section", "company", "ticker", "news_title",
             "news_body", "tag", "caption", "date", "score"]}


def _wrap(text, font, max_w, draw):
    if not text:
        return [""]
    char_w = draw.textlength("가나", font=font) / 2
    if char_w == 0:
        char_w = 18
    cpl = max(1, int(max_w / char_w))
    lines = textwrap.wrap(text, width=cpl)
    return lines if lines else [text]


def _draw_tag(draw, x, y, text, bg_color, text_color, font):
    """Draw a small rounded tag."""
    tw = draw.textlength(text, font=font)
    draw.rounded_rectangle(
        [(x, y), (x + tw + 14, y + 24)],
        radius=4, fill=bg_color)
    draw.text((x + 7, y + 3), text, fill=text_color, font=font)
    return tw + 18  # return width used


def _draw_score_bar(draw, x, y, score, font):
    """Draw a small score indicator."""
    if score >= 60:
        color, label = SCORE_HIGH, "신뢰도 높음"
    elif score >= 40:
        color, label = SCORE_MED, "신뢰도 보통"
    else:
        color, label = SCORE_LOW, "신뢰도 낮음"

    # Bar background
    bar_w = 80
    bar_h = 6
    draw.rounded_rectangle([(x, y + 4), (x + bar_w, y + 4 + bar_h)],
                           radius=3, fill=(229, 231, 235))
    # Bar fill
    fill_w = int(bar_w * score / 100)
    if fill_w > 0:
        draw.rounded_rectangle([(x, y + 4), (x + fill_w, y + 4 + bar_h)],
                               radius=3, fill=color)
    # Label
    draw.text((x + bar_w + 8, y), label, fill=color, font=font)


def _draw_sector_cards(draw, y, sector, all_news, translated, fonts):
    """Draw all company cards for a sector. Returns new y position."""
    content_w = W - 2 * PAD

    # Section header
    draw.rounded_rectangle(
        [(PAD, y), (W - PAD, y + 48)],
        radius=10, fill=sector["accent"])
    draw.text((PAD + 20, y + 10), sector["name"],
              fill=WHITE, font=fonts["section"])
    y += 62

    # Check if any company in this sector has news
    has_any_news = any(all_news.get(t, []) for t in sector["tickers"])
    if not has_any_news:
        draw.text((PAD + 20, y), "이 섹터에 주요 뉴스 없음",
                  fill=SUB, font=fonts["news_body"])
        y += 40
        return y

    for ticker in sector["tickers"]:
        items = all_news.get(ticker, [])

        # Skip companies with no material news
        if not items:
            continue

        trans = translated.get(ticker, [])
        company_ko = COMPANY_KO.get(ticker, "")
        company_en = NUCLEAR_COMPANIES[ticker]["name"]

        # Pre-calculate card content
        news_blocks = []
        card_content_h = 0
        for idx, item in enumerate(items):
            ko_title = trans[idx][0] if idx < len(trans) else item.title
            ko_summary = trans[idx][1] if idx < len(trans) else ""

            title_lines = _wrap(ko_title, fonts["news_title"], content_w - 70, draw)
            summary_lines = []
            if ko_summary and ko_summary != ko_title:
                summary_text = _truncate(ko_summary, 150)
                summary_lines = _wrap(summary_text, fonts["news_body"], content_w - 70, draw)
                summary_lines = summary_lines[:3]

            block_h = 28  # date/source line
            block_h += len(title_lines) * 28
            block_h += len(summary_lines) * 24
            block_h += 20  # tags + score line
            block_h += 16  # spacing
            card_content_h += block_h
            news_blocks.append((item, title_lines, summary_lines, block_h))

        card_h = 66 + card_content_h + 12

        # Card background
        draw.rounded_rectangle(
            [(PAD, y), (W - PAD, y + card_h)],
            radius=RADIUS, fill=WHITE, outline=BORDER, width=1)
        # Top accent stripe
        draw.rounded_rectangle(
            [(PAD, y), (W - PAD, y + 6)],
            radius=3, fill=sector["accent"])

        # Company header
        cy = y + 16
        # Ticker tag
        tag_text = f"${ticker}"
        tw = draw.textlength(tag_text, font=fonts["ticker"])
        draw.rounded_rectangle(
            [(PAD + CARD_PAD, cy - 3), (PAD + CARD_PAD + tw + 16, cy + 27)],
            radius=6, fill=sector["tag_bg"])
        draw.text((PAD + CARD_PAD + 8, cy), tag_text,
                  fill=sector["accent"], font=fonts["ticker"])

        name_x = PAD + CARD_PAD + tw + 28
        draw.text((name_x, cy - 2), company_ko, fill=TITLE, font=fonts["company"])
        en_x = name_x + draw.textlength(company_ko + "  ", font=fonts["company"])
        draw.text((en_x, cy + 4), company_en, fill=SUB, font=fonts["caption"])
        cy += 40

        # Divider
        draw.line([(PAD + CARD_PAD, cy), (W - PAD - CARD_PAD, cy)], fill=LINE, width=1)
        cy += 14

        # News items
        if news_blocks:
            for bi, (item, title_lines, summary_lines, bh) in enumerate(news_blocks):
                date = _short_date(item.published)
                source = item.source or ""

                # Source + Date
                source_tag = f"{source} · {date}" if source else date
                draw.text((PAD + CARD_PAD, cy), source_tag,
                          fill=SUB, font=fonts["date"])

                # Verified badge
                if item.verified:
                    vx = PAD + CARD_PAD + draw.textlength(source_tag + "  ", font=fonts["date"])
                    _draw_tag(draw, vx, cy - 2, "✓ 교차검증", VERIFIED_BG, VERIFIED_TEXT, fonts["tag"])
                cy += 28

                # Title lines
                for line in title_lines:
                    draw.text((PAD + CARD_PAD, cy), line,
                              fill=TITLE, font=fonts["news_title"])
                    cy += 28

                # Summary lines
                for line in summary_lines:
                    draw.text((PAD + CARD_PAD, cy), line,
                              fill=BODY, font=fonts["news_body"])
                    cy += 24

                # Tags + Score
                cy += 4
                tx = PAD + CARD_PAD
                for tag_text in item.tags[:2]:
                    tw_used = _draw_tag(draw, tx, cy, tag_text, TAG_GRAY_BG, SUB, fonts["tag"])
                    tx += tw_used + 6

                # Score bar
                _draw_score_bar(draw, W - PAD - CARD_PAD - 200, cy, item.score, fonts["score"])
                cy += 30

                # Divider between news
                if bi < len(news_blocks) - 1:
                    draw.line([(PAD + CARD_PAD, cy - 4), (W - PAD - CARD_PAD, cy - 4)],
                              fill=LINE, width=1)
                    cy += 6

        y += card_h + 16

    return y


def format_dashboard(all_news: dict[str, list[NewsItem]]) -> list[str]:
    """Generate 2 mobile dashboard images. Returns list of file paths."""
    fonts = _load_fonts()
    now = datetime.now()
    day_ko = DAY_KO.get(now.strftime("%A"), "")
    date_str = now.strftime(f"%Y.%m.%d ({day_ko})")

    # Translate all news upfront
    translated = {}
    for ticker, items in all_news.items():
        translated[ticker] = []
        for item in items:
            ko_title = translate_to_korean(item.title)
            ko_summary = ""
            if item.snippet:
                ko_summary = translate_to_korean(item.snippet)
            translated[ticker].append((ko_title, ko_summary))

    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
    os.makedirs(output_dir, exist_ok=True)
    paths = []

    # ═══════════════════════════════════════
    # IMAGE 1: Header + Briefing + Sector 1
    # ═══════════════════════════════════════
    img1 = Image.new("RGB", (W, MAX_H), BG)
    d1 = ImageDraw.Draw(img1)
    y = 0

    # Header
    header_h = 80
    d1.rectangle([(0, 0), (W, header_h)], fill=HEADER_BG)
    d1.text((PAD, 20), "☢  미국 원자력 뉴스", fill=WHITE, font=fonts["header"])
    dw = d1.textlength(date_str, font=fonts["ticker"])
    d1.text((W - PAD - dw, 28), date_str, fill=(148, 163, 184), font=fonts["ticker"])
    y = header_h + 20

    # Briefing box
    top_items = _pick_top_news(all_news, count=3)
    if top_items:
        brief_lines = []
        for ticker, item in top_items:
            ko_title = translate_to_korean(item.title)
            company_ko = COMPANY_KO.get(ticker, ticker)
            text = f"[{company_ko}] {ko_title}"
            wrapped = _wrap(text, fonts["news_body"], W - 2 * PAD - 70, d1)
            brief_lines.append((wrapped, item.verified, item.score))

        total_text_h = sum(len(wl[0]) * 26 + 10 for wl in brief_lines)
        brief_h = 52 + total_text_h + 10

        d1.rounded_rectangle(
            [(PAD, y), (W - PAD, y + brief_h)],
            radius=12, fill=BRIEFING_BG, outline=BRIEFING_BORDER, width=2)
        d1.rectangle([(PAD + 1, y + 8), (PAD + 7, y + brief_h - 8)],
                     fill=BRIEFING_BORDER)

        by = y + 16
        d1.text((PAD + 22, by), "⚡ 오늘의 핵심 브리핑", fill=ORANGE, font=fonts["section"])
        by += 40

        for wrapped, verified, score in brief_lines:
            d1.text((PAD + 26, by), "▸", fill=ORANGE, font=fonts["news_body"])
            for i, line in enumerate(wrapped):
                d1.text((PAD + 48, by), line, fill=BODY, font=fonts["news_body"])
                by += 26
            by += 10

        y += brief_h + 24

    # Page label
    d1.text((W - PAD - 60, y), "1 / 2", fill=SUB, font=fonts["caption"])
    y += 10

    # Sector 1
    y = _draw_sector_cards(d1, y, SECTORS[0], all_news, translated, fonts)
    y += 20

    # Footer for page 1
    d1.line([(PAD, y), (W - PAD, y)], fill=BORDER, width=1)
    y += 12
    d1.text((PAD, y), "▶ 다음 장: 우라늄 · 핵연료 섹터", fill=SUB, font=fonts["caption"])
    y += 30

    img1 = img1.crop((0, 0, W, y))
    path1 = os.path.join(output_dir, f"dashboard_{now.strftime('%Y%m%d_%H%M')}_1.png")
    img1.save(path1, "PNG", quality=95)
    paths.append(path1)
    print(f"  Image 1 saved: {path1}")

    # ═══════════════════════════════════════
    # IMAGE 2: Sector 2 + Footer
    # ═══════════════════════════════════════
    img2 = Image.new("RGB", (W, MAX_H), BG)
    d2 = ImageDraw.Draw(img2)
    y = 0

    # Mini header
    mini_h = 50
    d2.rectangle([(0, 0), (W, mini_h)], fill=HEADER_BG)
    d2.text((PAD, 12), "☢  미국 원자력 뉴스", fill=WHITE, font=fonts["company"])
    d2.text((W - PAD - 60, 16), "2 / 2", fill=(148, 163, 184), font=fonts["caption"])
    y = mini_h + 20

    # Sector 2
    y = _draw_sector_cards(d2, y, SECTORS[1], all_news, translated, fonts)
    y += 12

    # Legend
    d2.rounded_rectangle([(PAD, y), (W - PAD, y + 100)],
                         radius=10, fill=WHITE, outline=BORDER, width=1)
    ly = y + 12
    d2.text((PAD + CARD_PAD, ly), "📋 필터링 기준", fill=TITLE, font=fonts["caption"])
    ly += 26
    for label in [
        "✓ 계약, 인허가, 실적, 기술진전, 규제변화 등 기업 핵심 이벤트만 수집",
        "✗ 증권사 목표가, 투자추천, 주식리스트, 낚시성 기사 자동 제거",
        "✓ 교차검증: 2개 이상 매체에서 동일 뉴스 확인 시 표시",
        "   주요 뉴스 없는 기업은 표시하지 않음",
    ]:
        d2.text((PAD + CARD_PAD, ly), label, fill=SUB, font=fonts["date"])
        ly += 20
    y += 110

    # Footer
    y += 10
    d2.line([(PAD, y), (W - PAD, y)], fill=BORDER, width=1)
    y += 14
    footer_lines = [
        f"출처: Finviz · Google News RSS (보도자료 우선)",
        f"1티어: Reuters, Bloomberg, CNBC, PR Newswire, Business Wire 등",
        f"✓ 교차검증 = 2개 이상 매체에서 동일 뉴스 확인",
        f"자동 생성 {now.strftime('%Y.%m.%d %H:%M')}",
    ]
    for fl in footer_lines:
        d2.text((PAD, y), fl, fill=SUB, font=fonts["date"])
        y += 22
    y += 20

    img2 = img2.crop((0, 0, W, y))
    path2 = os.path.join(output_dir, f"dashboard_{now.strftime('%Y%m%d_%H%M')}_2.png")
    img2.save(path2, "PNG", quality=95)
    paths.append(path2)
    print(f"  Image 2 saved: {path2}")

    return paths


def _pick_top_news(all_news, count=3):
    all_items = []
    for ticker, items in all_news.items():
        for item in items:
            all_items.append((ticker, item))
    # Sort by score (highest first)
    all_items.sort(key=lambda p: p[1].score, reverse=True)
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
