@echo off
chcp 65001 > nul
title Medicube 트렌드 트래커 - 자동 실행

echo.
echo  ================================================
echo     Medicube 트렌드 트래커 - 자동 업데이트 실행
echo  ================================================
echo.

:: ── 1. Python 확인 ───────────────────────────────────────
python --version > nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo 아래 주소에서 Python을 설치하세요:
    echo   https://www.python.org/downloads/
    echo   (설치 시 "Add Python to PATH" 반드시 체크!)
    pause
    exit /b 1
)

:: ── 2. Git 확인 ──────────────────────────────────────────
git --version > nul 2>&1
if errorlevel 1 (
    echo [오류] Git이 설치되어 있지 않습니다.
    echo 아래 주소에서 Git을 설치하세요:
    echo   https://git-scm.com/download/win
    pause
    exit /b 1
)

:: ── 3. 폴더 설정 (바탕화면 옆 Stocks 폴더) ────────────────
set INSTALL_DIR=%USERPROFILE%\Documents\Medicube트렌드

:: ── 4. 처음 실행: 자동 다운로드 (git clone) ──────────────
if not exist "%INSTALL_DIR%\.git" (
    echo [다운로드] 처음 실행입니다. 프로그램을 다운로드합니다...
    echo 폴더: %INSTALL_DIR%
    echo.
    git clone -b claude/medicube-trend-tracker-NbZtk ^
        https://github.com/tankrace-art/Stocks.git ^
        "%INSTALL_DIR%"
    if errorlevel 1 (
        echo.
        echo [오류] 다운로드 실패. 인터넷 연결을 확인하세요.
        pause
        exit /b 1
    )
    echo [완료] 다운로드 성공!
) else (
    :: ── 5. 이후 실행: 자동 최신 업데이트 (git pull) ─────────
    echo [업데이트] 최신 버전으로 업데이트 중...
    cd /d "%INSTALL_DIR%"
    git pull origin claude/medicube-trend-tracker-NbZtk
    echo [완료] 업데이트 완료!
)

:: ── 6. 폴더 이동 ────────────────────────────────────────
cd /d "%INSTALL_DIR%"

:: ── 7. 필요 패키지 자동 설치 ────────────────────────────
echo.
echo [설치] 필요한 패키지 확인 중...
pip install -r requirements.txt -q
echo [완료] 패키지 준비 완료!

:: ── 8. 프로그램 실행 ─────────────────────────────────────
echo.
echo [시작] Medicube 트렌드 트래커를 실행합니다!
echo.
python run_medicube.py

if errorlevel 1 (
    echo.
    echo [오류] 프로그램 실행 중 문제가 발생했습니다.
    pause
)
