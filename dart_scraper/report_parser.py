"""사업보고서 원문 파싱

사업보고서의 'II. 사업의 내용' 섹션에서
매출유형, 제품가격, 생산능력, 주요 사업내용 등을 추출합니다.
"""

import re

import requests
import pandas as pd
from bs4 import BeautifulSoup

from .dart_client import DartClient


# 사업보고서에서 추출할 주요 섹션 키워드
SECTION_KEYWORDS = [
    "매출실적",
    "매출유형",
    "매출에 관한 사항",
    "제품의 가격",
    "제품 가격",
    "판매가격",
    "생산능력",
    "생산실적",
    "생산설비",
    "설비의 현황",
    "가동률",
    "재고현황",
    "수주현황",
    "수주상황",
    "시장점유율",
    "연구개발",
    "주요 제품",
    "주요제품",
    "사업의 개요",
    "영업의 현황",
    "영업개황",
]


class ReportParser:
    """사업보고서 원문 파서"""

    def __init__(self, client: DartClient):
        self.client = client
        self._session = requests.Session()

    def _fetch_html(self, url: str) -> str:
        """URL에서 HTML 가져오기"""
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        resp = self._session.get(url, headers=headers, timeout=30)
        resp.encoding = resp.apparent_encoding
        return resp.text

    def get_business_section_docs(
        self, corp_code: str, year: int
    ) -> list[dict]:
        """사업보고서에서 '사업의 내용' 관련 하위 문서 목록 조회"""
        rcept_no = self.client.get_business_report_rcept_no(corp_code, year)
        if not rcept_no:
            print(f"  [!] {year}년 사업보고서를 찾을 수 없습니다.")
            return []

        docs = self.client.get_document_index(rcept_no)
        business_docs = []
        for doc in docs:
            title = doc.get("title", "")
            # '사업의 내용' 또는 관련 섹션 필터링
            if any(kw in title for kw in ["사업의 내용", "사업내용", "영업의 현황"]):
                business_docs.append(doc)

        # 관련 문서가 없으면 전체 문서에서 사업 관련 문서 추가
        if not business_docs:
            for doc in docs:
                title = doc.get("title", "")
                if any(kw in title for kw in ["매출", "제품", "생산", "영업"]):
                    business_docs.append(doc)

        return business_docs

    def parse_business_content(
        self, corp_code: str, year: int
    ) -> dict[str, list[pd.DataFrame]]:
        """사업보고서 '사업의 내용' 파싱

        Returns:
            {섹션키워드: [DataFrame 테이블들]}
        """
        docs = self.get_business_section_docs(corp_code, year)
        if not docs:
            return {}

        all_sections: dict[str, list[pd.DataFrame]] = {}

        for doc in docs:
            url = doc.get("url", "")
            if not url:
                continue

            try:
                html = self._fetch_html(url)
            except Exception as e:
                print(f"  [!] 문서 다운로드 실패: {doc['title']} - {e}")
                continue

            sections = self._extract_sections(html)
            for section_name, tables in sections.items():
                if section_name not in all_sections:
                    all_sections[section_name] = []
                all_sections[section_name].extend(tables)

        return all_sections

    def _extract_sections(self, html: str) -> dict[str, list[pd.DataFrame]]:
        """HTML에서 키워드별 섹션과 테이블 추출"""
        soup = BeautifulSoup(html, "lxml")
        sections: dict[str, list[pd.DataFrame]] = {}

        # 모든 테이블 추출 시도
        try:
            all_tables = pd.read_html(html, flavor="lxml")
        except ValueError:
            all_tables = []

        if not all_tables:
            return sections

        # HTML에서 텍스트 기반으로 테이블과 키워드를 매핑
        text = soup.get_text()
        table_elements = soup.find_all("table")

        for keyword in SECTION_KEYWORDS:
            if keyword not in text:
                continue

            matched_tables = self._find_tables_near_keyword(
                soup, table_elements, all_tables, keyword
            )
            if matched_tables:
                sections[keyword] = matched_tables

        # 키워드 매칭이 안 된 테이블은 '기타' 로
        return sections

    def _find_tables_near_keyword(
        self,
        soup: BeautifulSoup,
        table_elements: list,
        all_tables: list[pd.DataFrame],
        keyword: str,
    ) -> list[pd.DataFrame]:
        """특정 키워드 근처의 테이블 찾기"""
        matched = []

        for idx, table_el in enumerate(table_elements):
            if idx >= len(all_tables):
                break

            # 테이블 자체에 키워드가 포함되어 있는지 확인
            table_text = table_el.get_text()
            if keyword in table_text:
                df = all_tables[idx]
                if not df.empty and len(df) > 1:
                    matched.append(self._clean_table(df))
                continue

            # 테이블 바로 앞의 텍스트에 키워드가 있는지 확인
            prev_sibling = table_el.find_previous(
                ["p", "span", "div", "b", "strong", "h1", "h2", "h3", "h4"]
            )
            if prev_sibling and keyword in prev_sibling.get_text():
                df = all_tables[idx]
                if not df.empty and len(df) > 1:
                    matched.append(self._clean_table(df))

        return matched

    def _clean_table(self, df: pd.DataFrame) -> pd.DataFrame:
        """테이블 정리 (빈 행/열 제거, 헤더 정리)"""
        # 모두 NaN인 행/열 제거
        df = df.dropna(how="all").dropna(axis=1, how="all")

        # 첫 행이 헤더 같으면 헤더로 설정
        if len(df) > 1:
            first_row = df.iloc[0]
            if all(isinstance(v, str) for v in first_row.values if pd.notna(v)):
                df.columns = [str(v) if pd.notna(v) else f"col_{i}" for i, v in enumerate(first_row)]
                df = df.iloc[1:].reset_index(drop=True)

        return df

    def get_summary(self, corp_code: str, year: int) -> dict[str, str]:
        """주요 사업 정보 요약 텍스트 반환"""
        sections = self.parse_business_content(corp_code, year)
        summary = {}

        for section_name, tables in sections.items():
            if not tables:
                continue
            table_strs = []
            for df in tables:
                try:
                    table_strs.append(df.to_string(index=False))
                except Exception:
                    continue
            if table_strs:
                summary[section_name] = "\n\n".join(table_strs)

        return summary
