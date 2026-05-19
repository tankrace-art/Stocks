@echo off
chcp 65001 >nul 2>&1
title DART 재무분석 투자도구

echo.
echo   ============================================
echo     DART 재무분석 투자도구
echo   ============================================
echo.

REM 현재 bat 파일이 있는 폴더로 이동 (한글/공백 경로 대응)
cd /d "%~dp0"

REM ── Python 찾기 ──
set "PYTHON="

python --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON=python"
    goto :found_python
)

py --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON=py"
    goto :found_python
)

python3 --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON=python3"
    goto :found_python
)

REM Python을 찾지 못한 경우
echo.
echo   [오류] Python을 찾을 수 없습니다!
echo.
echo   설치 방법:
echo     1. https://www.python.org/downloads/ 접속
echo     2. "Download Python" 노란 버튼 클릭
echo     3. 다운로드된 파일 실행
echo     4. ★★★ "Add Python to PATH" 반드시 체크! ★★★
echo     5. "Install Now" 클릭
echo     6. 설치 완료 후 이 파일을 다시 더블클릭하세요
echo.
pause
exit /b 1

:found_python
echo   Python 확인 완료
echo   프로그램을 시작합니다...
echo   (처음 실행시 패키지 설치로 시간이 걸릴 수 있습니다)
echo.

%PYTHON% "%~dp0run_gui.py"

if %errorlevel% neq 0 (
    echo.
    echo   ────────────────────────────────────
    echo   [오류] 프로그램이 비정상 종료했습니다
    echo   ────────────────────────────────────
    echo.
    echo   해결 방법:
    echo     1. Python 3.10 이상인지 확인
    echo        (%PYTHON% --version 으로 확인)
    echo     2. 인터넷에 연결되어 있는지 확인
    echo        (처음 실행시 패키지 자동 설치 필요)
    echo     3. 그래도 안 되면 아래 명령어 직접 실행:
    echo        %PYTHON% -m pip install requests pandas beautifulsoup4 lxml openpyxl
    echo.
    pause
)
