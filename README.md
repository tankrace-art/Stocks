# DART 전자공시시스템 재무데이터 스크래퍼

한국 금융감독원 전자공시시스템(DART) OpenAPI를 활용하여 기업의 재무제표와 사업보고서 주요 내용을 자동으로 수집·분석하는 도구입니다.

## 주요 기능

- **기업 검색**: 기업명 키워드로 DART 고유번호 자동 검색
- **재무제표 조회**: 손익계산서, 재무상태표, 현금흐름표, 포괄손익계산서
- **분기별/연도별 조회**: 1분기, 반기, 3분기, 사업보고서 선택 가능
- **사업내용 분석**: 매출유형, 제품가격, 생산능력, 생산실적, 가동률 등 자동 파싱
- **데이터 저장**: Excel/CSV 형식으로 내보내기

## 사전 준비

### 1. DART API 키 발급
[DART OpenAPI](https://opendart.fss.or.kr)에서 회원가입 후 인증키를 발급받으세요.

### 2. 설치
```bash
pip install -r requirements.txt
```

### 3. API 키 설정
```bash
cp .env.example .env
# .env 파일을 편집하여 DART_API_KEY 입력
```

## 사용법

### CLI 사용
```bash
# 단일 연도 조회
python -m dart_scraper.main --company "삼성전자" --period "2024"

# 기간 범위 조회
python -m dart_scraper.main --company "SK하이닉스" --period "2020-2024"

# 분기별 조회
python -m dart_scraper.main --company "LG에너지솔루션" --period "2023 분기"

# Excel로 저장
python -m dart_scraper.main --company "삼성전자" --period "2022-2024" --save excel

# 개별 재무제표 조회
python -m dart_scraper.main --company "현대자동차" --period "2023" --fs 개별

# 사업내용 분석 제외
python -m dart_scraper.main --company "삼성전자" --period "2024" --no-business
```

### Python 코드에서 사용
```python
from dart_scraper.dart_client import DartClient
from dart_scraper.report_parser import ReportParser

client = DartClient("YOUR_API_KEY")

# 기업 검색
results = client.search_corp("삼성전자")
corp_code = results[0]["corp_code"]

# 재무제표 조회
statements = client.get_financial_summary(corp_code, 2024)
for name, df in statements.items():
    print(f"\n{name}")
    print(df)

# 사업내용 파싱
parser = ReportParser(client)
sections = parser.parse_business_content(corp_code, 2024)
for section, tables in sections.items():
    print(f"\n[{section}]")
    for df in tables:
        print(df)
```

## 조회 가능 데이터

### 재무제표
| 구분 | 설명 |
|------|------|
| 재무상태표 (BS) | 자산, 부채, 자본 |
| 손익계산서 (IS) | 매출, 영업이익, 당기순이익 |
| 포괄손익계산서 (CIS) | 기타포괄손익 포함 |
| 현금흐름표 (CF) | 영업/투자/재무활동 현금흐름 |

### 사업보고서 주요 항목
- 매출유형 / 매출실적
- 제품 가격
- 생산능력 / 생산실적 / 가동률
- 설비 현황
- 수주 현황
- 연구개발 현황

## 기간 입력 형식

| 형식 | 설명 | 예시 |
|------|------|------|
| `YYYY` | 단일 연도 사업보고서 | `"2024"` |
| `YYYY-YYYY` | 연도 범위 사업보고서 | `"2020-2024"` |
| `YYYY 분기` | 단일 연도 전체 분기 | `"2024 분기"` |
| `YYYY-YYYY 분기` | 연도 범위 전체 분기 | `"2022-2024 분기"` |

## 참고

- DART OpenAPI는 2015년 이후 데이터를 제공합니다
- 연결재무제표 조회 실패 시 자동으로 개별재무제표로 재시도합니다
- API 호출 제한(분당 1,000회)을 고려하여 호출 간 0.5초 간격을 둡니다
