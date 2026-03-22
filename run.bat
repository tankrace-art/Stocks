@echo off
title Medicube Trend Tracker

echo.
echo  ================================================
echo    Medicube Trend Tracker - Auto Update
echo  ================================================
echo.

python --version > /dev/null 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found.
    echo Please install Python from: https://www.python.org/downloads/
    echo IMPORTANT: Check Add Python to PATH during install!
    pause
    exit /b 1
)

git --version > /dev/null 2>&1
if errorlevel 1 (
    echo [ERROR] Git not found.
    echo Please install Git from: https://git-scm.com/download/win
    pause
    exit /b 1
)

set DIR=%USERPROFILE%\Documents\MedicubeTracker

if not exist "%DIR%\.git" (
    echo [INFO] First run - downloading program...
    git clone -b claude/medicube-trend-tracker-NbZtk https://github.com/tankrace-art/Stocks.git "%DIR%"
    if errorlevel 1 (
        echo [ERROR] Download failed. Check internet connection.
        pause
        exit /b 1
    )
    echo [OK] Download complete!
) else (
    echo [INFO] Updating to latest version...
    cd /d "%DIR%"
    git pull origin claude/medicube-trend-tracker-NbZtk
    echo [OK] Update complete!
)

cd /d "%DIR%"
echo [INFO] Installing packages...
pip install -r requirements.txt -q
echo [OK] Ready!
echo.
python run_medicube.py
if errorlevel 1 pause
