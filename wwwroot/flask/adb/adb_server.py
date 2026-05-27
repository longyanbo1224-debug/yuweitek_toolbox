# -*- coding: utf-8 -*-
"""
ADB 调试工具后端服务（入口文件）
启动 Flask 应用、后台服务、打开浏览器、系统托盘
"""

import sys
import requests
import os
import ctypes
import webbrowser
from threading import Timer, Thread
import time
import atexit
import signal
import shutil

# 添加当前目录到路径，确保能导入模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ========== 单实例检查 + 浏览器窗口复用（必须在其他 import 之前执行） ==========
_MUTEX_NAME = "Global\\YUWEITEK_Toolbox_Agent_Mutex"
_mutex_handle = None

def check_single_instance():
    """使用 Windows Named Mutex 检测是否已有实例在运行，返回 True 表示可以继续启动"""
    global _mutex_handle
    if sys.platform != 'win32':
        return True
    kernel32 = ctypes.windll.kernel32
    ERROR_ALREADY_EXISTS = 183
    _mutex_handle = kernel32.CreateMutexW(None, True, _MUTEX_NAME)
    if kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
        return False
    return True

def release_mutex():
    """释放互斥锁"""
    global _mutex_handle
    if _mutex_handle:
        ctypes.windll.kernel32.ReleaseMutex(_mutex_handle)
        ctypes.windll.kernel32.CloseHandle(_mutex_handle)
        _mutex_handle = None

def open_or_focus_browser(url):
    """查找已存在的浏览器标签页并聚焦，找不到则在已有浏览器窗口中打开新标签页"""
    import subprocess
    user32 = ctypes.windll.user32
    user32.EnumWindows.restype = ctypes.c_bool

    keywords = ['YUWEITEK', 'localhost:5000', '127.0.0.1:5000']
    browser_names = ['chrome', 'msedge', 'firefox', 'browser', 'iexplore', 'opera']

    found_hwnd = [None]

    @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)
    def enum_callback(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = buf.value
        if any(k in title for k in keywords):
            found_hwnd[0] = hwnd
        return True

    user32.EnumWindows(enum_callback, 0)

    # 场景1：找到了我们的程序标签页 → 聚焦该窗口
    if found_hwnd[0]:
        user32.ShowWindow(found_hwnd[0], 9)   # SW_RESTORE
        user32.SetForegroundWindow(found_hwnd[0])
        print("已找到现有标签页，正在聚焦...")
        return

    # 场景2：从注册表获取默认浏览器命令，直接调用浏览器 exe 打开 URL（必复用已有窗口）
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                r'Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice') as key:
            prog_id = winreg.QueryValueEx(key, 'ProgId')[0]
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, rf'{prog_id}\shell\open\command') as key:
            cmd = winreg.QueryValueEx(key, '')[0]
        # cmd 示例: "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --single-argument %1
        cmd = cmd.replace('%1', url).replace('"%1"', f'"{url}"')
        subprocess.Popen(cmd, shell=False)
        print("通过默认浏览器打开标签页...")
        return
    except Exception as e:
        print(f"获取默认浏览器失败: {e}")

    # 场景3：兜底
    webbrowser.open(url)
    print("正在启动浏览器...")

if __name__ == '__main__':
    if not check_single_instance():
        # 已有实例运行，查找并聚焦已有标签页
        print("程序已在运行...")
        open_or_focus_browser('http://localhost:5000')
        sys.exit(0)
    atexit.register(release_mutex)
# ============================================================

from app import create_app
from services.dotnet import start_dotnet_backend, cleanup_dotnet
from services.openclaw import start_openclaw, stop_openclaw
from tray import create_tray_icon

app = create_app()


def force_cleanup_children():
    """强制清理所有子进程并等待句柄释放"""
    print("正在清理子进程...")
    cleanup_dotnet()
    stop_openclaw()
    # 等待 OS 完全释放文件句柄，防止 PyInstaller 删除 _MEIPASS 时报 Warning
    time.sleep(0.5)


def cleanup_meipass():
    """手动清理 PyInstaller _MEIPASS 临时目录（带重试）"""
    if not getattr(sys, 'frozen', False):
        return
    meipass = os.environ.get('_MEIPASS', getattr(sys, '_MEIPASS', ''))
    if not meipass or not os.path.isdir(meipass):
        return
    for attempt in range(3):
        try:
            shutil.rmtree(meipass, ignore_errors=False)
            print(f"已清理临时目录: {meipass}")
            return
        except (PermissionError, OSError):
            if attempt < 2:
                time.sleep(1)
    # 静默忽略：剩余文件句柄会在进程完全退出后由 OS 释放


if __name__ == '__main__':
    # ========== 1. 先注册退出清理（确保托盘关闭时也能清理子进程） ==========
    atexit.register(cleanup_dotnet)
    atexit.register(stop_openclaw)
    signal.signal(signal.SIGTERM, lambda signum, frame: (cleanup_dotnet(), stop_openclaw()))

    # ========== 2. 并行启动 .NET 和 OpenClaw ==========
    def start_background_services():
        start_dotnet_backend()
        start_openclaw()
    service_thread = Thread(target=start_background_services, daemon=True)
    service_thread.start()

    port = int(os.environ.get('PORT', 5000))
    print(f"启动服务，访问 http://localhost:{port}")

    # 在后台线程中运行 Flask
    flask_thread = Thread(target=app.run, kwargs={'host': '127.0.0.1', 'port': port, 'debug': False, 'use_reloader': False})
    flask_thread.daemon = True
    flask_thread.start()

    # 动态检测 Flask 是否就绪
    max_wait = 3.0
    start_time = time.time()
    while time.time() - start_time < max_wait:
        try:
            requests.get(f'http://127.0.0.1:{port}', timeout=0.5)
            print("Flask 已就绪")
            break
        except:
            time.sleep(0.1)
    else:
        print("警告：Flask 启动超时，继续尝试打开窗口")

    # 打开浏览器（复用已有窗口或聚焦已有标签页）
    def open_browser_delayed():
        open_or_focus_browser(f'http://127.0.0.1:{port}')
    Timer(1, open_browser_delayed).start()

    # ========== 3. 最后创建系统托盘（会阻塞主线程） ==========
    create_tray_icon()

    # ========== 4. 托盘退出后，显式清理子进程 ==========
    # 不依赖 atexit（LIFO 顺序不可控），在主线程直接清理
    force_cleanup_children()
    cleanup_meipass()