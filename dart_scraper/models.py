"""데이터 모델"""

from dataclasses import dataclass, field


@dataclass
class CorpInfo:
    """기업 기본 정보"""
    corp_code: str
    corp_name: str
    stock_code: str = ""
    modify_date: str = ""


@dataclass
class FinancialItem:
    """재무제표 항목"""
    sj_div: str          # 재무제표 구분 (BS, IS, CIS, CF)
    sj_nm: str           # 재무제표명
    account_id: str      # 계정ID
    account_nm: str      # 계정명
    account_detail: str  # 계정상세
    thstrm_nm: str       # 당기명
    thstrm_amount: str   # 당기금액
    frmtrm_nm: str = ""  # 전기명
    frmtrm_amount: str = ""  # 전기금액
    bfefrmtrm_nm: str = ""   # 전전기명
    bfefrmtrm_amount: str = ""  # 전전기금액
    ord: str = ""        # 계정과목 정렬순서


@dataclass
class BusinessSection:
    """사업보고서 섹션 데이터"""
    title: str
    tables: list = field(default_factory=list)
    text_content: str = ""
