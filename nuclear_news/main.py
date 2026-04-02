#!/usr/bin/env python3
"""
Nuclear News Dashboard - Main entry point.
Generates 2 mobile-friendly dashboard images and sends via Telegram.

Usage:
    python -m nuclear_news.main            # Run once (send to Telegram)
    python -m nuclear_news.main --preview  # Generate images only (no send)
    python -m nuclear_news.main --cron     # Built-in scheduler (daily 6 AM)
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
    """Fetch news, generate dashboard images, and send to Telegram."""
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting nuclear news dashboard...")

    print("  Fetching & scoring news from all sources...")
    all_news = fetch_all_news(max_per_source=5)

    total_articles = sum(len(items) for items in all_news.values())
    print(f"  Selected {total_articles} quality articles across {len(all_news)} companies")

    print("  Generating mobile dashboard (2 images)...")
    image_paths = format_dashboard(all_news)

    print("  Sending to Telegram...")
    now = datetime.now()
    day_ko = {"Monday": "월", "Tuesday": "화", "Wednesday": "수",
              "Thursday": "목", "Friday": "금", "Saturday": "토", "Sunday": "일"}
    dk = day_ko.get(now.strftime("%A"), "")

    success = True
    captions = [
        f"☢️ 미국 원자력 뉴스 (1/2) 차세대 원자로\n{now.strftime(f'%Y.%m.%d ({dk})')}",
        f"☢️ 미국 원자력 뉴스 (2/2) 우라늄·핵연료\n{now.strftime(f'%Y.%m.%d ({dk})')}",
    ]
    for i, path in enumerate(image_paths):
        caption = captions[i] if i < len(captions) else ""
        if not send_photo(path, caption=caption):
            print(f"  Failed to send image {i+1}")
            success = False

    if success:
        print("  Dashboard sent successfully! (2 images)")
    else:
        print(f"  Some images failed. Saved at: {image_paths}")

    return success


def run_scheduler(hour: int = 6, minute: int = 0):
    """Run the dashboard on a daily schedule."""
    time_str = f"{hour:02d}:{minute:02d}"
    print(f"Nuclear News Dashboard Scheduler started")
    print(f"  Scheduled daily at {time_str} (system timezone)")
    print(f"  Press Ctrl+C to stop\n")

    schedule.every().day.at(time_str).do(run_dashboard)

    print("Running initial dashboard...")
    run_dashboard()

    while True:
        schedule.run_pending()
        time.sleep(60)


def main():
    parser = argparse.ArgumentParser(description="US Nuclear Energy News Dashboard")
    parser.add_argument("--cron", action="store_true",
                        help="Run with built-in scheduler (daily)")
    parser.add_argument("--hour", type=int, default=6,
                        help="Hour to run daily (default: 6)")
    parser.add_argument("--minute", type=int, default=0,
                        help="Minute to run daily (default: 0)")
    parser.add_argument("--preview", action="store_true",
                        help="Generate images without sending to Telegram")
    args = parser.parse_args()

    if args.preview:
        print("Fetching news (preview mode)...")
        all_news = fetch_all_news(max_per_source=5)
        image_paths = format_dashboard(all_news)
        print(f"\nDashboard images saved:")
        for p in image_paths:
            print(f"  {p}")
        print("Open these files to preview.")
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
