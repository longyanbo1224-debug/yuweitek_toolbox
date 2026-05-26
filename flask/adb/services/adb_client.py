# -*- coding: utf-8 -*-
"""
ADB 客户端：设备列表、命令执行、命令持久化
"""

import subprocess
import json
import os
import sys
import shutil
from config import COMMANDS_FILE, ADB_PATH, ADB_EXISTS

def get_adb_path():
    """智能查找 adb 可执行文件路径"""
    if getattr(sys, 'frozen', False):
        base_dir = sys._MEIPASS  # PyInstaller 打包后的临时目录
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    possible_paths = [
        os.path.join(base_dir, 'adb.exe'),
        os.path.join(base_dir, 'adb', 'adb.exe'),
        os.path.join(base_dir, 'platform-tools', 'adb.exe'),
    ]
    for p in possible_paths:
        if os.path.isfile(p):
            return p
    adb = shutil.which('adb')
    if adb:
        return adb
    return None

# 初始化 ADB_PATH 和 ADB_EXISTS（在模块加载时执行）
ADB_PATH = get_adb_path()
if ADB_PATH:
    print(f"使用 adb 路径：{ADB_PATH}")
else:
    print("警告：未找到 adb 可执行文件，设备检测将不可用")
ADB_EXISTS = ADB_PATH is not None and os.path.isfile(ADB_PATH)

def load_commands():
    """加载已保存的命令列表"""
    if os.path.exists(COMMANDS_FILE):
        with open(COMMANDS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_commands(commands):
    """保存命令列表到文件"""
    with open(COMMANDS_FILE, 'w', encoding='utf-8') as f:
        json.dump(commands, f, indent=2, ensure_ascii=False)

def get_devices():
    if not ADB_EXISTS:
        return []
    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
    try:
        result = subprocess.run([ADB_PATH, 'devices'], capture_output=True, timeout=5, startupinfo=startupinfo)
        stdout = result.stdout.decode('utf-8', errors='replace')
    except Exception:
        return []
    lines = stdout.strip().split('\n')
    devices = []
    for line in lines[1:]:
        if '\tdevice' in line:
            devices.append(line.split('\t')[0])
    return devices

def send_adb_command(device, cmd_text):
    """发送 ADB 命令并返回结果"""
    # 移除可能的 "adb " 前缀
    if cmd_text.startswith('adb '):
        cmd_text = cmd_text[4:]
    if not cmd_text.strip():
        return {'error': '命令不能为空，请提供有效的 adb 子命令'}, 400
    if cmd_text.strip() == 'shell':
        return {'error': '不支持纯 shell 交互命令，请添加具体指令'}, 400

    # 创建隐藏窗口的 startupinfo
    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE

    full_cmd_str = f'"{ADB_PATH}" -s {device} {cmd_text}'
    try:
        result = subprocess.run(full_cmd_str, shell=True, capture_output=True, text=True, timeout=30, startupinfo=startupinfo)
        return {
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        }, 200
    except subprocess.TimeoutExpired:
        return {'error': '命令执行超时'}, 500
    except Exception as e:
        return {'error': str(e)}, 500