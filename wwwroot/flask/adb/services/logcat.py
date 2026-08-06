# -*- coding: utf-8 -*-
"""
日志采集服务：管理 logcat 进程，支持关键字过滤
"""

import subprocess
import os
import time
import threading
import atexit
from config import LOG_DIR, ADB_PATH
from state import current_logcat_process, current_logcat_device, current_logcat_file
from state import current_logcat_keywords, current_logcat_reader_thread


def _filter_writer(process, filepath, keywords):
    """在后台线程中读取 logcat 输出，按关键字过滤后写入文件"""
    global current_logcat_process
    try:
        with open(filepath, 'ab') as f:
            for line in iter(process.stdout.readline, b''):
                if not line:
                    break
                if keywords:
                    try:
                        line_str = line.decode('utf-8', errors='replace')
                        if any(kw in line_str for kw in keywords):
                            f.write(line)
                            f.flush()
                    except Exception:
                        # 解码失败时直接写入（保守策略，不丢失数据）
                        f.write(line)
                        f.flush()
                else:
                    f.write(line)
                    f.flush()
    except (ValueError, OSError, IOError):
        # 管道关闭或文件写入失败，静默退出
        pass
    except Exception:
        pass


def start_logcat(device, filename_input="", keywords=None):
    """启动 logcat 日志采集，返回 (success, message, filepath)

    Args:
        device: ADB 设备序列号
        filename_input: 用户输入的文件名或目录路径
        keywords: 过滤关键字列表，如 ['7e0200', '7e0002']，为 None 或空列表时不过滤
    """
    global current_logcat_process, current_logcat_device, current_logcat_file
    global current_logcat_keywords, current_logcat_reader_thread

    if current_logcat_process and current_logcat_process.poll() is None:
        return False, "已有日志采集任务正在运行，请先停止", None

    # 规范化关键字：去重、去空、保持顺序
    if keywords:
        seen = set()
        clean_keywords = []
        for kw in keywords:
            kw = kw.strip()
            if kw and kw not in seen:
                clean_keywords.append(kw)
                seen.add(kw)
        keywords = clean_keywords if clean_keywords else None

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
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

        if keywords:
            # 关键字过滤模式：使用管道读取，在 Python 中过滤后写入文件
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                creationflags=creationflags
            )
            # 先创建空文件
            with open(filepath, 'wb') as _:
                pass
            # 启动后台过滤写入线程
            reader_thread = threading.Thread(
                target=_filter_writer,
                args=(process, filepath, keywords),
                daemon=True
            )
            reader_thread.start()
            current_logcat_reader_thread = reader_thread
        else:
            # 无关键字：直接写入文件（保持原有行为）
            f = open(filepath, 'wb')
            process = subprocess.Popen(
                cmd,
                stdout=f,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                creationflags=creationflags
            )
            current_logcat_reader_thread = None

        current_logcat_process = process
        current_logcat_device = device
        current_logcat_file = filepath
        current_logcat_keywords = keywords
        atexit.register(lambda p=process: p.terminate() if p.poll() is None else None)

        return True, "日志采集已启动", filepath
    except Exception as e:
        return False, str(e), None


def stop_logcat():
    """停止当前日志采集，返回 (success, message, filepath)"""
    global current_logcat_process, current_logcat_device, current_logcat_file
    global current_logcat_keywords, current_logcat_reader_thread

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
        current_logcat_keywords = None
        current_logcat_reader_thread = None
        return True, "日志采集已停止", filepath
    except Exception as e:
        return False, str(e), None


def get_logcat_status():
    """获取当前日志采集状态"""
    if current_logcat_process and current_logcat_process.poll() is None:
        return {
            'running': True,
            'device': current_logcat_device,
            'file': os.path.basename(current_logcat_file) if current_logcat_file else None,
            'keywords': current_logcat_keywords
        }
    else:
        return {'running': False}
