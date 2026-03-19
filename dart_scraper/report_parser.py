"""사업보고서 원문 파싱

사업보고서에서 투자 의사결정에 필요한 핵심 섹션을 정확하게 추출합니다:
1. 사업의 개요 - 회사가 뭐하는 곳인지
2. 매출 구성 - 매출유형별 실적, 제품/서비스별 매출 비중
3. 생산 및 설비 - 생산능력, 가동률, CAPA 투자
4. 수주 현황 - 수주잔고 (조선, 건설, 방산 등)
5. 연구개발 - R&D 투자 규모, 진행 현황
"""

import re
import time

import requests
import pandas as pd
from bs4 import BeautifulSoup, Tag

from .dart_client import DartClient


# 투자 의사결정에 중요한 섹션 (우선순위 순)
INVESTMENT_SECTIONS = {
    "매출_실적": {
        "keywords": ["매출실적", "매출에 관한 사항", "매출유형", "매출 및 수주"],
        "description": "매출 구성 및 실적",
    },
    "주요_제품": {
        "keywords": ["주요 제품", "주요제품", "제품의 가격", "제품 가격", "판매가격"],
        "description": "주요 제품/서비스 및 가격",
    },
    "생산_설비": {
        "keywords": ["생산능력", "생산실적", "가동률", "생산설비", "설비의 현황", "설비 현황"],
        "description": "생산능력 및 설비 현황",
    },
    "수주_현황": {
        "keywords": ["수주현황", "수주상황", "수주잔고", "수주 현황"],
        "description": "수주 현황",
    },
    "연구개발": {
        "keywords": ["연구개발", "연구개발활동", "연구 개발"],
        "description": "연구개발 투자",
    },
    "시장_점유율": {
        "keywords": ["시장점유율", "시장 점유율", "시장현황", "시장 현황"],
        "description": "시장점유율",
    },
    "재고_현황": {
        "keywords": ["재고현황", "재고 현황", "재고자산"],
        "description": "재고 현황",
    },
}


class ReportParser:
    """사업보고서 원문 파서 - 투자분석용"""

    def __init__(self, client: DartClient):
        self.client = client
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })

    def _fetch_html(self, url: str) -> str:
        """URL에서 HTML 가져오기"""
        for attempt in range(3):
            try:
                resp = self._session.get(url, timeout=30)
                resp.encoding = resp.apparent_encoding
                return resp.text
            except requests.RequestException:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                return ""

    def get_business_docs(self, corp_code: str, year: int) -> list[dict]:
        """사업보고서에서 '사업의 내용' 관련 하위 문서 목록 조회"""
        rcept_no = self.client.get_business_report_rcept_no(corp_code, year)
        if not rcept_no:
            return []

        docs = self.client.get_document_index(rcept_no)
        business_docs = []
        for doc in docs:
            title = doc.get("title", "")
            if any(kw in title for kw in ["사업의 내용", "사업내용", "영업의 현황"]):
                business_docs.append(doc)

        if not business_docs:
            for doc in docs:
                title = doc.get("title", "")
                if any(kw in title for kw in ["매출", "제품", "생산", "영업"]):
                    business_docs.append(doc)

        return business_docs

    def parse_business_report(
        self, corp_code: str, year: int, log_fn=None
    ) -> dict[str, list[pd.DataFrame]]:
        """사업보고서에서 투자 핵심 데이터 추출

        Returns:
            {"매출_실적": [DataFrame, ...], "생산_설비": [DataFrame, ...], ...}
        """
        docs = self.get_business_docs(corp_code, year)
        if not docs:
            if log_fn:
                log_fn(f"  - {year}년 사업보고서를 찾을 수 없습니다.")
            return {}

        # 모든 관련 문서의 HTML을 합침
        all_html_parts = []
        for doc in docs:
            url = doc.get("url", "")
            if not url:
                continue
            html = self._fetch_html(url)
            if html:
                all_html_parts.append(html)
            time.sleep(0.3)

        if not all_html_parts:
            return {}

        # 각 HTML에서 섹션별 테이블 추출
        result: dict[str, list[pd.DataFrame]] = {}

        for html in all_html_parts:
            sections = self._extract_investment_tables(html)
            for section_key, tables in sections.items():
                if section_key not in result:
                    result[section_key] = []
                result[section_key].extend(tables)

        # 빈 섹션 제거, 중복 테이블 제거
        cleaned = {}
        for key, tables in result.items():
            unique_tables = self._deduplicate_tables(tables)
            if unique_tables:
                cleaned[key] = unique_tables

        return cleaned

    def _extract_investment_tables(self, html: str) -> dict[str, list[pd.DataFrame]]:
        """HTML에서 투자분석용 섹션별 테이블 추출"""
        soup = BeautifulSoup(html, "lxml")
        text_content = soup.get_text()

        # pd.read_html로 전체 테이블 파싱
        try:
            all_tables = pd.read_html(html, flavor="lxml")
        except ValueError:
            return {}

        if not all_tables:
            return {}

        table_elements = soup.find_all("table")
        sections: dict[str, list[pd.DataFrame]] = {}

        for section_key, section_info in INVESTMENT_SECTIONS.items():
            # 이 섹션의 키워드가 문서에 있는지 확인
            found_keywords = [kw for kw in section_info["keywords"] if kw in text_content]
            if not found_keywords:
                continue

            matched_tables = []
            matched_indices = set()

            for kw in found_keywords:
                tables = self._find_keyword_tables(
                    soup, table_elements, all_tables, kw, matched_indices
                )
                matched_tables.extend(tables)

            if matched_tables:
                sections[section_key] = matched_tables

        return sections

    def _find_keyword_tables(
        self,
        soup: BeautifulSoup,
        table_elements: list,
        all_tables: list[pd.DataFrame],
        keyword: str,
        already_matched: set,
    ) -> list[pd.DataFrame]:
        """특정 키워드와 관련된 테이블을 정확하게 찾기"""
        matched = []

        for idx, table_el in enumerate(table_elements):
            if idx >= len(all_tables) or idx in already_matched:
                continue

            df = all_tables[idx]
            if df.empty or len(df) < 2:
                continue

            # 1) 테이블 자체에 키워드가 포함된 경우
            table_text = table_el.get_text(separator=" ")
            if keyword in table_text:
                cleaned = self._clean_table(df)
                if cleaned is not None:
                    matched.append(cleaned)
                    already_matched.add(idx)
                continue

            # 2) 테이블 바로 위의 제목/텍스트에 키워드가 있는 경우
            prev = table_el.find_previous(
                ["p", "span", "div", "b", "strong", "h1", "h2", "h3", "h4", "td"]
            )
            if prev and keyword in prev.get_text():
                # 바로 앞 요소의 텍스트에 키워드가 있으면 관련 테이블
                cleaned = self._clean_table(df)
                if cleaned is not None:
                    matched.append(cleaned)
                    already_matched.add(idx)
                continue

            # 3) 테이블과 키워드 텍스트 사이의 거리가 가까운 경우
            # (2단계까지 올라가서 확인)
            prev2 = prev.find_previous(
                ["p", "span", "div", "b", "strong"]
            ) if prev else None
            if prev2 and keyword in prev2.get_text():
                cleaned = self._clean_table(df)
                if cleaned is not None:
                    matched.append(cleaned)
                    already_matched.add(idx)

        return matched

    def _clean_table(self, df: pd.DataFrame) -> pd.DataFrame | None:
        """테이블 정리 - 투자분석에 쓸모없는 테이블은 걸러냄"""
        # 모두 NaN인 행/열 제거
        df = df.dropna(how="all").dropna(axis=1, how="all")

        # 너무 작거나 큰 테이블 제외
        if len(df) < 2 or len(df.columns) < 2:
            return None
        if len(df) > 200:  # 비정상적으로 큰 테이블
            return None

        # 첫 행이 헤더인 경우 처리
        if len(df) > 1:
            first_row = df.iloc[0]
            if all(isinstance(v, str) for v in first_row.values if pd.notna(v)):
                # 첫 행의 값들이 전부 문자열이면 헤더로 사용
                new_cols = []
                for i, v in enumerate(first_row):
                    if pd.notna(v):
                        col_name = str(v).strip()
                        # 중복 컬럼명 처리
                        if col_name in new_cols:
                            col_name = f"{col_name}_{i}"
                        new_cols.append(col_name)
                    else:
                        new_cols.append(f"col_{i}")
                df.columns = new_cols
                df = df.iloc[1:].reset_index(drop=True)

        # 의미없는 테이블 필터 (숫자가 하나도 없는 경우)
        has_number = False
        for col in df.columns:
            for val in df[col]:
                if isinstance(val, (int, float)):
                    has_number = True
                    break
                if isinstance(val, str) and re.search(r'\d', val):
                    has_number = True
                    break
            if has_number:
                break

        if not has_number:
            return None

        return df

    def _deduplicate_tables(self, tables: list[pd.DataFrame]) -> list[pd.DataFrame]:
        """중복 테이블 제거"""
        if len(tables) <= 1:
            return tables

        unique = []
        seen_shapes = set()

        for df in tables:
            # 형태 + 첫 번째 셀 값으로 중복 판단
            key = (df.shape, str(df.iloc[0, 0]) if not df.empty else "")
            if key not in seen_shapes:
                seen_shapes.add(key)
                unique.append(df)

        return unique

    def get_yearly_business_data(
        self,
        corp_code: str,
        start_year: int,
        end_year: int,
        log_fn=None,
    ) -> dict[str, dict[str, list[pd.DataFrame]]]:
        """여러 연도의 사업보고서 데이터를 연도별로 정리

        Returns:
            {2020: {"매출_실적": [df, ...], ...}, 2021: {...}, ...}
        """
        yearly_data = {}

        for year in range(start_year, end_year + 1):
            if log_fn:
                log_fn(f"  {year}년 사업보고서 분석 중...")
            data = self.parse_business_report(corp_code, year, log_fn)
            if data:
                yearly_data[year] = data
                if log_fn:
                    sections = ", ".join(
                        INVESTMENT_SECTIONS[k]["description"]
                        for k in data.keys()
                        if k in INVESTMENT_SECTIONS
                    )
                    log_fn(f"  ✓ {year}년: {sections}")
            else:
                if log_fn:
                    log_fn(f"  - {year}년 사업보고서 없음")
            time.sleep(0.5)

        return yearly_data
