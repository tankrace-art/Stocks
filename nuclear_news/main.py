#!/usr/bin/env python3
"""
Nuclear News Dashboard - Main entry point.
Generates a visual dashboard image and sends via Telegram.

Usage:
    python -m nuclear_news.main          # Run once (send to Telegram)
    python -m nuclear_news.main --preview  # Generate image only (no send)
    python -m nuclear_news.main --cron   # Run with built-in scheduler (daily 6 AM)
"""

import argparse
import sys
import time
import schedule
from datetime import datetime

from nuclear_news.scraper import fetch_all_news
from nuclear_news.dashboard import format_dashboard
from nuclear_news.telegram_bot import send_photo


def run_dashboard():
    """Fetch news, generate dashboard image, and send to Telegram."""
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting nuclear news dashboard...")

    print("  Fetching news from all sources...")
    all_news = fetch_all_news(max_per_source=3)

    total_articles = sum(len(items) for items in all_news.values())
    print(f"  Found {total_articles} articles across {len(all_news)} companies")

    print("  Generating dashboard image...")
    image_path = format_dashboard(all_news)

    print("  Sending to Telegram...")
    now = datetime.now()
    day_ko = {"Monday": "월", "Tuesday": "화", "Wednesday": "수",
              "Thursday": "목", "Friday": "금", "Saturday": "토", "Sunday": "일"}
    dk = day_ko.get(now.strftime("%A"), "")
    caption = f"☢️ 미국 원자력 뉴스 대시보드 · {now.strftime(f'%Y.%m.%d ({dk})')}"

    success = send_photo(image_path, caption=caption)

    if success:
        print("  Dashboard sent successfully!")
    else:
        print(f"  Failed to send. Image saved at: {image_path}")

    return success


def run_scheduler(hour: int = 6, minute: int = 0):
    """Run the dashboard on a daily schedule."""
    time_str = f"{hour:02d}:{minute:02d}"
    print(f"Nuclear News Dashboard Scheduler started")
    print(f"  Scheduled daily at {time_str} (system timezone)")
    print(f"  Press Ctrl+C to stop\n")

    schedule.every().day.at(time_str).do(run_dashboard)

    # Also run once immediately on start
    print("Running initial dashboard...")
    run_dashboard()

    while True:
        schedule.run_pending()
        time.sleep(60)


def main():
    parser = argparse.ArgumentParser(description="US Nuclear Energy News Dashboard")
    parser.add_argument(
        "--cron", action="store_true",
        help="Run with built-in scheduler (daily at configured time)",
    )
    parser.add_argument(
        "--hour", type=int, default=6,
        help="Hour to run daily (24h format, default: 6)",
    )
    parser.add_argument(
        "--minute", type=int, default=0,
        help="Minute to run daily (default: 0)",
    )
    parser.add_argument(
        "--preview", action="store_true",
        help="Generate dashboard image without sending to Telegram",
    )
    args = parser.parse_args()

    if args.preview:
        print("Fetching news (preview mode)...")
        all_news = fetch_all_news(max_per_source=3)
        image_path = format_dashboard(all_news)
        print(f"\nDashboard image saved: {image_path}")
        print("Open this file to preview the dashboard.")
        return

    if args.cron:
        try:
            run_scheduler(hour=args.hour, minute=args.minute)
        except KeyboardInterrupt:
            print("\nScheduler stopped.")
    else:
        success = run_dashboard()
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
