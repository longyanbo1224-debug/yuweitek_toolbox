# -*- coding: utf-8 -*-
"""
通用辅助函数：硬件ID、版本比较、更新信息获取、require_version装饰器等
"""

import hashlib
import wmi
import requests
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify
from config import MIN_REQUIRED_VERSION, UPDATE_INFO_URL

# 全局缓存
cached_update_info = None
cache_expire_time = None

def get_hardware_id():
    """获取本机硬件唯一标识（主板序列号 + 系统硬盘序列号，排除U盘等可移动介质）"""
    c = wmi.WMI()
    try:
        motherboard_serial = c.Win32_BaseBoard()[0].SerialNumber.strip()
    except:
        motherboard_serial = "Unknown"
    try:
        # 只取固定硬盘（排除U盘、SD卡、移动硬盘等），按 Index 取系统盘
        fixed_disks = [d for d in c.Win32_DiskDrive()
                       if d.MediaType == 'Fixed hard disk media' and d.SerialNumber]
        if fixed_disks:
            fixed_disks.sort(key=lambda d: int(d.Index) if d.Index else 999)
            disk_serial = fixed_disks[0].SerialNumber.strip()
        else:
            disk_serial = "Unknown"
    except:
        disk_serial = "Unknown"
    raw = f"{motherboard_serial}|{disk_serial}"
    return hashlib.sha256(raw.encode()).hexdigest()

def get_hardware_id_legacy():
    """旧版机器码算法（兼容已授权用户）"""
    c = wmi.WMI()
    try:
        motherboard_serial = c.Win32_BaseBoard()[0].SerialNumber.strip()
    except:
        motherboard_serial = "Unknown"
    try:
        disk_serial = c.Win32_PhysicalMedia()[0].SerialNumber.strip()
    except:
        disk_serial = "Unknown"
    raw = f"{motherboard_serial}|{disk_serial}"
    return hashlib.sha256(raw.encode()).hexdigest()

def compare_versions(v1, v2):
    """比较两个版本号，v1 < v2 返回负数，相等返回0，v1 > v2 返回正数"""
    def normalize(v):
        return [int(x) for x in v.split('.')]
    v1_parts = normalize(v1)
    v2_parts = normalize(v2)
    for i in range(max(len(v1_parts), len(v2_parts))):
        a = v1_parts[i] if i < len(v1_parts) else 0
        b = v2_parts[i] if i < len(v2_parts) else 0
        if a != b:
            return a - b
    return 0

def get_update_info():
    """从远程获取最新版本信息和下载链接，带30分钟缓存，支持多个备用地址"""
    global cached_update_info, cache_expire_time

    if cached_update_info and cache_expire_time and datetime.now() < cache_expire_time:
        return cached_update_info

    # 构建 URL 列表：主 Gitee + 备用1 jsDelivr + 备用2 GitHub raw
    urls_to_try = [UPDATE_INFO_URL]
    try:
        from config import UPDATE_INFO_URL_BACKUP
        urls_to_try.append(UPDATE_INFO_URL_BACKUP)
    except ImportError:
        pass
    # 添加 GitHub raw 直连作为第三备用
    urls_to_try.append("https://raw.githubusercontent.com/longyanbo1224/yuweitek-toolbox/main/update.json")

    for url in urls_to_try:
        try:
            print(f"[更新] 尝试从 {url} 获取...")
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if 'version' in data and 'min_required' in data and 'download_url' in data:
                    cached_update_info = data
                    cache_expire_time = datetime.now() + timedelta(minutes=30)
                    print(f"[更新] 成功从 {url} 获取，远程 min_required={data['min_required']}")
                    return data
                else:
                    print(f"[更新] 数据格式不完整: {url}")
            else:
                print(f"[更新] HTTP {resp.status_code} from {url}")
        except Exception as e:
            print(f"[更新] 请求失败 ({url}): {e}")

    print("[更新] 所有节点失败，无法获取远程信息")
    return None

def require_version(f):
    """装饰器：检查客户端版本是否满足最低要求（优先使用远程 min_required）"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client_version = request.headers.get('X-Client-Version') or request.args.get('client_version')
        if not client_version:
            return jsonify({'error': '缺少客户端版本信息'}), 400

        # 优先从远程获取最低版本要求
        update_info = get_update_info()
        if update_info and 'min_required' in update_info:
            min_required = update_info['min_required']
            print(f"[版本检查] 使用远程 min_required={min_required}")
        else:
            # 远程获取失败，回退到本地配置
            min_required = MIN_REQUIRED_VERSION
            print(f"[版本检查] 使用本地 min_required={min_required}")

        if compare_versions(client_version, min_required) < 0:
            return jsonify({'error': f'请更新到版本 {min_required} 或更高'}), 426
        return f(*args, **kwargs)
    return decorated_function