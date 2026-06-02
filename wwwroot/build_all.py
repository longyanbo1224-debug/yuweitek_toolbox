# -*- coding: utf-8 -*-
import subprocess, sys, os, re

def run(cmd, cwd=None):
    print(f"  Exec: {cmd}")
    r = subprocess.run(cmd, shell=True, cwd=cwd)
    if r.returncode != 0:
        print(f"  [ERROR] Failed, return code: {r.returncode}")
        return False
    return True

def get_current_version(root):
    """从 config.py 读取当前版本号"""
    config_py = os.path.join(root, "flask", "adb", "config.py")
    if os.path.isfile(config_py):
        with open(config_py, "r", encoding="utf-8") as f:
            m = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', f.read())
            if m:
                return m.group(1)
    return "unknown"

def update_version(root, new_version):
    """更新三个文件的版本号"""
    replacements = [
        (
            os.path.join(root, "installer.iss"),
            r'(#define\s+MyAppVersion\s+")([^"]+)(")',
            "installer.iss → #define MyAppVersion",
        ),
        (
            os.path.join(root, "flask", "adb", "config.py"),
            r'(APP_VERSION\s*=\s*")([^"]+)(")',
            "config.py → APP_VERSION",
        ),
        (
            os.path.join(root, "js", "core", "config.js"),
            r'(const\s+FRONTEND_VERSION\s*=\s*")([^"]+)(")',
            "config.js → FRONTEND_VERSION",
        ),
    ]
    ok = 0
    for file_path, pattern, label in replacements:
        if not os.path.isfile(file_path):
            print(f"  [SKIP] {label}")
            continue
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        match = re.search(pattern, content)
        if not match:
            print(f"  [WARN] 未匹配: {label}")
            continue
        old_ver = match.group(2)
        if old_ver == new_version:
            print(f"  [OK]   {label}  已是 {new_version}")
            ok += 1
            continue
        new_content = re.sub(pattern, rf'\g<1>{new_version}\g<3>', content)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"  [OK]   {label}  {old_ver} → {new_version}")
        ok += 1
    return ok

def main():
    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)
    print(f"Dir: {root}\n")

    # Step 0: 版本号更新
    current_ver = get_current_version(root)
    print("=" * 50)
    print(f"  当前版本: {current_ver}")
    print("=" * 50)
    ver_input = input("请输入新版本号（直接回车跳过，保持当前版本）: ").strip()

    if ver_input:
        if not re.match(r'^\d+\.\d+\.\d+$', ver_input):
            print(f"\n[ERROR] 版本号格式不正确: {ver_input}，请使用 x.y.z 格式")
            input("Press Enter to exit...")
            return 1
        print(f"\n更新版本号: {current_ver} → {ver_input}\n")
        update_version(root, ver_input)
        print()
    else:
        print(f"  保持当前版本: {current_ver}\n")

    # Step 1: PyInstaller
    print("=" * 40)
    print("  Step 1: PyInstaller")
    print("=" * 40 + "\n")

    if not os.path.exists("index.html"):
        print("[ERROR] index.html not found!")
        input("Press Enter to exit...")
        return 1

    icon_arg = ""
    if os.path.exists("app.ico"):
        print("Found app.ico")
        icon_arg = f'--icon="{os.path.join(root, "app.ico")}"'
    else:
        print("Warning: app.ico not found, using default icon.")

    try:
        import pyinstaller
    except ImportError:
        print("Installing PyInstaller from Tsinghua mirror...")
        if not run(f'{sys.executable} -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple pyinstaller'):
            print("PyInstaller install failed!")
            input("Press Enter to exit...")
            return 1
    print("PyInstaller OK\n")

    adb_dir = os.path.join(root, "flask", "adb")
    if not os.path.isdir(adb_dir):
        print(f"[ERROR] {adb_dir} not found!")
        input("Press Enter to exit...")
        return 1

    dist_dir = os.path.join(root, "dist")
    os.makedirs(dist_dir, exist_ok=True)
    print(f"ADB dir: {adb_dir}")
    print(f"Output:  {dist_dir}\n")

    # Collect --add-data
    add_data = []
    for item, label in [
        (os.path.join(adb_dir, "adb.exe"), "adb.exe"),
        (os.path.join(adb_dir, "AdbWinApi.dll"), "AdbWinApi.dll"),
        (os.path.join(adb_dir, "AdbWinUsbApi.dll"), "AdbWinUsbApi.dll"),
    ]:
        if os.path.exists(item):
            print(f"Found {label}")
            add_data.append(f'--add-data "{item};."')
        else:
            print(f"Warning: {label} not found")

    flask_root = os.path.join(root, "flask")
    for item, label, required in [
        (os.path.join(flask_root, "JTTools.exe"), "JTTools.exe", True),
        (os.path.join(flask_root, "appsettings.json"), "appsettings.json", False),
        (os.path.join(flask_root, "ffmpeg.exe"), "ffmpeg.exe", False),
        (os.path.join(flask_root, "ffprobe.exe"), "ffprobe.exe", False),
    ]:
        if os.path.exists(item):
            print(f"Found {label}")
            add_data.append(f'--add-data "{item};."')
        elif required:
            print(f"[ERROR] {label} not found!")
            input("Press Enter to exit...")
            return 1
        else:
            print(f"Warning: {label} not found")

    # Static assets (relative paths)
    for name in ["index.html", "css", "js", "img", "lib", "app.ico"]:
        src = os.path.join(root, name)
        if os.path.exists(src):
            if os.path.isfile(src):
                add_data.append(f'--add-data "{name};."')
            else:
                add_data.append(f'--add-data "{name};{name}"')

    add_data_str = " ".join(add_data)
    print(f"\nPackaging...\n")

    pyi_cmd = (
        f'{sys.executable} -m PyInstaller --onefile --windowed '
        f'--name "YUWEITEK工具箱 Agent" {icon_arg} --clean '
        f'--distpath "{dist_dir}" --hidden-import pystray --hidden-import PIL '
        f'{add_data_str} "{os.path.join(adb_dir, "adb_server.py")}"'
    )

    if not run(pyi_cmd):
        print("\n[ERROR] PyInstaller failed!")
        input("Press Enter to exit...")
        return 1

    print(f"\n{'=' * 40}")
    print("  PyInstaller OK!")
    print(f"{'=' * 40}\n")

    # Step 2: Inno Setup
    print("=" * 40)
    print("  Step 2: Inno Setup")
    print("=" * 40 + "\n")

    iscc = None
    for base in [
        os.environ.get("ProgramFiles(x86)", ""),
        os.environ.get("ProgramFiles", ""),
        r"D:\Program Files (x86)",
        r"C:\Program Files (x86)",
        r"D:\Program Files",
        r"C:\Program Files",
    ]:
        candidate = os.path.join(base, "Inno Setup 6", "ISCC.exe")
        if os.path.isfile(candidate):
            iscc = candidate
            break

    if not iscc:
        print("[ERROR] Inno Setup 6 not found!")
        input("Press Enter to exit...")
        return 1

    print(f"Found Inno Setup: {iscc}")
    print("Compiling installer...\n")

    iss_path = os.path.join(root, "installer.iss")
    if not run(f'"{iscc}" "{iss_path}"'):
        print("\n[ERROR] Inno Setup compile failed!")
        input("Press Enter to exit...")
        return 1

    # Cleanup
    print(f"\n{'=' * 40}")
    print("  Cleaning up...")
    print(f"{'=' * 40}")

    tmp_exe = os.path.join(dist_dir, "YUWEITEK工具箱 Agent.exe")
    if os.path.exists(tmp_exe):
        os.remove(tmp_exe)
        print("Deleted temp EXE")
    else:
        print("Temp EXE not found, skip.")

    app_version = get_current_version(root)
    setup_name = f"YUWEITEK工具箱 Agent_{app_version}_Setup.exe"
    print(f"\n{'=' * 40}")
    print("  All done!")
    print(f"{'=' * 40}")
    print(f"  Installer: {os.path.join(root, setup_name)}")
    print(f"{'=' * 40}")
    input("Press Enter to exit...")
    return 0

if __name__ == "__main__":
    sys.exit(main())
