@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cd /d "%~dp0"
set "ROOT_DIR=%CD%"
echo 当前目录：%ROOT_DIR%
echo.
echo ========================================
echo   第1步：PyInstaller 打包 EXE
echo ========================================
echo.

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
    echo [错误] PyInstaller 打包失败！请检查上方错误信息。
    pause
    exit /b 1
)

echo.
echo ========================================
echo   PyInstaller 打包成功！
echo ========================================
echo.

REM ========================================
REM   第2步：Inno Setup 编译安装包
REM ========================================
echo ========================================
echo   第2步：Inno Setup 编译安装程序
echo ========================================
echo.

cd /d "%ROOT_DIR%"

REM 查找 Inno Setup 6 编译器
set "ISCC_EXE="

if exist "D:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set "ISCC_EXE=D:\Program Files (x86)\Inno Setup 6\ISCC.exe"
) else if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set "ISCC_EXE=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
) else if exist "D:\Program Files\Inno Setup 6\ISCC.exe" (
    set "ISCC_EXE=D:\Program Files\Inno Setup 6\ISCC.exe"
) else if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set "ISCC_EXE=C:\Program Files\Inno Setup 6\ISCC.exe"
) else (
    REM 尝试通过注册表查找
    for /f "tokens=2*" %%a in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1" /v InstallLocation 2^>nul') do (
        if exist "%%bISCC.exe" set "ISCC_EXE=%%bISCC.exe"
    )
)

if "%ISCC_EXE%"=="" (
    echo [错误] 未找到 Inno Setup 6！请确认已安装 Inno Setup 6。
    echo 已检查路径：
    echo   - D:\Program Files (x86)\Inno Setup 6\ISCC.exe
    echo   - C:\Program Files (x86)\Inno Setup 6\ISCC.exe
    echo   - D:\Program Files\Inno Setup 6\ISCC.exe
    echo   - C:\Program Files\Inno Setup 6\ISCC.exe
    pause
    exit /b 1
)

echo 找到 Inno Setup：%ISCC_EXE%
echo 正在编译安装程序...
echo.

"%ISCC_EXE%" "installer.iss"

if errorlevel 1 (
    echo.
    echo [错误] Inno Setup 编译失败！请检查上方错误信息。
    pause
    exit /b 1
)

echo.
echo ========================================
echo   清理临时文件...
echo ========================================

if exist "%DIST_DIR%\YUWEITEK工具箱 Agent.exe" (
    del /f /q "%DIST_DIR%\YUWEITEK工具箱 Agent.exe"
    echo 已删除：%DIST_DIR%\YUWEITEK工具箱 Agent.exe
) else (
    echo 未找到临时 EXE，跳过清理。
)

echo.
echo ========================================
echo   全部完成！
echo ========================================
echo   安装包：  %ROOT_DIR%\YUWEITEK工具箱 Agent_1.3.1_Setup.exe
echo ========================================
pause
