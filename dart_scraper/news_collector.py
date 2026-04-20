"""Phase 3: IR 자료·뉴스·리포트 수집 + LLM 요약

다음 소스를 수집합니다:
  1. DART 공시 목록 (IR 자료, 주요사항보고, 영업실적 등)
  2. 네이버 금융 종목 뉴스 (공개 RSS)
  3. 종목 토론/블로그 (선택)

LLM 요약: ANTHROPIC_API_KEY 환경변수가 있으면 Claude API로 자동 요약.
없으면 원문 헤드라인만 기록합니다.
"""

from __future__ import annotations

import os
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

import pandas as pd
import requests

from .dart_client import DartClient


NAVER_NEWS_RSS = "https://finance.naver.com/item/news_notice.naver"
UA = {"User-Agent": "Mozilla/5.0 (compatible; DartScraper/1.0)"}


def collect_dart_ir(
    client: DartClient,
    corp_code: str,
    days: int = 365,
) -> pd.DataFrame:
    """DART 공시 중 IR·실적·주요사항 관련 항목 수집"""
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    all_items: list[dict] = []
    for ty in ["A", "B", "I", "J"]:  # A=정기공시, B=주요사항, I=거래소공시, J=공정위공시
        try:
            items = client.get_disclosure_list(corp_code, start_date, end_date, pblntf_ty=ty)
            all_items.extend(items)
            time.sleep(0.3)
        except Exception:
            continue

    if not all_items:
        return pd.DataFrame(columns=["접수일", "보고서명", "제출인", "접수번호"])

    rows = []
    ir_keywords = ["IR", "영업잠정", "잠정실적", "실적", "사업보고서", "반기보고서",
                   "분기보고서", "주요사항", "투자자", "공정공시", "풍문"]

    for item in all_items:
        nm = item.get("report_nm", "")
        if not any(k in nm for k in ir_keywords):
            continue
        rows.append({
            "접수일": item.get("rcept_dt", ""),
            "보고서명": nm,
            "제출인": item.get("flr_nm", ""),
            "접수번호": item.get("rcept_no", ""),
            "링크": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={item.get('rcept_no', '')}",
        })
    return pd.DataFrame(rows)


def fetch_naver_news(stock_code: str, max_items: int = 30) -> pd.DataFrame:
    """네이버 금융 종목뉴스 목록 (HTML 파싱)"""
    if not stock_code:
        return pd.DataFrame(columns=["날짜", "제목", "출처", "링크"])

    url = f"https://finance.naver.com/item/news_news.naver?code={stock_code}&page=1"
    try:
        resp = requests.get(url, headers=UA, timeout=15)
        resp.encoding = "euc-kr"
        html = resp.text
    except requests.RequestException:
        return pd.DataFrame(columns=["날짜", "제목", "출처", "링크"])

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    rows = []
    for tr in soup.select("table.type5 tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue
        title_a = tds[0].find("a")
        if not title_a:
            continue
        rows.append({
            "날짜": tds[2].get_text(strip=True) if len(tds) > 2 else "",
            "제목": title_a.get_text(strip=True),
            "출처": tds[1].get_text(strip=True) if len(tds) > 1 else "",
            "링크": "https://finance.naver.com" + title_a.get("href", ""),
        })
        if len(rows) >= max_items:
            break
    return pd.DataFrame(rows)


def summarize_with_claude(text: str, max_tokens: int = 500) -> str:
    """Claude API로 요약. API 키 없으면 빈 문자열."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key or not text.strip():
        return ""

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": max_tokens,
                "messages": [{
                    "role": "user",
                    "content": (
                        "다음 투자 관련 텍스트를 3~5줄의 한국어로 핵심만 요약해줘. "
                        "숫자·날짜·실적은 반드시 포함:\n\n" + text[:8000]
                    ),
                }],
            },
            timeout=30,
        )
        if resp.status_code != 200:
            return ""
        data = resp.json()
        return data.get("content", [{}])[0].get("text", "").strip()
    except (requests.RequestException, ValueError, KeyError):
        return ""


def build_news_summary(
    dart_ir_df: pd.DataFrame,
    naver_news_df: pd.DataFrame,
    use_llm: bool = True,
) -> pd.DataFrame:
    """DART 공시 + 뉴스 통합 요약 테이블"""
    rows = []

    if dart_ir_df is not None and not dart_ir_df.empty:
        for _, r in dart_ir_df.iterrows():
            summary = ""
            if use_llm:
                summary = summarize_with_claude(
                    f"공시명: {r.get('보고서명', '')}\n제출인: {r.get('제출인', '')}"
                )
            rows.append({
                "종류": "DART공시",
                "날짜": r.get("접수일", ""),
                "제목": r.get("보고서명", ""),
                "요약": summary,
                "링크": r.get("링크", ""),
            })

    if naver_news_df is not None and not naver_news_df.empty:
        # 뉴스는 너무 많으면 제목만, 상위 10개는 LLM 요약
        for i, (_, r) in enumerate(naver_news_df.iterrows()):
            summary = ""
            if use_llm and i < 10:
                summary = summarize_with_claude(r.get("제목", ""))
            rows.append({
                "종류": "뉴스",
                "날짜": r.get("날짜", ""),
                "제목": r.get("제목", ""),
                "요약": summary,
                "링크": r.get("링크", ""),
            })

    return pd.DataFrame(rows) if rows else pd.DataFrame(
        columns=["종류", "날짜", "제목", "요약", "링크"]
    )
