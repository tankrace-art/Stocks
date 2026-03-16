"""DART OpenAPI 클라이언트

기업 검색, 재무제표 조회, 공시서류 원문 조회 기능을 제공합니다.
"""

import io
import json
import time
import zipfile
import xml.etree.ElementTree as ET

import requests
import pandas as pd

from .config import BASE_URL, DART_API_KEY, REPORT_CODES, STATEMENT_TYPES


class DartClient:
    """DART OpenAPI 클라이언트"""

    def __init__(self, api_key: str = ""):
        self.api_key = api_key or DART_API_KEY
        if not self.api_key:
            raise ValueError(
                "DART API 키가 필요합니다. .env 파일에 DART_API_KEY를 설정하거나 "
                "직접 전달해주세요.\n"
                "API 키 발급: https://opendart.fss.or.kr"
            )
        self._corp_codes: dict[str, dict] = {}
        self._session = requests.Session()

    def _request(self, endpoint: str, params: dict | None = None, is_binary: bool = False):
        """API 요청 공통 메서드"""
        url = f"{BASE_URL}/{endpoint}"
        params = params or {}
        params["crtfc_key"] = self.api_key

        for attempt in range(4):
            try:
                resp = self._session.get(url, params=params, timeout=30)
                resp.raise_for_status()
                if is_binary:
                    return resp.content
                return resp.json()
            except requests.RequestException as e:
                if attempt < 3:
                    time.sleep(2 ** (attempt + 1))
                    continue
                raise RuntimeError(f"DART API 요청 실패: {e}") from e

    # ── 기업 고유번호 조회 ──────────────────────────────────────

    def load_corp_codes(self) -> dict[str, dict]:
        """기업 고유번호 전체 목록 다운로드 및 파싱"""
        if self._corp_codes:
            return self._corp_codes

        data = self._request("corpCode.xml", is_binary=True)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            xml_data = zf.read(zf.namelist()[0])

        root = ET.fromstring(xml_data)
        for corp in root.iter("list"):
            corp_code = corp.findtext("corp_code", "")
            corp_name = corp.findtext("corp_name", "")
            stock_code = corp.findtext("stock_code", "").strip()
            if corp_name:
                self._corp_codes[corp_name] = {
                    "corp_code": corp_code,
                    "corp_name": corp_name,
                    "stock_code": stock_code,
                }
        return self._corp_codes

    def search_corp(self, keyword: str) -> list[dict]:
        """기업명 키워드로 검색 (부분 매칭)"""
        corp_codes = self.load_corp_codes()
        results = []
        for name, info in corp_codes.items():
            if keyword in name:
                results.append(info)
        # 상장기업 우선, 이름 짧은 순 정렬
        results.sort(key=lambda x: (not bool(x["stock_code"]), len(x["corp_name"])))
        return results

    def get_corp_code(self, company_name: str) -> str:
        """기업명으로 고유번호 조회 (정확 매칭 우선, 없으면 부분 매칭 첫 번째)"""
        corp_codes = self.load_corp_codes()
        if company_name in corp_codes:
            return corp_codes[company_name]["corp_code"]

        matches = self.search_corp(company_name)
        if not matches:
            raise ValueError(f"'{company_name}' 기업을 찾을 수 없습니다.")
        return matches[0]["corp_code"]

    # ── 기업 개황 ──────────────────────────────────────────────

    def get_company_info(self, corp_code: str) -> dict:
        """기업 개황 조회"""
        result = self._request("company.json", {"corp_code": corp_code})
        if result.get("status") != "000":
            return {}
        return result

    # ── 재무제표 조회 ──────────────────────────────────────────

    def get_financial_statements(
        self,
        corp_code: str,
        year: int,
        report_type: str = "사업보고서",
        fs_div: str = "CFS",
    ) -> pd.DataFrame:
        """단일회사 전체 재무제표 조회

        Args:
            corp_code: 기업 고유번호
            year: 사업연도
            report_type: 보고서 유형 (1분기, 반기, 3분기, 사업보고서)
            fs_div: CFS(연결) 또는 OFS(개별)

        Returns:
            재무제표 DataFrame
        """
        reprt_code = REPORT_CODES.get(report_type, "11011")
        params = {
            "corp_code": corp_code,
            "bsns_year": str(year),
            "reprt_code": reprt_code,
            "fs_div": fs_div,
        }
        result = self._request("fnlttSinglAcntAll.json", params)

        if result.get("status") != "000":
            # 연결재무제표가 없으면 개별로 재시도
            if fs_div == "CFS":
                params["fs_div"] = "OFS"
                result = self._request("fnlttSinglAcntAll.json", params)
            if result.get("status") != "000":
                return pd.DataFrame()

        df = pd.DataFrame(result["list"])
        return df

    def get_financial_summary(
        self,
        corp_code: str,
        year: int,
        report_type: str = "사업보고서",
        fs_div: str = "CFS",
    ) -> dict[str, pd.DataFrame]:
        """재무제표를 유형별(BS, IS, CF 등)로 분리하여 반환"""
        df = self.get_financial_statements(corp_code, year, report_type, fs_div)
        if df.empty:
            return {}

        result = {}
        for sj_div, sj_name in STATEMENT_TYPES.items():
            subset = df[df["sj_div"] == sj_div].copy()
            if subset.empty:
                continue
            cols_to_keep = [
                "account_nm", "thstrm_nm", "thstrm_amount",
                "frmtrm_nm", "frmtrm_amount",
                "bfefrmtrm_nm", "bfefrmtrm_amount", "ord",
            ]
            existing_cols = [c for c in cols_to_keep if c in subset.columns]
            subset = subset[existing_cols].copy()
            subset["ord"] = pd.to_numeric(subset["ord"], errors="coerce")
            subset = subset.sort_values("ord").reset_index(drop=True)
            result[sj_name] = subset
        return result

    def get_multi_year_financials(
        self,
        corp_code: str,
        start_year: int,
        end_year: int,
        report_types: list[str] | None = None,
        fs_div: str = "CFS",
    ) -> dict[str, dict[str, pd.DataFrame]]:
        """여러 연도/분기의 재무제표를 일괄 조회

        Returns:
            {"{year}년 {report_type}": {재무제표유형: DataFrame}}
        """
        if report_types is None:
            report_types = ["사업보고서"]

        all_data = {}
        for year in range(start_year, end_year + 1):
            for rt in report_types:
                key = f"{year}년 {rt}"
                summary = self.get_financial_summary(corp_code, year, rt, fs_div)
                if summary:
                    all_data[key] = summary
                time.sleep(0.5)  # API rate limit 대응
        return all_data

    # ── 공시서류 목록 / 원문 조회 ─────────────────────────────

    def get_disclosure_list(
        self,
        corp_code: str,
        start_date: str,
        end_date: str,
        pblntf_ty: str = "A",
    ) -> list[dict]:
        """공시 목록 조회

        Args:
            pblntf_ty: A=정기공시, B=주요사항보고, C=발행공시, D=지분공시, E=기타공시, F=외부감사, G=펀드, H=자산유동화, I=거래소공시, J=공정위공시
        """
        params = {
            "corp_code": corp_code,
            "bgn_de": start_date.replace("-", ""),
            "end_de": end_date.replace("-", ""),
            "pblntf_ty": pblntf_ty,
            "page_count": "100",
        }
        result = self._request("list.json", params)
        if result.get("status") != "000":
            return []
        return result.get("list", [])

    def get_document_index(self, rcept_no: str) -> list[dict]:
        """공시서류 하위 문서 목록 조회"""
        result = self._request("document.xml", {"rcept_no": rcept_no}, is_binary=True)
        try:
            root = ET.fromstring(result)
        except ET.ParseError:
            return []

        docs = []
        for doc in root.iter("list"):
            docs.append({
                "dcm_no": doc.findtext("dcm_no", ""),
                "title": doc.findtext("title", ""),
                "url": doc.findtext("url", ""),
            })
        return docs

    def get_business_report_rcept_no(
        self, corp_code: str, year: int
    ) -> str:
        """특정 연도의 사업보고서 접수번호 조회"""
        disclosures = self.get_disclosure_list(
            corp_code,
            f"{year}-01-01",
            f"{year + 1}-06-30",
            pblntf_ty="A",
        )
        for d in disclosures:
            report_nm = d.get("report_nm", "")
            if "사업보고서" in report_nm and "첨부" not in report_nm and "정정" not in report_nm:
                return d["rcept_no"]
        # 정정 포함해서 재검색
        for d in disclosures:
            if "사업보고서" in d.get("report_nm", ""):
                return d["rcept_no"]
        return ""
