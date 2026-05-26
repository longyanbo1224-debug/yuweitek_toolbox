# -*- coding: utf-8 -*-
"""
授权验证：硬件ID、授权码验证、保存
"""

import os
import base64
from datetime import datetime
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend
from config import PUBLIC_KEY_PEM, LICENSE_FILE, ENABLE_LICENSE
from utils import get_hardware_id, get_hardware_id_legacy

def verify_license_code(machine_code, license_code):
    """验证授权码，返回 (是否有效, 错误信息, 有效期截止日期字符串或None)"""
    try:
        public_key = serialization.load_pem_public_key(PUBLIC_KEY_PEM.encode(), backend=default_backend())
        if ':' not in license_code:
            # 旧格式：只有签名（永久授权）
            try:
                signature = base64.b64decode(license_code)
            except Exception:
                return False, "授权码格式错误，请检查输入", None
            public_key.verify(signature, machine_code.encode(), padding.PKCS1v15(), hashes.SHA256())
            return True, "授权有效（永久）", None
        else:
            data_b64, sig_b64 = license_code.split(':', 1)
            try:
                data = base64.b64decode(data_b64).decode()
                sig = base64.b64decode(sig_b64)
            except Exception:
                return False, "授权码格式错误，请检查输入", None
            public_key.verify(sig, data.encode(), padding.PKCS1v15(), hashes.SHA256())
            parts = data.split('|')
            if len(parts) != 2:
                return False, "授权码格式错误", None
            stored_machine, expire_str = parts
            if stored_machine != machine_code:
                return False, "机器码不匹配，请确认授权码是否正确", None
            if expire_str:
                expire_date = datetime.strptime(expire_str, "%Y-%m-%d")
                if datetime.now() > expire_date:
                    return False, f"授权已过期（过期日期 {expire_str}）", expire_str
            return True, "授权有效", expire_str
    except Exception as e:
        return False, f"授权码无效: {str(e)}", None

def save_license_status(license_code):
    with open(LICENSE_FILE, 'w') as f:
        f.write(license_code)

def is_licensed():
    if not ENABLE_LICENSE:
        return True
    if not os.path.exists(LICENSE_FILE):
        return False
    with open(LICENSE_FILE, 'r') as f:
        license_code = f.read().strip()

    # 优先使用新版机器码（排除U盘影响）
    machine_code = get_hardware_id()
    valid, msg, _ = verify_license_code(machine_code, license_code)
    if valid:
        return True

    # 兼容旧版机器码（已授权用户用旧算法激活的情况）
    legacy_code = get_hardware_id_legacy()
    if legacy_code != machine_code:
        valid, msg, _ = verify_license_code(legacy_code, license_code)
        if valid:
            return True

    return False