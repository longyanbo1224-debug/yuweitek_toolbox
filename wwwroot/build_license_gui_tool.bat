@echo off
chcp 65001 >nul 2>nul
title YUWEITEK 授权工具打包器

REM ==================== 配置区域 ====================
set EXE_NAME=YUWEITEK_LicenseGen
set SCRIPT_NAME=license_generator_gui.py
set ICON_FILE=logo.ico
REM =================================================

echo ============================================
echo   YUWEITEK 授权码生成工具 - 一键打包脚本
echo ============================================
echo.

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 并添加到 PATH。
    pause
    exit /b 1
)
echo [√] Python 已安装。

REM 检查 pip
pip --version >nul 2>&1
if errorlevel 1 (
    echo [错误] pip 不可用，请确保 Python 安装时勾选了 pip。
    pause
    exit /b 1
)

REM 检查并安装 pyinstaller
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo [信息] 未检测到 PyInstaller，正在安装...
    pip install pyinstaller
    if errorlevel 1 (
        echo [错误] PyInstaller 安装失败，请检查网络或手动安装。
        pause
        exit /b 1
    )
    echo [√] PyInstaller 安装成功。
) else (
    echo [√] PyInstaller 已安装。
)

REM 检查需要打包的脚本
if not exist "%SCRIPT_NAME%" (
    echo [错误] 当前目录下未找到 %SCRIPT_NAME% 文件。
    pause
    exit /b 1
)

REM 检查图标文件
if not exist "%ICON_FILE%" (
    echo [警告] 未找到图标文件 %ICON_FILE%，将使用默认图标。
    set ICON_PARAM=
) else (
    set ICON_PARAM=--icon="%ICON_FILE%"
    echo [√] 找到图标文件 %ICON_FILE%。
)

REM 清理旧文件（可选）
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist
if exist "%EXE_NAME%.spec" del "%EXE_NAME%.spec"

echo.
echo [信息] 开始打包，这可能需要几分钟时间...
echo.

REM 执行打包命令（生产环境：隐藏控制台窗口）
pyinstaller --onefile --windowed --name "%EXE_NAME%" %ICON_PARAM% --add-data "logo.ico;." --hidden-import=cryptography.hazmat.backends.openssl --hidden-import=cryptography.hazmat.primitives.asymmetric.padding --hidden-import=cryptography.hazmat.bindings._rust --hidden-import=openpyxl "%SCRIPT_NAME%"

REM ========== 调试用（带控制台窗口，可查看输出信息） ==========
REM 如果需要调试，请取消下面一行的注释，并注释上面的生产环境命令。
REM pyinstaller --onefile --console --name "%EXE_NAME%_debug" %ICON_PARAM% --add-data "logo.ico;." --hidden-import=cryptography.hazmat.backends.openssl --hidden-import=cryptography.hazmat.primitives.asymmetric.padding --hidden-import=cryptography.hazmat.bindings._rust --hidden-import=openpyxl "%SCRIPT_NAME%"

if errorlevel 1 (
    echo.
    echo [错误] 打包失败，请检查错误信息。
    pause
    exit /b 1
)

echo.
echo ============================================
echo   打包成功！
echo   生成的文件位于：dist\%EXE_NAME%.exe
echo ============================================
echo.
echo 提示：你可以将 dist\%EXE_NAME%.exe 复制到任何位置，
echo       双击运行即可生成授权码。
echo.
pause