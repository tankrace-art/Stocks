"""사람인(saramin.co.kr) 월별 임직원 수 스크래퍼

공개 기업정보 페이지에서 직원수 추이 데이터를 추출합니다.
URL 예: https://www.saramin.co.kr/zf_user/company-info/view?csn=<인코딩된값>

csn 값은 사용자가 제공하거나 회사명으로 검색 후 자동 탐색합니다.
"""

from __future__ import annotations

import json
import re
import time

import requests
import pandas as pd
from bs4 import BeautifulSoup


SARAMIN_BASE = "https://www.saramin.co.kr"
SEARCH_URL = f"{SARAMIN_BASE}/zf_user/search/company"
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}


class SaraminClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)

    def _fetch(self, url: str, params: dict | None = None) -> str:
        for attempt in range(3):
            try:
                resp = self.session.get(url, params=params, timeout=20)
                resp.encoding = resp.apparent_encoding or "utf-8"
                return resp.text
            except requests.RequestException:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                return ""

    def search_company(self, name: str) -> str:
        """회사명으로 company-info 페이지 URL(csn 포함) 추출"""
        html = self._fetch(SEARCH_URL, params={"searchType": "company", "searchword": name})
        if not html:
            return ""
        soup = BeautifulSoup(html, "lxml")

        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "company-info/view" in href and "csn=" in href:
                if href.startswith("http"):
                    return href
                return SARAMIN_BASE + href
        return ""

    def fetch_employee_counts(self, company_url: str) -> pd.DataFrame:
        """기업 페이지에서 월별 임직원 수 추이 추출

        Returns:
            DataFrame: columns=[월, 임직원수]
                      예: [24.4월: 452, 24.5월: 457, ...]
        """
        html = self._fetch(company_url)
        if not html:
            return pd.DataFrame(columns=["월", "임직원수"])

        # 사람인 차트 데이터는 JS 변수에 JSON으로 포함되어 있음
        records: list[tuple[str, int]] = []

        # 패턴 1: JSON-ish 차트 데이터
        for pat in [
            r"employeeNumberData\s*=\s*(\[[^\]]+\])",
            r"employee_number_list\s*=\s*(\[[^\]]+\])",
            r"chartData\s*:\s*(\[[^\]]+\])",
        ]:
            m = re.search(pat, html)
            if not m:
                continue
            try:
                data = json.loads(m.group(1))
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    label = item.get("label") or item.get("name") or item.get("month") or ""
                    value = item.get("value") or item.get("count") or item.get("y")
                    if label and value is not None:
                        try:
                            records.append((str(label), int(value)))
                        except (ValueError, TypeError):
                            pass
                if records:
                    return pd.DataFrame(records, columns=["월", "임직원수"])
            except (json.JSONDecodeError, ValueError):
                continue

        # 패턴 2: 테이블 직접 파싱
        soup = BeautifulSoup(html, "lxml")
        for table in soup.find_all("table"):
            text = table.get_text()
            if "임직원" in text or "직원" in text:
                try:
                    dfs = pd.read_html(str(table))
                    for df in dfs:
                        if df.shape[1] >= 2 and len(df) >= 2:
                            # 헤더와 값 추출 시도
                            for _, row in df.iterrows():
                                for i in range(len(row) - 1):
                                    lbl = str(row.iloc[i])
                                    val = str(row.iloc[i + 1])
                                    if re.match(r"\d+[.년]\d+월?", lbl):
                                        try:
                                            records.append((lbl, int(val.replace(",", ""))))
                                        except ValueError:
                                            pass
                except ValueError:
                    continue

        return pd.DataFrame(records, columns=["월", "임직원수"])


def fetch_saramin_employees(company_name: str, direct_url: str = "") -> pd.DataFrame:
    """간편 함수: 회사명 또는 URL로 월별 직원수 가져오기"""
    client = SaraminClient()
    url = direct_url or client.search_company(company_name)
    if not url:
        return pd.DataFrame(columns=["월", "임직원수"])
    return client.fetch_employee_counts(url)
