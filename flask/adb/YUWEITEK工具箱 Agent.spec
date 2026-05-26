# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['adb_server.py'],
    pathex=[],
    binaries=[],
    datas=[('..\\..\\index.html', '.'), ('..\\..\\css', 'css'), ('..\\..\\js', 'js'), ('..\\..\\img', 'img'), ('..\\..\\lib', 'lib'), ('..\\..\\app.ico', '.'), ('E:\\Users\\yw\\Desktop\\YUWEITEK工具箱 Agent v1.3.0_2（本地授权记录格式更改）\\wwwroot\\flask\\ffmpeg.exe', '.'), ('E:\\Users\\yw\\Desktop\\YUWEITEK工具箱 Agent v1.3.0_2（本地授权记录格式更改）\\wwwroot\\flask\\ffprobe.exe', '.'), ('E:\\Users\\yw\\Desktop\\YUWEITEK工具箱 Agent v1.3.0_2（本地授权记录格式更改）\\wwwroot\\flask\\adb\\adb.exe', '.'), ('E:\\Users\\yw\\Desktop\\YUWEITEK工具箱 Agent v1.3.0_2（本地授权记录格式更改）\\wwwroot\\flask\\adb\\AdbWinApi.dll', '.'), ('E:\\Users\\yw\\Desktop\\YUWEITEK工具箱 Agent v1.3.0_2（本地授权记录格式更改）\\wwwroot\\flask\\adb\\AdbWinUsbApi.dll', '.'), ('E:\\Users\\yw\\Desktop\\YUWEITEK工具箱 Agent v1.3.0_2（本地授权记录格式更改）\\wwwroot\\flask\\JTTools.exe', '.'), ('E:\\Users\\yw\\Desktop\\YUWEITEK工具箱 Agent v1.3.0_2（本地授权记录格式更改）\\wwwroot\\flask\\appsettings.json', '.')],
    hiddenimports=['pystray', 'PIL'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='YUWEITEK工具箱 Agent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['E:\\Users\\yw\\Desktop\\YUWEITEK工具箱 Agent v1.3.0_2（本地授权记录格式更改）\\wwwroot\\app.ico'],
)
