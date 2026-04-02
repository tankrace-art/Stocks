"""
Telegram Bot module for sending nuclear news dashboard messages.
"""

import requests
import os
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"


def send_message(text: str, parse_mode: str = "HTML") -> bool:
    """Send a message via Telegram Bot API. Splits long messages if needed."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("[ERROR] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in .env")
        return False

    # Telegram message limit is 4096 characters
    max_len = 4000
    chunks = _split_message(text, max_len) if len(text) > max_len else [text]

    success = True
    for chunk in chunks:
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": chunk,
            "parse_mode": parse_mode,
            "disable_web_page_preview": True,
        }
        try:
            resp = requests.post(
                f"{TELEGRAM_API_URL}/sendMessage",
                json=payload,
                timeout=30,
            )
            if resp.status_code != 200:
                print(f"[ERROR] Telegram API error: {resp.status_code} - {resp.text}")
                success = False
            else:
                print(f"[OK] Message sent ({len(chunk)} chars)")
        except Exception as e:
            print(f"[ERROR] Failed to send Telegram message: {e}")
            success = False

    return success


def _split_message(text: str, max_len: int) -> list[str]:
    """Split a long message into chunks at line boundaries."""
    chunks = []
    current = ""
    for line in text.split("\n"):
        if len(current) + len(line) + 1 > max_len:
            chunks.append(current)
            current = line
        else:
            current = f"{current}\n{line}" if current else line
    if current:
        chunks.append(current)
    return chunks
