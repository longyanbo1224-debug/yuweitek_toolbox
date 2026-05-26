# -*- coding: utf-8 -*-
"""
日志采集服务：管理 logcat 进程
"""

import subprocess
import os
import time
import atexit
from config import LOG_DIR, ADB_PATH
from state import current_logcat_process, current_logcat_device, current_logcat_file

def start_logcat(device, filename_input=""):
    """启动 logcat 日志采集，返回 (success, message, filepath)"""
    global current_logcat_process, current_logcat_device, current_logcat_file

    if current_logcat_process and current_logcat_process.poll() is None:
        return False, "已有日志采集任务正在运行，请先停止", None

    # 处理文件名
    if filename_input:
        # 判断是否为目录（以路径分隔符结尾）
        if filename_input.endswith(os.path.sep) or filename_input.endswith('/'):
            dir_path = os.path.abspath(filename_input)
            try:
                os.makedirs(dir_path, exist_ok=True)
            except Exception as e:
                return False, f"无法创建目录 {dir_path}: {str(e)}", None
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"logcat_{device}_{timestamp}.txt"
            filepath = os.path.join(dir_path, filename)
        else:
            filepath = os.path.abspath(filename_input)
            dirname = os.path.dirname(filepath)
            if dirname and not os.path.exists(dirname):
                try:
                    os.makedirs(dirname, exist_ok=True)
                except Exception as e:
                    return False, f"无法创建目录 {dirname}: {str(e)}", None
    else:
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"logcat_{device}_{timestamp}.txt"
        filepath = os.path.join(LOG_DIR, filename)

    # 确保文件所在目录存在
    dir_path = os.path.dirname(filepath)
    try:
        os.makedirs(dir_path, exist_ok=True)
    except Exception as e:
        return False, f"无法创建日志目录 {dir_path}: {str(e)}", None

    # 启动 logcat 进程
    cmd = [ADB_PATH, '-s', device, 'logcat']
    try:
        f = open(filepath, 'wb')
        process = subprocess.Popen(
            cmd,
            stdout=f,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        current_logcat_process = process
        current_logcat_device = device
        current_logcat_file = filepath
        atexit.register(lambda p=process: p.terminate() if p.poll() is None else None)

        return True, "日志采集已启动", filepath
    except Exception as e:
        return False, str(e), None

def stop_logcat():
    """停止当前日志采集，返回 (success, message, filepath)"""
    global current_logcat_process, current_logcat_device, current_logcat_file

    if current_logcat_process is None or current_logcat_process.poll() is not None:
        return False, "没有正在运行的日志采集任务", None

    try:
        current_logcat_process.terminate()
        try:
            current_logcat_process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            current_logcat_process.kill()
            current_logcat_process.wait()

        if current_logcat_process.stdout:
            current_logcat_process.stdout.close()

        filepath = current_logcat_file
        current_logcat_process = None
        current_logcat_device = None
        current_logcat_file = None
        return True, "日志采集已停止", filepath
    except Exception as e:
        return False, str(e), None

def get_logcat_status():
    """获取当前日志采集状态"""
    if current_logcat_process and current_logcat_process.poll() is None:
        return {
            'running': True,
            'device': current_logcat_device,
            'file': os.path.basename(current_logcat_file) if current_logcat_file else None
        }
    else:
        return {'running': False}