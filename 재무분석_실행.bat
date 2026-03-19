@echo off
chcp 65001 >nul 2>&1
title DART 재무데이터 크롤러

echo ============================================
echo   DART 재무데이터 크롤러를 실행합니다...
echo ============================================
echo.

REM 현재 bat 파일이 있는 폴더로 이동
cd /d "%~dp0"

REM Python 실행
python run_gui.py

REM 에러 발생시 안내
if errorlevel 1 (
    echo.
    echo [오류] 프로그램 실행에 실패했습니다.
    echo.
    echo 아래 사항을 확인해주세요:
    echo   1. Python이 설치되어 있는지 확인
    echo      - https://www.python.org/downloads/ 에서 설치
    echo      - 설치시 "Add Python to PATH" 반드시 체크!
    echo.
    echo   2. 필요한 패키지가 설치되어 있는지 확인
    echo      - 이 창에서 아래 명령어를 입력하세요:
    echo      - pip install -r requirements.txt
    echo.
    pause
)
