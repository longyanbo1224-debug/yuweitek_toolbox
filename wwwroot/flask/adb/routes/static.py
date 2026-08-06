# -*- coding: utf-8 -*-
"""
静态文件服务 + 系统辅助路由
"""

from flask import Blueprint, send_from_directory, jsonify, request
import os
import sys
import subprocess
from config import get_static_dir, LOG_DIR, USER_DATA_DIR
from services.license import is_licensed

static_bp = Blueprint('static', __name__)
STATIC_DIR = get_static_dir()

@static_bp.route('/api/health')
def health_check():
    """健康检查接口，供前端轮询判断后端是否就绪"""
    return jsonify({'status': 'ok', 'version': '1.3.8'})

@static_bp.route('/', defaults={'path': ''})
@static_bp.route('/<path:path>')
def serve_static(path):
    """提供静态文件，未匹配文件返回 index.html（前端路由）"""
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    file_path = os.path.join(STATIC_DIR, path)
    if os.path.isfile(file_path):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, 'index.html')

@static_bp.route('/api/open_folder', methods=['POST'])
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
            # 使用 Shell.Application COM 对象打开文件夹，确保窗口在前台显示
            norm_path = os.path.normpath(path)
            subprocess.Popen(
                ['powershell', '-NoProfile', '-Command',
                 f'(New-Object -ComObject Shell.Application).Open("{norm_path}")'],
                creationflags=subprocess.CREATE_NO_WINDOW
            )
        elif sys.platform == 'darwin':
            subprocess.run(['open', path])
        else:
            subprocess.run(['xdg-open', path])
        return jsonify({'message': f'已打开文件夹：{path}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500