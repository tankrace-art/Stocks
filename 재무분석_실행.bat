@echo off
chcp 65001 >nul 2>&1
title DART 투자분석 자동화
cd /d "%~dp0"

echo ============================================
echo   DART 투자분석 자동화
echo ============================================
echo.

REM ── Python 찾기 (py 런처 우선, python 폴백, 흔한 설치경로 검색) ──
set "PYCMD="

py -3 --version >nul 2>&1
if not errorlevel 1 (
    set "PYCMD=py -3"
    goto :found
)

python --version >nul 2>&1
if not errorlevel 1 (
    set "PYCMD=python"
    goto :found
)

REM 흔한 설치 경로 직접 시도
for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
) do (
    if exist %%P (
        set "PYCMD=%%P"
        goto :found
    )
)

echo [ERROR] Python not found.
echo.
echo Python is installed but not on PATH.
echo Please reinstall Python from https://www.python.org/downloads/
echo and CHECK the "Add python.exe to PATH" option at install!
echo.
pause
exit /b 1

:found
echo Using: %PYCMD%
%PYCMD% --version
echo.

REM ── 필수 라이브러리 자동 설치 ──
%PYCMD% -c "import pandas, openpyxl, bs4, lxml, dotenv" >nul 2>&1
if errorlevel 1 (
    echo Installing required libraries (first time only)...
    echo.
    %PYCMD% -m pip install --upgrade pip
    %PYCMD% -m pip install -r requirements.txt
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to install libraries.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Libraries installed.
    echo.
)

REM ── .env 파일 확인 ──
if not exist ".env" (
    if exist ".env.example" (
        copy /Y ".env.example" ".env" >nul
        echo Created .env file. Enter your DART API key in the GUI.
        echo.
    )
)

REM ── GUI 실행 ──
echo Launching GUI...
echo.
%PYCMD% run_gui.py

if errorlevel 1 (
    echo.
    echo [ERROR] Program terminated with error.
    pause
)
