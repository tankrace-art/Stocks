"""DART OpenAPI 설정"""

import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DART_API_KEY = os.getenv("DART_API_KEY", "")

# DART OpenAPI 기본 URL
BASE_URL = "https://opendart.fss.or.kr/api"

# 보고서 코드
REPORT_CODES = {
    "1분기": "11013",
    "반기": "11012",
    "3분기": "11014",
    "사업보고서": "11011",
}

# 재무제표 구분
FS_DIVISION = {
    "연결": "CFS",  # 연결재무제표
    "개별": "OFS",  # 개별재무제표
}

# 재무제표 유형 (sj_div)
STATEMENT_TYPES = {
    "BS": "재무상태표",
    "IS": "손익계산서",
    "CIS": "포괄손익계산서",
    "CF": "현금흐름표",
    "SCE": "자본변동표",
}
