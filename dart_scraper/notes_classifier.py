"""Phase 4: 공부 노트 자동 분류

사용자가 작성한 텍스트·마크다운 파일들을 읽어 종목별·주제별로 자동 분류합니다.

입력:
  notes_dir: 노트 파일들이 있는 디렉토리 (*.md, *.txt)
  companies: 분류 대상 종목 리스트 (예: ["에이피알", "삼성전자"])

출력:
  DataFrame: [파일명, 종목, 카테고리, 핵심키워드, 발췌, 원본경로]

분류 로직:
  1. 파일 내 회사명 매칭 → 종목 할당
  2. 주제 키워드 매칭 (재무·경쟁사·IR·산업·밸류에이션)
  3. Claude API 있으면 자동 카테고리 분류, 없으면 키워드 기반만
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import pandas as pd

from .news_collector import summarize_with_claude


CATEGORY_KEYWORDS = {
    "재무분석": ["매출", "영업이익", "순이익", "ROE", "ROA", "부채", "자본", "현금흐름", "FCF", "재무제표"],
    "경쟁사": ["경쟁사", "점유율", "시장점유", "경쟁구도", "동종업계", "peer"],
    "IR자료": ["IR", "컨콜", "실적발표", "investor relations", "주주", "애널리스트"],
    "산업분석": ["산업", "업황", "사이클", "수요", "공급", "트렌드", "시장규모"],
    "밸류에이션": ["PER", "PBR", "EV/EBITDA", "DCF", "목표주가", "적정주가", "밸류에이션", "배수"],
    "매매일지": ["매수", "매도", "손절", "익절", "포지션", "평단"],
    "공시·뉴스": ["공시", "뉴스", "이슈", "악재", "호재"],
    "용어·개념": ["정의", "의미", "개념", "원리", "방법론"],
}


def classify_notes(
    notes_dir: str,
    companies: list[str] | None = None,
    use_llm: bool = True,
) -> pd.DataFrame:
    """노트 파일들을 읽어 종목·카테고리별로 분류"""
    if not os.path.isdir(notes_dir):
        return pd.DataFrame(columns=["파일명", "종목", "카테고리", "키워드", "발췌", "원본경로"])

    notes_path = Path(notes_dir)
    files = []
    for ext in ("*.md", "*.txt", "*.markdown"):
        files.extend(notes_path.rglob(ext))

    if not files:
        return pd.DataFrame(columns=["파일명", "종목", "카테고리", "키워드", "발췌", "원본경로"])

    companies = companies or []
    rows = []

    for fp in files:
        try:
            text = fp.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if not text.strip():
            continue

        # 종목 매칭
        matched_companies = [c for c in companies if c in text]
        target = ", ".join(matched_companies) if matched_companies else "미분류"

        # 카테고리 매칭 (키워드 기반)
        category_hits: dict[str, int] = {}
        keyword_hits: list[str] = []
        for cat, keywords in CATEGORY_KEYWORDS.items():
            hits = sum(1 for kw in keywords if kw.lower() in text.lower())
            if hits > 0:
                category_hits[cat] = hits
                keyword_hits.extend(
                    [kw for kw in keywords if kw.lower() in text.lower()][:3]
                )

        if category_hits:
            top_category = max(category_hits.items(), key=lambda x: x[1])[0]
        else:
            top_category = "기타"

        # 발췌 (첫 300자)
        excerpt = text[:300].replace("\n", " ").strip()

        # LLM 보강 요약 (선택)
        if use_llm and len(text) > 500:
            llm_summary = summarize_with_claude(text[:4000])
            if llm_summary:
                excerpt = llm_summary

        rows.append({
            "파일명": fp.name,
            "종목": target,
            "카테고리": top_category,
            "키워드": ", ".join(sorted(set(keyword_hits))[:6]),
            "발췌": excerpt,
            "원본경로": str(fp),
        })

    df = pd.DataFrame(rows)
    # 종목 → 카테고리 순으로 정렬
    if not df.empty:
        df = df.sort_values(["종목", "카테고리", "파일명"]).reset_index(drop=True)
    return df
