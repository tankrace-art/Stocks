@echo off
setlocal
chcp 65001 >nul 2>&1
title DART Investment Analyzer
cd /d "%~dp0"

echo ============================================
echo   DART Investment Analyzer
echo ============================================
echo Folder: %cd%
echo.

set "PYCMD="

echo [1/4] Searching Python...
py -3 --version >nul 2>&1 && set "PYCMD=py -3"
if not defined PYCMD python --version >nul 2>&1 && set "PYCMD=python"

if not defined PYCMD (
    if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set "PYCMD=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
)
if not defined PYCMD (
    if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PYCMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
)
if not defined PYCMD (
    if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PYCMD=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
)

if not defined PYCMD goto :no_python

echo   Using: %PYCMD%
%PYCMD% --version
echo.

echo [2/4] Checking tkinter...
%PYCMD% -c "import tkinter" >nul 2>&1
if errorlevel 1 goto :no_tkinter
echo   OK
echo.

echo [3/4] Checking libraries...
%PYCMD% -c "import pandas, openpyxl, bs4, lxml, dotenv" >nul 2>&1
if errorlevel 1 goto :install_libs
echo   OK - already installed
goto :run_gui

:install_libs
echo   First-time setup: installing libraries. Please wait 1-2 minutes.
echo.
%PYCMD% -m pip install --upgrade pip
%PYCMD% -m pip install -r requirements.txt
if errorlevel 1 goto :install_failed
echo.
echo   Libraries installed.
echo.

:run_gui
if not exist ".env" if exist ".env.example" copy /Y ".env.example" ".env" >nul

echo [4/4] Launching GUI...
echo.
%PYCMD% run_gui.py
set "RC=%errorlevel%"

echo.
echo ============================================
if "%RC%"=="0" echo Program closed normally.
if not "%RC%"=="0" echo Program exited with error code: %RC%
echo ============================================
echo.
pause
exit /b 0

:no_python
echo.
echo [ERROR] Python not found on this system.
echo.
echo Install Python from https://www.python.org/downloads/
echo During install, CHECK "Add python.exe to PATH".
echo.
pause
exit /b 1

:no_tkinter
echo.
echo [ERROR] Python is installed, but tkinter GUI library is missing.
echo.
echo Fix: Reinstall Python from https://www.python.org/downloads/
echo   1. Click "Customize installation"
echo   2. Check "tcl/tk and IDLE" option
echo   3. Also check "Add python.exe to PATH"
echo.
pause
exit /b 1

:install_failed
echo.
echo [ERROR] Failed to install libraries.
echo Check your internet connection and try again.
echo.
pause
exit /b 1
