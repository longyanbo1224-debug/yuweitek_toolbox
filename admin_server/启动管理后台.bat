@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   YUWEITEK Remote Auth Admin
echo ========================================
echo.
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.8+
    pause
    exit /b 1
)
echo [1/2] Checking dependencies...
pip install -r requirements.txt -q
echo [2/2] Starting admin server...
echo.
python app.py
pause