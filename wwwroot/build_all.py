# -*- coding: utf-8 -*-
import subprocess, sys, os

def run(cmd, cwd=None):
    print(f"  Exec: {cmd}")
    r = subprocess.run(cmd, shell=True, cwd=cwd)
    if r.returncode != 0:
        print(f"  [ERROR] Failed, return code: {r.returncode}")
        return False
    return True

def main():
    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)
    print(f"Dir: {root}\n")

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

    setup_name = "YUWEITEK工具箱 Agent_1.3.1_Setup.exe"
    print(f"\n{'=' * 40}")
    print("  All done!")
    print(f"{'=' * 40}")
    print(f"  Installer: {os.path.join(root, setup_name)}")
    print(f"{'=' * 40}")
    input("Press Enter to exit...")
    return 0

if __name__ == "__main__":
    sys.exit(main())
