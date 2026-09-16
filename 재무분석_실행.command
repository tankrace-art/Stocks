#!/bin/bash
# macOS/Linux 더블클릭 실행 파일
# 사용법: 이 파일을 더블클릭 (macOS는 "터미널"에서 열기 앱으로 지정 필요)

cd "$(dirname "$0")"

echo "============================================"
echo "  DART 투자분석 자동화 프로그램"
echo "============================================"
echo

# Python 확인
if ! command -v python3 >/dev/null 2>&1; then
    echo "[오류] Python3가 설치되어 있지 않습니다."
    echo
    echo "  macOS: brew install python3"
    echo "  Ubuntu: sudo apt install python3 python3-pip python3-tk"
    echo
    read -p "Enter 키를 눌러 종료..."
    exit 1
fi

# 필수 라이브러리 확인
if ! python3 -c "import pandas, openpyxl, bs4, lxml, dotenv" >/dev/null 2>&1; then
    echo "[초기 설정] 필요한 라이브러리를 설치합니다... 처음 한 번만 실행됩니다."
    echo
    python3 -m pip install --upgrade pip >/dev/null 2>&1
    python3 -m pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo
        echo "[오류] 라이브러리 설치 실패"
        echo "pip3 install -r requirements.txt 를 직접 실행해보세요."
        read -p "Enter 키를 눌러 종료..."
        exit 1
    fi
    echo
    echo "[완료] 라이브러리 설치 완료"
    echo
fi

# .env 파일 자동 생성
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "[초기 설정] .env 파일을 생성했습니다."
    echo "  → GUI의 'DART API 키' 필드에 발급받은 키를 입력하세요."
    echo "  → API 발급: https://opendart.fss.or.kr"
    echo
    cp .env.example .env
fi

echo "[실행] GUI를 여는 중..."
echo
python3 run_gui.py

if [ $? -ne 0 ]; then
    echo
    echo "[오류] 프로그램 실행 중 오류가 발생했습니다."
    read -p "Enter 키를 눌러 종료..."
fi
