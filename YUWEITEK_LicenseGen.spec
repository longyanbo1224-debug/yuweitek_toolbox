# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['license_generator_gui.py'],
    pathex=[],
    binaries=[],
    datas=[('logo.ico', '.')],
    hiddenimports=['cryptography.hazmat.backends.openssl', 'cryptography.hazmat.primitives.asymmetric.padding', 'cryptography.hazmat.bindings._rust', 'openpyxl'],
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
    name='YUWEITEK_LicenseGen',
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
    icon=['logo.ico'],
)
