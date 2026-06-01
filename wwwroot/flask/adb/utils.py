# -*- coding: utf-8 -*-
"""
通用辅助函数：硬件ID、版本比较、更新信息获取等
"""

import hashlib
import wmi
import requests
from datetime import datetime, timedelta
from config import GITHUB_OWNER, GITHUB_REPO

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

def _parse_version_tag(tag_name):
    """从 tag 名称中提取版本号（去除 v 前缀）"""
    version = tag_name.strip()
    if version.startswith('v') or version.startswith('V'):
        version = version[1:]
    return version


def _fetch_from_github_releases():
    """从 GitHub Releases API 获取最新版本信息"""
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"
    try:
        print(f"[更新] 尝试从 GitHub Releases API 获取...")
        resp = requests.get(url, timeout=10, headers={
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'YUWEITEK-Toolbox'
        })
        if resp.status_code == 200:
            data = resp.json()
            tag_name = data.get('tag_name', '')
            version = _parse_version_tag(tag_name)
            if not version:
                print(f"[更新] 无法解析版本号: {tag_name}")
                return None
            changelog = data.get('body', '') or ''
            # 取前 500 字作为更新日志，避免过长
            if len(changelog) > 500:
                changelog = changelog[:500] + '...'
            result = {
                'version': version,
                'min_required': version,  # 默认与最新版本相同（非强制更新）
                'changelog': changelog,
                'source': 'github_releases'
            }
            print(f"[更新] 成功从 GitHub Releases 获取，最新版本: {version}")
            return result
        else:
            print(f"[更新] GitHub API 返回 HTTP {resp.status_code}")
            return None
    except Exception as e:
        print(f"[更新] GitHub API 请求失败: {e}")
        return None


def _fetch_from_update_json():
    """从 update.json 获取版本信息（Gitee 主源，GitHub CDN 备用）"""
    try:
        from config import UPDATE_INFO_URL, UPDATE_INFO_URL_BACKUP
    except ImportError:
        return None

    urls = [
        (UPDATE_INFO_URL, 'gitee'),
        (UPDATE_INFO_URL_BACKUP, 'github_cdn'),
    ]
    for url, source in urls:
        try:
            print(f"[更新] 尝试从 {source} 获取: {url}")
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if 'version' in data and 'min_required' in data:
                    data.setdefault('changelog', '')
                    data['source'] = f'update_json_{source}'
                    print(f"[更新] 成功从 {source} 获取，版本: {data['version']}")
                    return data
                else:
                    print(f"[更新] {source} update.json 格式不完整")
            else:
                print(f"[更新] {source} 返回 HTTP {resp.status_code}")
        except Exception as e:
            print(f"[更新] {source} 请求失败: {e}")
    return None


def get_update_info():
    """从远程获取最新版本信息，带30分钟缓存。优先 update.json，备用 GitHub Releases API"""
    global cached_update_info, cache_expire_time

    if cached_update_info and cache_expire_time and datetime.now() < cache_expire_time:
        return cached_update_info

    # 优先：update.json（可精确控制 min_required 和 changelog）
    result = _fetch_from_update_json()

    # 备用：GitHub Releases API
    if not result:
        result = _fetch_from_github_releases()

    if result:
        cached_update_info = result
        cache_expire_time = datetime.now() + timedelta(minutes=30)
        return result

    print("[更新] 所有方式均失败，无法获取远程版本信息")
    return None

