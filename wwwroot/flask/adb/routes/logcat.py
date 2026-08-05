# -*- coding: utf-8 -*-
"""
日志采集 API：启动、停止、状态查询、打开文件夹
"""

from flask import Blueprint, request, jsonify
import subprocess
import os
import sys
import time
import atexit
from config import ADB_PATH, LOG_DIR, USER_DATA_DIR
from services.license import is_licensed
from state import current_logcat_process, current_logcat_device, current_logcat_file

logcat_bp = Blueprint('logcat', __name__)

@logcat_bp.route('/logcat/start', methods=['POST'])
def logcat_start():
    """启动 logcat 日志采集"""
    if not is_licensed():
        return jsonify({'error': '未授权，请先激活'}), 401
    global current_logcat_process, current_logcat_device, current_logcat_file

    if current_logcat_process and current_logcat_process.poll() is None:
        return jsonify({'error': '已有日志采集任务正在运行，请先停止'}), 400

    data = request.get_json()
    device = data.get('device')
    if not device:
        return jsonify({'error': '缺少 device 参数'}), 400
    # 需要获取设备列表的函数，可以临时导入或从 adb 模块调用，这里简单写一个内部函数
    # 为避免循环导入，直接调用 adb 模块中的 get_devices，但可能会导致循环依赖。
    # 因此在此处重新实现一个简单的设备检测（或者从 services.adb_client 导入，但 services 尚未完成）
    # 简化：使用 subprocess 直接调用 ADB 检查设备是否存在
    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
    try:
        result = subprocess.run([ADB_PATH, 'devices'], capture_output=True, timeout=5, startupinfo=startupinfo)
        stdout = result.stdout.decode('utf-8', errors='replace')
        lines = stdout.strip().split('\n')
        devices = []
        for line in lines[1:]:
            if '\tdevice' in line:
                devices.append(line.split('\t')[0])
        if device not in devices:
            return jsonify({'error': '设备未连接或序列号错误'}), 400
    except Exception:
        return jsonify({'error': '无法获取设备列表'}), 500

    # 处理文件名
    filename_input = data.get('filename', '').strip()
    if filename_input:
        # 判断是否为目录（以路径分隔符结尾）
        if filename_input.endswith(os.path.sep) or filename_input.endswith('/'):
            # 意图是目录，在该目录下生成默认文件名
            dir_path = os.path.abspath(filename_input)
            try:
                os.makedirs(dir_path, exist_ok=True)
            except Exception as e:
                return jsonify({'error': f'无法创建目录 {dir_path}: {str(e)}'}), 400
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"logcat_{device}_{timestamp}.txt"
            filepath = os.path.join(dir_path, filename)
        else:
            # 作为文件路径处理
            filepath = os.path.abspath(filename_input)
            dirname = os.path.dirname(filepath)
            if dirname and not os.path.exists(dirname):
                try:
                    os.makedirs(dirname, exist_ok=True)
                except Exception as e:
                    return jsonify({'error': f'无法创建目录 {dirname}: {str(e)}'}), 400
    else:
        # 默认保存到 LOG_DIR
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"logcat_{device}_{timestamp}.txt"
        filepath = os.path.join(LOG_DIR, filename)

    # 确保文件所在目录存在（再次确认）
    dir_path = os.path.dirname(filepath)
    try:
        os.makedirs(dir_path, exist_ok=True)
    except Exception as e:
        return jsonify({'error': f'无法创建日志目录 {dir_path}: {str(e)}'}), 500

    # 启动 logcat 进程
    cmd = [ADB_PATH, '-s', device, 'logcat']
    try:
        f = open(filepath, 'wb')
        process = subprocess.Popen(
            cmd,
            stdout=f,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        )
        current_logcat_process = process
        current_logcat_device = device
        current_logcat_file = filepath
        atexit.register(lambda p=process: p.terminate() if p.poll() is None else None)

        return jsonify({
            'message': '日志采集已启动',
            'file': os.path.basename(filepath),
            'path': filepath,
            'pid': process.pid
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@logcat_bp.route('/logcat/stop', methods=['POST'])
def logcat_stop():
    """停止当前日志采集，支持重命名日志文件"""
    if not is_licensed():
        return jsonify({'error': '未授权，请先激活'}), 401
    global current_logcat_process, current_logcat_device, current_logcat_file

    if current_logcat_process is None or current_logcat_process.poll() is not None:
        return jsonify({'error': '没有正在运行的日志采集任务'}), 400

    data = request.get_json() or {}
    new_filename = data.get('new_filename', '').strip()

    try:
        current_logcat_process.terminate()
        try:
            current_logcat_process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            current_logcat_process.kill()
            current_logcat_process.wait()

        if current_logcat_process.stdout:
            current_logcat_process.stdout.close()

        # 处理重命名
        final_path = current_logcat_file
        if new_filename and current_logcat_file:
            dir_path = os.path.dirname(current_logcat_file)
            # 如果新文件名不包含扩展名，保留原扩展名
            old_ext = os.path.splitext(current_logcat_file)[1]
            if not os.path.splitext(new_filename)[1]:
                new_filename = new_filename + old_ext
            new_path = os.path.join(dir_path, new_filename)
            try:
                if os.path.exists(current_logcat_file):
                    os.rename(current_logcat_file, new_path)
                    final_path = new_path
            except OSError as e:
                # 重命名失败不影响停止流程，仅记录
                pass

        result = {
            'message': '日志采集已停止',
            'file': os.path.basename(final_path) if final_path else None,
            'path': final_path
        }
        current_logcat_process = None
        current_logcat_device = None
        current_logcat_file = None
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@logcat_bp.route('/logcat/status', methods=['GET'])
def logcat_status():
    """查询日志采集状态"""
    if not is_licensed():
        return jsonify({'running': False, 'error': '未授权'}), 401
    if current_logcat_process and current_logcat_process.poll() is None:
        return jsonify({
            'running': True,
            'device': current_logcat_device,
            'file': os.path.basename(current_logcat_file) if current_logcat_file else None
        })
    else:
        return jsonify({'running': False})

@logcat_bp.route('/open_folder', methods=['POST'])
def open_folder():
    """打开指定文件夹（客户端）"""
    if not is_licensed():
        return jsonify({'error': '未授权，请先激活'}), 401
    data = request.get_json()
    path = data.get('path', '').strip()

    if not path:
        # 默认打开用户数据目录下的 log 文件夹（如果存在），否则打开用户数据目录
        if os.path.exists(LOG_DIR):
            path = LOG_DIR
        else:
            path = USER_DATA_DIR

    # 处理环境变量和用户主目录
    path = os.path.expandvars(path)
    path = os.path.expanduser(path)
    path = os.path.abspath(path)

    if not os.path.exists(path):
        return jsonify({'error': f'路径不存在：{path}'}), 400
    if os.path.isfile(path):
        path = os.path.dirname(path)
    if not os.path.isdir(path):
        return jsonify({'error': f'不是有效的文件夹：{path}'}), 400

    try:
        if sys.platform == 'win32':
            os.startfile(path)
        elif sys.platform == 'darwin':
            subprocess.run(['open', path])
        else:
            subprocess.run(['xdg-open', path])
        return jsonify({'message': f'已打开文件夹：{path}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500