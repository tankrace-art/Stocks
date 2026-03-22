@echo off
title Medicube Trend Tracker

echo.
echo  ================================================
echo    Medicube Trend Tracker - Auto Update
echo  ================================================
echo.

python --version > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python first.
    echo https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH"
    pause
    exit /b 1
)

git --version > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git not found. Please install Git first.
    echo https://git-scm.com/download/win
    pause
    exit /b 1
)

set INSTALL_DIR=%USERPROFILE%\Documents\MedicubeTracker

if not exist "%INSTALL_DIR%\.git" (
    echo [INFO] First run - downloading program...
    git clone -b claude/medicube-trend-tracker-NbZtk https://github.com/tankrace-art/Stocks.git "%INSTALL_DIR%"
    if errorlevel 1 (
        echo [ERROR] Download failed. Check internet connection.
        pause
        exit /b 1
    )
    echo [OK] Download complete!
) else (
    echo [INFO] Updating to latest version...
    cd /d "%INSTALL_DIR%"
    git pull origin claude/medicube-trend-tracker-NbZtk
    echo [OK] Update complete!
)

cd /d "%INSTALL_DIR%"

echo [INFO] Installing required packages...
pip install -r requirements.txt -q
echo [OK] Packages ready!

echo.
echo [START] Launching Medicube Trend Tracker...
echo.
python run_medicube.py

if errorlevel 1 (
    echo.
    echo [ERROR] Program encountered an error.
    pause
)
