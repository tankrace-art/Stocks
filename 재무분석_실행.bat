@echo off
chcp 65001 >nul 2>&1
title DART Investment Analyzer
cd /d "%~dp0"

echo ============================================
echo   DART Investment Analyzer
echo ============================================
echo Current folder: %cd%
echo.

REM ── Python 찾기 ──
set "PYCMD="

echo [1/4] Searching for Python...
py -3 --version >nul 2>&1
if not errorlevel 1 (
    set "PYCMD=py -3"
    echo   Found: py launcher
    goto :found
)

python --version >nul 2>&1
if not errorlevel 1 (
    set "PYCMD=python"
    echo   Found: python command
    goto :found
)

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
        echo   Found: %%P
        goto :found
    )
)

echo.
echo [ERROR] Python not found on this system!
echo.
echo Install Python from: https://www.python.org/downloads/
echo IMPORTANT: Check "Add python.exe to PATH" during install.
echo.
pause
exit /b 1

:found
echo.
%PYCMD% --version
echo.

REM ── tkinter (GUI 라이브러리) 확인 ──
echo [2/4] Checking tkinter (GUI support)...
%PYCMD% -c "import tkinter" 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] Python has no tkinter installed.
    echo This usually means you installed Python from Microsoft Store.
    echo.
    echo Solution: Reinstall Python from https://www.python.org/downloads/
    echo Uncheck Microsoft Store version. Use official installer.
    echo.
    pause
    exit /b 1
)
echo   OK
echo.

REM ── 필수 라이브러리 설치 ──
echo [3/4] Checking libraries...
%PYCMD% -c "import pandas, openpyxl, bs4, lxml, dotenv" 2>nul
if errorlevel 1 (
    echo   Installing libraries (first time only, may take 1-2 minutes)...
    echo.
    %PYCMD% -m pip install --upgrade pip
    %PYCMD% -m pip install -r requirements.txt
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to install libraries.
        echo Check your internet connection.
        pause
        exit /b 1
    )
) else (
    echo   OK - all libraries present
)
echo.

REM ── .env 파일 ──
if not exist ".env" (
    if exist ".env.example" (
        copy /Y ".env.example" ".env" >nul
        echo Created .env file.
    )
)

REM ── GUI 실행 ──
echo [4/4] Launching GUI...
echo   (If nothing appears within 10 seconds, check the error below)
echo.
%PYCMD% run_gui.py
set "RC=%errorlevel%"

echo.
echo ============================================
if "%RC%"=="0" (
    echo Program closed normally.
) else (
    echo Program exited with error code: %RC%
)
echo ============================================
echo.
pause
