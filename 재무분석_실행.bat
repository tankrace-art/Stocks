@echo off
chcp 65001 >nul 2>&1
title DART 투자분석 자동화

echo ============================================
echo   DART 투자분석 자동화 프로그램
echo ============================================
echo.

REM 이 bat 파일이 있는 폴더로 이동
cd /d "%~dp0"

REM ── Python 설치 확인 ──
python --version >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo.
    echo   1. https://www.python.org/downloads/ 접속
    echo   2. Python 3.10 이상 다운로드
    echo   3. 설치할 때 반드시 "Add Python to PATH" 체크!
    echo.
    pause
    exit /b 1
)

REM ── 필수 라이브러리 자동 설치 (설치되어 있으면 스킵) ──
python -c "import pandas, openpyxl, bs4, lxml, dotenv" >nul 2>&1
if errorlevel 1 (
    echo [초기 설정] 필요한 라이브러리를 설치합니다... 처음 한 번만 실행됩니다.
    echo.
    python -m pip install --upgrade pip >nul 2>&1
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo.
        echo [오류] 라이브러리 설치 실패
        echo pip install -r requirements.txt 를 직접 실행해보세요.
        pause
        exit /b 1
    )
    echo.
    echo [완료] 라이브러리 설치 완료
    echo.
)

REM ── .env 파일 확인 ──
if not exist ".env" (
    if exist ".env.example" (
        echo [초기 설정] .env 파일 생성 중...
        copy /Y ".env.example" ".env" >nul
        echo   → .env 파일이 생성되었습니다.
        echo   → 다음 창의 "DART API 키" 필드에 발급받은 키를 입력하세요.
        echo   → API 발급: https://opendart.fss.or.kr
        echo.
    )
)

REM ── GUI 실행 ──
echo [실행] GUI를 여는 중...
echo.
python run_gui.py

if errorlevel 1 (
    echo.
    echo [오류] 프로그램 실행 중 오류가 발생했습니다.
    echo 위의 메시지를 확인해주세요.
    echo.
    pause
)
