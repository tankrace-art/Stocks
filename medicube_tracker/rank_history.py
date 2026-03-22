"""Rank History - Accumulate and persist rankings over time (JSON-backed)."""
import json
import os
from .config import OUTPUT_DIR

HISTORY_FILE = os.path.join(OUTPUT_DIR, "rank_history.json")


def load_history() -> dict:
    """Load existing rank history from disk."""
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_history(history: dict):
    """Persist rank history to disk."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def _record_products(brand_hist: dict, products: list, date_str: str):
    """Insert today's ranked products into brand_hist dict."""
    # Remove today's old entries first (idempotent re-run)
    for name in list(brand_hist.keys()):
        brand_hist[name].pop(date_str, None)

    for p in products:
        name = (p.get("name") or "").strip()[:80]
        if not name:
            continue
        if name not in brand_hist:
            brand_hist[name] = {}
        brand_hist[name][date_str] = p.get("rank")


def update_history(history: dict, date_str: str, all_data: dict):
    """Merge today's results from all_data into history in-place."""
    # ── Qoo10 ──────────────────────────────────────────────────────
    qoo10 = all_data.get("qoo10", {})
    if qoo10 and not qoo10.get("error"):
        h = history.setdefault("qoo10", {})
        _record_products(h.setdefault("medicube", {}), qoo10.get("medicube_products", []), date_str)
        _record_products(h.setdefault("anua", {}), qoo10.get("anua_products", []), date_str)

    # ── Olive Young ─────────────────────────────────────────────────
    oy = all_data.get("oliveyoung", {})
    if oy and not oy.get("error"):
        h = history.setdefault("oliveyoung", {})
        _record_products(h.setdefault("medicube", {}), oy.get("medicube_products", []), date_str)
        _record_products(h.setdefault("anua", {}), oy.get("anua_products", []), date_str)

    # ── Amazon ──────────────────────────────────────────────────────
    amazon = all_data.get("amazon", {})
    if amazon and not amazon.get("error"):
        raw = amazon.get("raw", {})
        for country, cdata in raw.items():
            key = f"amazon_{country}"
            h = history.setdefault(key, {})
            _record_products(h.setdefault("medicube", {}), cdata.get("medicube_products", []), date_str)
            _record_products(h.setdefault("anua", {}), cdata.get("anua_products", []), date_str)


def get_sorted_dates(brand_hist: dict) -> list[str]:
    """Return all dates across all products, sorted chronologically."""
    all_dates = set()
    for product_dates in brand_hist.values():
        all_dates.update(product_dates.keys())
    return sorted(all_dates)


def get_platform_history(history: dict, platform_key: str) -> dict:
    """Return history for a given platform key (qoo10, oliveyoung, amazon_미국, ...)."""
    return history.get(platform_key, {})
