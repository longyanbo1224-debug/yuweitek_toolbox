# -*- coding: utf-8 -*-
"""
路由蓝图注册
"""

from .adb import adb_bp
from .video import video_bp
from .ai import ai_bp
from .license import license_bp
from .logcat import logcat_bp
from .static import static_bp
from .jtt import jtt_bp   # 新增

def register_blueprints(app):
    """注册所有蓝图"""
    app.register_blueprint(adb_bp, url_prefix='/api')
    app.register_blueprint(video_bp, url_prefix='/api')
    app.register_blueprint(ai_bp, url_prefix='/api')
    app.register_blueprint(license_bp, url_prefix='/api')
    app.register_blueprint(logcat_bp, url_prefix='/api')
    app.register_blueprint(static_bp)  # 无前缀
    app.register_blueprint(jtt_bp)     # 无前缀，因为路由本身包含 /jtt