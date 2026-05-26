# -*- coding: utf-8 -*-
"""
Flask 应用工厂：创建 app 实例，注册蓝图
"""

from flask import Flask
from flask_cors import CORS
import secrets
from routes import register_blueprints
from config import get_static_dir

def create_app():
    """创建并配置 Flask 应用"""
    app = Flask(__name__, static_folder=get_static_dir(), static_url_path='')
    CORS(app)
    app.secret_key = secrets.token_hex(16)  # 用于 session
    register_blueprints(app)
    return app