@echo off
chcp 65001 > nul
echo ============================================================
echo   KRX 금시장 데이터 수집기 - EXE 빌드
echo ============================================================
echo.

REM 가상환경 사용 권장 (선택)
REM python -m venv venv
REM call venv\Scripts\activate

echo [1/3] 필요 라이브러리 설치 중...
pip install -q requests pandas openpyxl matplotlib pyinstaller
if errorlevel 1 (
    echo [오류] 라이브러리 설치 실패
    pause
    exit /b 1
)

echo.
echo [2/3] 기존 빌드 파일 정리 중...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "KRX금시장수집기.spec" del /q "KRX금시장수집기.spec"

echo.
echo [3/3] EXE 파일 빌드 중... (수 분 소요)
pyinstaller ^
    --name "KRX금시장수집기" ^
    --onefile ^
    --windowed ^
    --noconfirm ^
    --clean ^
    --hidden-import "matplotlib.backends.backend_agg" ^
    --hidden-import "openpyxl" ^
    --hidden-import "openpyxl.drawing.image" ^
    --hidden-import "PIL" ^
    --hidden-import "PIL._tkinter_finder" ^
    --collect-data "matplotlib" ^
    run_gold.py

if errorlevel 1 (
    echo.
    echo [오류] 빌드 실패
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   빌드 완료!
echo ============================================================
echo.
echo   실행 파일: dist\KRX금시장수집기.exe
echo.
echo   바탕화면 등에 복사해서 더블클릭으로 실행하세요.
echo ============================================================
echo.
pause
