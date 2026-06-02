@echo off
chcp 65001 >nul
title 一键更新版本号
echo.
echo ========================================
echo    一键更新版本号
echo ========================================
echo.
set /p VER=请输入新版本号（如 1.3.2）:
if "%VER%"=="" (
    echo [ERROR] 版本号不能为空！
    pause
    exit /b 1
)
echo.
python "%~dp0update_version.py" %VER%
echo.
pause
