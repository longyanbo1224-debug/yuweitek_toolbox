# -*- coding: utf-8 -*-
"""
.NET 后端管理：启动、停止 JTTools.exe
"""

import subprocess
import os
import sys
from config import LOG_DIR
from state import dotnet_process

def start_dotnet_backend():
    global dotnet_process
    if sys.platform == 'win32':
        # 清理上次异常退出遗留的 JTTools，避免 18889 端口被占用导致新实例绑定失败
        subprocess.run('taskkill /F /IM JTTools.exe', shell=True, capture_output=True, timeout=5)
    if getattr(sys, 'frozen', False):
        base_dir = sys._MEIPASS
    else:
        # 开发环境：当前文件位于 flask/adb/services，需要向上取两级到 flask 根目录
        script_dir = os.path.dirname(os.path.abspath(__file__))
        base_dir = os.path.dirname(os.path.dirname(script_dir))   # flask 根目录
    
    dotnet_exe = os.path.join(base_dir, 'JTTools.exe')
    if not os.path.exists(dotnet_exe):
        print(f"错误：未找到 {dotnet_exe}，交通协议解析功能将不可用")
        return
    
    config_file = os.path.join(base_dir, 'appsettings.json')
    if os.path.exists(config_file):
        print(f"找到配置文件: {config_file}")
    else:
        print(f"警告：配置文件 {config_file} 不存在，.NET 后端将使用默认端口 5000")
    
    # 构建命令，强制指定端口（确保 --urls 参数正确传递）
    cmd = [dotnet_exe, "--urls", "http://127.0.0.1:18889"]
    print(f"启动命令: {' '.join(cmd)}")
    
    # 隐藏窗口启动子进程
    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE

    # 将输出写入日志文件
    log_file = open(os.path.join(LOG_DIR, 'dotnet.log'), 'w')
    dotnet_process = subprocess.Popen(
        cmd,
        startupinfo=startupinfo,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        cwd=base_dir
    )
    # 保存文件句柄引用，以便退出时关闭
    dotnet_process._log_file = log_file
    print(f".NET 后端已启动，PID: {dotnet_process.pid}，日志：{log_file.name}")

def cleanup_dotnet():
    """程序退出时关闭 .NET 子进程及其子进程树"""
    global dotnet_process
    if dotnet_process and dotnet_process.poll() is None:
        print("正在关闭 .NET 后端...")
        try:
            # 用 taskkill /T /F 杀掉整个进程树，防止子进程锁定 _MEIPASS 文件
            subprocess.run(
                f'taskkill /T /F /PID {dotnet_process.pid}',
                shell=True, capture_output=True, timeout=5
            )
        except Exception:
            dotnet_process.terminate()
        try:
            dotnet_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            dotnet_process.kill()
    # 关闭日志文件句柄（防止占用 _MEIPASS 临时目录导致删除失败）
    if dotnet_process and hasattr(dotnet_process, '_log_file'):
        try:
            dotnet_process._log_file.close()
        except Exception:
            pass
