@echo off
chcp 65001 > nul
title Medicube 트렌드 트래커 - APR

echo.
echo  ================================================
echo     Medicube 트렌드 트래커 (APR 브랜드)
echo  ================================================
echo.

:: 파이썬 확인
python --version > nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo Python 3.8 이상을 설치하고 다시 실행하세요.
    echo https://www.python.org/downloads/
    pause
    exit /b 1
)

:: 작업 디렉토리를 bat 파일 위치로 설정
cd /d "%~dp0"

:: 필요 패키지 설치 확인
echo [설치 확인] 필요한 패키지를 확인합니다...
python -c "import pytrends" > nul 2>&1
if errorlevel 1 (
    echo [설치] pytrends 설치 중...
    pip install pytrends -q
)

python -c "import selenium" > nul 2>&1
if errorlevel 1 (
    echo [설치] selenium 설치 중...
    pip install selenium webdriver-manager -q
)

python -c "import openpyxl" > nul 2>&1
if errorlevel 1 (
    echo [설치] openpyxl 설치 중...
    pip install openpyxl -q
)

python -c "import bs4" > nul 2>&1
if errorlevel 1 (
    echo [설치] beautifulsoup4 설치 중...
    pip install beautifulsoup4 lxml -q
)

echo.
echo [시작] Medicube 트렌드 트래커를 실행합니다...
echo.

python run_medicube.py

if errorlevel 1 (
    echo.
    echo [오류] 프로그램 실행 중 오류가 발생했습니다.
    echo 아래 명령어로 패키지를 설치하고 다시 시도하세요:
    echo   pip install -r requirements.txt
    echo.
    pause
)
