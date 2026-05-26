@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cd /d "%~dp0"
set "ROOT_DIR=%CD%"
echo 当前目录：%ROOT_DIR%

if not exist "index.html" (
    echo 错误：index.html 不存在！
    pause
    exit /b 1
)

if not exist "app.ico" (
    echo 警告：app.ico 未找到，将使用默认图标。
    set "ICON_ARG="
) else (
    echo 找到 app.ico，将作为程序图标。
    set "ICON_ARG=--icon="%ROOT_DIR%\app.ico""
)

python -c "import PIL" 2>nul
if errorlevel 1 (
    echo 提示：未安装 Pillow，建议执行：pip install pillow
)

python -c "import pyinstaller" 2>nul
if errorlevel 1 (
    echo 正在从清华源安装 PyInstaller...
    pip install -i https://pypi.tuna.tsinghua.edu.cn/simple pyinstaller
    if errorlevel 1 (
        echo PyInstaller 安装失败！
        pause
        exit /b 1
    )
) else (
    echo PyInstaller 已安装
)

if not exist "flask\adb" (
    echo 错误：flask\adb 目录不存在！
    pause
    exit /b 1
)
cd flask\adb
set "ADB_DIR=%CD%"
echo 进入打包目录：%ADB_DIR%

set "DIST_DIR=%ROOT_DIR%\dist"
if not exist "!DIST_DIR!" (
    echo 创建 dist 目录：!DIST_DIR!
    mkdir "!DIST_DIR!"
)

set ADB_FLAG=
if exist "%ADB_DIR%\adb.exe" (
    echo 找到 adb.exe，将一并打包
    set ADB_FLAG=--add-data "%ADB_DIR%\adb.exe;."
) else (
    echo 警告：adb.exe 未找到
)

if exist "%ADB_DIR%\AdbWinApi.dll" (
    echo 找到 AdbWinApi.dll，将一并打包
    set ADB_FLAG=!ADB_FLAG! --add-data "%ADB_DIR%\AdbWinApi.dll;."
) else (
    echo 警告：AdbWinApi.dll 未找到
)

if exist "%ADB_DIR%\AdbWinUsbApi.dll" (
    echo 找到 AdbWinUsbApi.dll，将一并打包
    set ADB_FLAG=!ADB_FLAG! --add-data "%ADB_DIR%\AdbWinUsbApi.dll;."
) else (
    echo 警告：AdbWinUsbApi.dll 未找到
)

set "FLASK_ROOT=%ROOT_DIR%\flask"

if exist "%FLASK_ROOT%\JTTools.exe" (
    echo 找到 JTTools.exe，将一并打包
    set ADB_FLAG=!ADB_FLAG! --add-data "%FLASK_ROOT%\JTTools.exe;."
) else (
    echo 错误：JTTools.exe 未找到！
    pause
    exit /b 1
)

if exist "%FLASK_ROOT%\appsettings.json" (
    echo 找到 appsettings.json，将一并打包
    set ADB_FLAG=!ADB_FLAG! --add-data "%FLASK_ROOT%\appsettings.json;."
) else (
    echo 警告：appsettings.json 未找到
)

echo 正在打包，输出目录：!DIST_DIR!

REM ========== 原有打包命令（浏览器） ==========
pyinstaller --onefile --windowed --name "YUWEITEK工具箱 Agent" %ICON_ARG% --clean --distpath "%DIST_DIR%" --hidden-import pystray --hidden-import PIL --add-data "..\..\index.html;." --add-data "..\..\css;css" --add-data "..\..\js;js" --add-data "..\..\img;img" --add-data "..\..\lib;lib" --add-data "..\..\app.ico;." --add-data "%FLASK_ROOT%\ffmpeg.exe;." --add-data "%FLASK_ROOT%\ffprobe.exe;." %ADB_FLAG% adb_server.py

if errorlevel 1 (
    echo.
    echo [错误] 打包失败！请检查上方错误信息。
    pause
    exit /b 1
)

echo 打包成功！输出文件：%DIST_DIR%\YUWEITEK工具箱.exe
pause