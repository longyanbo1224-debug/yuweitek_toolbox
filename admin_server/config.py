# -*- coding: utf-8 -*-
"""
管理后台配置
"""
import os
import secrets

# ========== 基本配置 ==========
HOST = '0.0.0.0'
PORT = 5000

# ========== 安全配置 ==========
# 管理后台访问路径（固定，部署后不要改）
ADMIN_PATH = '/mgr-yt2026'

# 管理员账号（首次运行后请修改密码！）
ADMIN_USERNAME = 'admin'
ADMIN_PASSWORD = 'admin123'  # ⚠️ 请修改为强密码！

# JWT 密钥（用于会话管理，首次运行后不要改，否则已登录的会话失效）
SECRET_KEY = 'yuweitek-license-mgr-secret-key-change-me'

# ========== 数据库配置 ==========
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'licenses.db')

# ========== 授权配置 ==========
# 默认授权有效期（天数），0 表示永久
DEFAULT_LICENSE_DAYS = 365

# 客户端验证间隔（秒），客户端每隔多久向服务器验证一次
VERIFY_INTERVAL = 3600  # 1小时
