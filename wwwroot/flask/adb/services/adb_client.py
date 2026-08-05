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

def send_adb_command(device, cmd_text, auto_shell=True):
    """发送 ADB 命令并返回结果（支持多命令字符串，用 ; 或 && 或换行分隔）
    auto_shell: 是否自动为命令添加 shell 前缀"""
    if auto_shell is None:
        auto_shell = True
    import re

    # 已知的 adb 自身子命令（不需要 shell 前缀，直接由 adb 处理）
    _ADB_DIRECT = {'push', 'pull', 'install', 'uninstall', 'reboot', 'root', 'remount',
                   'sync', 'forward', 'reverse', 'usb', 'tcpip', 'connect', 'disconnect',
                   'exec-in', 'exec-out', 'devices', 'kill-server', 'start-server', 'help',
                   'version', 'wait-for-device', 'get-state', 'get-serialno', 'logcat',
                   'emu', 'backup', 'restore', 'bugreport', 'jdwp', 'ppp', 'shell'}

    stripped_cmd = cmd_text.strip()

    # 检测是否为完整的 "adb ... shell ..." 命令（用户自己拼好了 adb shell）
    # 但如果字符串中还包含 ";adb "（混合了其他 adb 子命令如 push/reboot），
    # 则不能整体执行，需要拆分后逐个处理
    is_adb_shell = bool(re.match(r'^adb\s+(?:-s\s+\S+\s+)?shell\s+', stripped_cmd, re.IGNORECASE))
    has_mixed_adb = bool(re.search(r';\s*adb\s+', stripped_cmd, re.IGNORECASE))

    # 创建隐藏窗口的 startupinfo
    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE

    if is_adb_shell and not has_mixed_adb:
        # 纯 adb shell 命令 → 不拆分，整体作为一个 shell 命令执行（保留分号等内部分隔符）
        shell_part = re.sub(r'^adb\s+(?:-s\s+\S+\s+)?shell\s+', '', stripped_cmd, count=1, flags=re.IGNORECASE).strip()
        # 检测 "adb shell push/pull/install/..." → push 是 adb 子命令，不需要 shell
        _first_word = shell_part.strip().split()[0] if shell_part.strip() else ''
        if _first_word in _ADB_DIRECT:
            full_cmd_str = f'"{ADB_PATH}" -s {device} {shell_part}'
        else:
            full_cmd_str = f'"{ADB_PATH}" -s {device} shell {shell_part}'
        try:
            result = subprocess.run(full_cmd_str, shell=True, capture_output=True, timeout=30,
                                    encoding='utf-8', errors='replace', startupinfo=startupinfo)
            return {
                'stdout': result.stdout.strip() if result.stdout else '',
                'stderr': result.stderr.strip() if result.stderr else '',
                'returncode': result.returncode
            }, 200
        except subprocess.TimeoutExpired:
            return {'stdout': '', 'stderr': '[adb shell] 执行超时', 'returncode': 1}, 200
        except Exception as e:
            return {'stdout': '', 'stderr': f'[adb shell] 异常：{str(e)}', 'returncode': 1}, 200

    # 拆分多命令字符串（; && 换行符），逐个执行
    sub_commands = re.split(r'\s*(?:&&|;)\s*|\s*\n+\s*', cmd_text)
    sub_commands = [s.strip() for s in sub_commands if s.strip()]

    all_stdout = []
    all_stderr = []
    final_rc = 0

    for idx, sub_cmd in enumerate(sub_commands):
        # 记录原始命令是否带 "adb " 前缀（用于后续判断是否需要自动添加 shell）
        had_adb_prefix = False
        if sub_cmd.startswith('adb '):
            sub_cmd = sub_cmd[4:]
            had_adb_prefix = True
        if not sub_cmd.strip():
            continue
        if sub_cmd.strip() == 'shell':
            all_stderr.append('[跳过] 不支持纯 shell 交互命令：shell')
            continue

        # 智能处理用户手写的 "adb xxx" 前缀
        if had_adb_prefix:
            stripped = sub_cmd.strip()
            first_word = stripped.split()[0] if stripped else ''

            if first_word == 'shell':
                # 用户写了 "adb shell push/pull/..." → push 是 adb 子命令，去掉多余的 shell
                rest = stripped[len('shell'):].strip()
                second_word = rest.split()[0] if rest else ''
                if second_word in _ADB_DIRECT:
                    sub_cmd = rest
                # 否则 "adb shell mount ..." 是正确的 shell 命令，保持不变
            elif first_word not in _ADB_DIRECT:
                # 用户写了 "adb mount/其他shell命令 ..." → 自动转为 shell 命令
                sub_cmd = 'shell ' + stripped

        # 自动添加 shell 前缀（仅当前端开关开启、原始不带 adb 前缀、
        # 且非 shell/adb/已知adb子命令开头时执行）
        if auto_shell and not had_adb_prefix:
            _first = sub_cmd.strip().split()[0] if sub_cmd.strip() else ''
            if _first not in _ADB_DIRECT and not re.match(r'^(shell|adb)\b', sub_cmd.strip()):
                sub_cmd = 'shell ' + sub_cmd.strip()

        full_cmd_str = f'"{ADB_PATH}" -s {device} {sub_cmd}'
        try:
            result = subprocess.run(full_cmd_str, shell=True, capture_output=True, timeout=30,
                                    encoding='utf-8', errors='replace', startupinfo=startupinfo)
            if result.stdout and result.stdout.strip():
                all_stdout.append(f'[{sub_cmd}]\n{result.stdout.strip()}')
            if result.stderr and result.stderr.strip():
                all_stderr.append(f'[{sub_cmd}]\n{result.stderr.strip()}')
            if result.returncode != 0:
                final_rc = result.returncode
                remaining = len(sub_commands) - idx - 1
                if remaining > 0:
                    all_stderr.append(f'[中断] 上条命令执行失败(返回码:{result.returncode})，已跳过后续 {remaining} 条命令')
                break
        except subprocess.TimeoutExpired:
            all_stderr.append(f'[{sub_cmd}] 执行超时')
            final_rc = 1
            remaining = len(sub_commands) - idx - 1
            if remaining > 0:
                all_stderr.append(f'[中断] 上条命令超时，已跳过后续 {remaining} 条命令')
            break
        except Exception as e:
            all_stderr.append(f'[{sub_cmd}] 异常：{str(e)}')
            final_rc = 1
            remaining = len(sub_commands) - idx - 1
            if remaining > 0:
                all_stderr.append(f'[中断] 上条命令异常，已跳过后续 {remaining} 条命令')
            break

    return {
        'stdout': '\n\n'.join(all_stdout) if all_stdout else '',
        'stderr': '\n\n'.join(all_stderr) if all_stderr else '',
        'returncode': final_rc
    }, 200