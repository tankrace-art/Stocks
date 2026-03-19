"""DART OpenAPI 클라이언트

기업 검색, 재무제표 조회, 공시서류 원문 조회 기능을 제공합니다.
재무제표를 연도별 크로스 비교가 가능한 구조로 정리합니다.
"""

import io
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
        results.sort(key=lambda x: (not bool(x["stock_code"]), len(x["corp_name"])))
        return results

    def get_corp_code(self, company_name: str) -> str:
        """기업명으로 고유번호 조회"""
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
        """단일회사 전체 재무제표 조회"""
        reprt_code = REPORT_CODES.get(report_type, "11011")
        params = {
            "corp_code": corp_code,
            "bsns_year": str(year),
            "reprt_code": reprt_code,
            "fs_div": fs_div,
        }
        result = self._request("fnlttSinglAcntAll.json", params)

        if result.get("status") != "000":
            if fs_div == "CFS":
                params["fs_div"] = "OFS"
                result = self._request("fnlttSinglAcntAll.json", params)
            if result.get("status") != "000":
                return pd.DataFrame()

        df = pd.DataFrame(result["list"])
        return df

    def get_financial_by_type(
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
                "account_id", "account_nm", "thstrm_nm", "thstrm_amount",
                "frmtrm_nm", "frmtrm_amount",
                "bfefrmtrm_nm", "bfefrmtrm_amount", "ord",
            ]
            existing_cols = [c for c in cols_to_keep if c in subset.columns]
            subset = subset[existing_cols].copy()
            subset["ord"] = pd.to_numeric(subset["ord"], errors="coerce")
            subset = subset.sort_values("ord").reset_index(drop=True)
            result[sj_name] = subset
        return result

    def get_yearly_cross_data(
        self,
        corp_code: str,
        start_year: int,
        end_year: int,
        fs_div: str = "CFS",
        log_fn=None,
    ) -> dict[str, pd.DataFrame]:
        """연도별 크로스 비교 테이블 생성

        각 재무제표 유형별로, 계정과목을 행(row)에,
        연도를 열(column)에 배치한 DataFrame을 반환합니다.

        Returns:
            {"재무상태표": DataFrame, "손익계산서": DataFrame, ...}
            각 DataFrame의 열: [계정과목, 2020, 2021, 2022, ...]
        """
        # 연도별 데이터 수집
        yearly_raw: dict[int, dict[str, pd.DataFrame]] = {}

        for year in range(start_year, end_year + 1):
            if log_fn:
                log_fn(f"  {year}년 재무제표 조회 중...")
            statements = self.get_financial_by_type(
                corp_code, year, "사업보고서", fs_div
            )
            if statements:
                yearly_raw[year] = statements
                if log_fn:
                    log_fn(f"  ✓ {year}년 완료")
            else:
                if log_fn:
                    log_fn(f"  - {year}년 데이터 없음")
            time.sleep(0.5)

        if not yearly_raw:
            return {}

        # 재무제표 유형별로 연도 크로스 테이블 생성
        cross_tables = {}
        stmt_types = set()
        for year_data in yearly_raw.values():
            stmt_types.update(year_data.keys())

        for stmt_type in stmt_types:
            cross_tables[stmt_type] = self._build_cross_table(
                yearly_raw, stmt_type, start_year, end_year
            )

        return cross_tables

    def _build_cross_table(
        self,
        yearly_raw: dict[int, dict[str, pd.DataFrame]],
        stmt_type: str,
        start_year: int,
        end_year: int,
    ) -> pd.DataFrame:
        """특정 재무제표 유형의 연도별 크로스 테이블 생성"""
        # 모든 연도에서 계정과목 목록과 순서를 수집
        account_order = {}  # {account_nm: ord}
        account_ids = {}    # {account_nm: account_id}

        for year in range(start_year, end_year + 1):
            if year not in yearly_raw or stmt_type not in yearly_raw[year]:
                continue
            df = yearly_raw[year][stmt_type]
            for _, row in df.iterrows():
                nm = str(row.get("account_nm", "")).strip()
                if not nm:
                    continue
                ord_val = row.get("ord", 999)
                if nm not in account_order or ord_val < account_order[nm]:
                    account_order[nm] = ord_val
                if nm not in account_ids:
                    aid = str(row.get("account_id", "")).strip()
                    account_ids[nm] = aid

        if not account_order:
            return pd.DataFrame()

        # 순서대로 정렬
        sorted_accounts = sorted(account_order.items(), key=lambda x: x[1])
        account_names = [a[0] for a in sorted_accounts]

        # 크로스 테이블 구성
        result = {"계정과목": account_names}
        years = list(range(start_year, end_year + 1))

        for year in years:
            col_values = []
            if year in yearly_raw and stmt_type in yearly_raw[year]:
                df = yearly_raw[year][stmt_type]
                # account_nm -> thstrm_amount 매핑
                amount_map = {}
                for _, row in df.iterrows():
                    nm = str(row.get("account_nm", "")).strip()
                    amt = row.get("thstrm_amount", "")
                    if nm and amt:
                        amount_map[nm] = amt

                for acc_nm in account_names:
                    col_values.append(amount_map.get(acc_nm, ""))
            else:
                col_values = [""] * len(account_names)

            result[f"{year}"] = col_values

        return pd.DataFrame(result)

    # ── 공시서류 목록 / 원문 조회 ─────────────────────────────

    def get_disclosure_list(
        self,
        corp_code: str,
        start_date: str,
        end_date: str,
        pblntf_ty: str = "A",
    ) -> list[dict]:
        """공시 목록 조회"""
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
        for d in disclosures:
            if "사업보고서" in d.get("report_nm", ""):
                return d["rcept_no"]
        return ""
