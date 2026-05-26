# -*- coding: utf-8 -*-
"""
ADB 调试工具后端服务（入口文件）
启动 Flask 应用、后台服务、打开浏览器、系统托盘
"""

import sys
import requests
import os
import webbrowser
from threading import Timer, Thread
import time
import atexit
import signal

# 添加当前目录到路径，确保能导入模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from services.dotnet import start_dotnet_backend, cleanup_dotnet
from services.openclaw import start_openclaw, stop_openclaw
from tray import create_tray_icon

app = create_app()

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

    # 打开浏览器
    def open_browser_delayed():
        webbrowser.open_new_tab(f'http://127.0.0.1:{port}')
    Timer(1, open_browser_delayed).start()

    # ========== 3. 最后创建系统托盘（会阻塞主线程） ==========
    create_tray_icon()