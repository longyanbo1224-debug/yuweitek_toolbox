# -*- coding: utf-8 -*-
"""
授权相关 API：检查授权、激活、版本信息
"""

from config import MIN_REQUIRED_VERSION
from flask import Blueprint, request, jsonify
import os
from config import LICENSE_FILE, APP_VERSION
from services.license import is_licensed, verify_license_code, save_license_status
from services.license import get_hardware_id
from utils import get_update_info

license_bp = Blueprint('license', __name__)

@license_bp.route('/check_license', methods=['GET'])
def check_license():
    """检查授权状态，未授权时返回机器码"""
    if is_licensed():
        # 读取 license_code 并解析有效期
        with open(LICENSE_FILE, 'r') as f:
            license_code = f.read().strip()
        machine_code = get_hardware_id()
        valid, msg, expire_str = verify_license_code(machine_code, license_code)
        return jsonify({'licensed': True, 'expire': expire_str if expire_str else '永久'})
    else:
        return jsonify({'licensed': False, 'machine_code': get_hardware_id()})

@license_bp.route('/activate', methods=['POST'])
def activate():
    """用户输入授权码激活"""
    data = request.get_json()
    license_code = data.get('license_code', '')
    machine_code = get_hardware_id()
    valid, msg, expire_str = verify_license_code(machine_code, license_code)
    if valid:
        save_license_status(license_code)
        return jsonify({'success': True, 'message': msg, 'expire': expire_str if expire_str else '永久'})
    else:
        return jsonify({'success': False, 'error': msg})

@license_bp.route('/version', methods=['GET'])
def get_version():
    info = get_update_info()
    if info:
        return jsonify({
            'current': APP_VERSION,
            'latest_version': info.get('version'),
            'min_required': info.get('min_required', info.get('version')),
            'changelog': info.get('changelog', '')
        })
    else:
        return jsonify({
            'current': APP_VERSION,
            'latest_version': APP_VERSION,
            'min_required': MIN_REQUIRED_VERSION,
            'changelog': ''
        })