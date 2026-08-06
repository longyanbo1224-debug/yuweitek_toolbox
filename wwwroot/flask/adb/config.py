# -*- coding: utf-8 -*-
"""
配置文件：包含所有常量、路径、版本信息等
"""

import os
import sys
import ctypes
import shutil

# ========== 强制创建 OpenClaw 硬编码目录（需管理员权限） ==========
def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def run_as_admin():
    script = sys.executable
    params = ' '.join(sys.argv[1:])
    ctypes.windll.shell32.ShellExecuteW(None, "runas", script, params, None, 1)
    sys.exit(0)

def create_required_dirs():
    target_dir = r"C:\Users\yw"
    subdirs = [".openclaw", ".openclaw\\workspace", ".openclaw\\agents\\main\\agent"]
    try:
        if not os.path.exists(target_dir):
            os.makedirs(target_dir, exist_ok=True)
            print(f"创建目录: {target_dir}")
        for sub in subdirs:
            path = os.path.join(target_dir, sub)
            if not os.path.exists(path):
                os.makedirs(path, exist_ok=True)
                print(f"创建目录: {path}")
    except Exception as e:
        print(f"创建目录失败: {e}")
        sys.exit(1)

target_path = r"C:\Users\yw"
if not os.path.exists(target_path) and not is_admin():
    print("需要管理员权限来创建必要的目录，正在请求提升权限...")
    run_as_admin()
else:
    create_required_dirs()
# ============================================================

# ---------- 版本控制 ----------
APP_VERSION = "1.3.8"               # 当前程序版本
MIN_REQUIRED_VERSION = "1.2.7"      # 最低支持版本，低于此版本强制更新

# ---------- 更新配置 ----------
# GitHub 仓库信息（用于从 Releases API 获取最新版本）
GITHUB_OWNER = "longyanbo1224"
GITHUB_REPO = "yuweitek-toolbox"
# 更新信息源（可精确控制 min_required 和 changelog）
# 主源：Gitee（国内访问快）
UPDATE_INFO_URL = "https://gitee.com/loong1224/yuweitek-toolbox---update/raw/master/update.json"
# 备用：GitHub CDN（jsDelivr）
UPDATE_INFO_URL_BACKUP = "https://cdn.jsdelivr.net/gh/longyanbo1224/yuweitek-toolbox@main/update.json"

# ---------- 授权开关 ----------
# 设置环境变量 DISABLE_LICENSE=1 可关闭授权验证（仅用于开发调试）
ENABLE_LICENSE = os.environ.get('ENABLE_LICENSE', 'true').lower() == 'true'
if not ENABLE_LICENSE:
    print("⚠️ 警告：授权验证已关闭，所有功能将不受限制（仅用于开发调试）")

# 内置公钥（由开发者生成，与私钥配对）
PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtK98BSNCpeHzADnSjJWP
ZqSOGY8tkj9rREkt5QR/vVHBNSiKmEj4S8GR8gSd6aZ/f7t5yGXwNRd40OzR6kuA
ZYVXxXpsEhLVwl5bRJbcnJ98M8g6SRGaw6jWdwN2B1HV39PWTBlvkA1hyzk6GQQq
W+TLKI6abyKUMfQlTfxiDrup7rn+3VoSNm2wrFYN2K1a80n0DdYZfC3dPpWot+ju
/D02PhJTyc5fnyCzJUAvvsDujLWILuRGOxejjdqL+PosfwwIGhQuMjCjF5Iq+4+X
S3nulFlamTjzR5MXTA7h5Aev0oCadEOterHPJbDUV2wAyKtTguZT6oBy0PRdnzBT
4QIDAQAB
-----END PUBLIC KEY-----"""

# ---------- 用户数据目录 ----------
def get_user_data_dir():
    """获取用户数据目录（%APPDATA%\YUWEITEK工具箱），并确保存在"""
    if sys.platform == 'win32':
        base_dir = os.environ.get('APPDATA', '')
    else:
        base_dir = os.path.expanduser('~')
    data_dir = os.path.join(base_dir, 'YUWEITEK工具箱')
    os.makedirs(data_dir, exist_ok=True)
    return data_dir

USER_DATA_DIR = get_user_data_dir()
print(f"用户数据目录：{USER_DATA_DIR}")

# 重新定义 LICENSE_FILE 以确保路径正确
LICENSE_FILE = os.path.join(USER_DATA_DIR, 'license.dat')

# 命令存储文件
COMMANDS_FILE = os.path.join(USER_DATA_DIR, 'commands.json')

# 日志存储目录
LOG_DIR = os.path.join(USER_DATA_DIR, 'log')
os.makedirs(LOG_DIR, exist_ok=True)
print(f"日志保存目录：{LOG_DIR}")

# ---------- 静态文件目录 ----------
def get_static_dir():
    """获取静态文件根目录（支持开发环境和打包后）"""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    else:
        # 开发时，静态文件在项目根目录（向上两级）
        return os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    
# ---------- ADB 可执行文件查找 ----------
def get_adb_path():
    """智能查找 adb 可执行文件路径"""
    if getattr(sys, 'frozen', False):
        base_dir = sys._MEIPASS
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

ADB_PATH = get_adb_path()
if ADB_PATH:
    print(f"使用 adb 路径：{ADB_PATH}")
else:
    print("警告：未找到 adb 可执行文件，设备检测将不可用")

ADB_EXISTS = ADB_PATH is not None and os.path.isfile(ADB_PATH)
