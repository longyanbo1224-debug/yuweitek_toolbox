# -*- coding: utf-8 -*-
"""
全局状态变量：存储进程、任务队列等
"""

import threading

# ---------- 全局变量 ----------
dotnet_process = None  # .NET 后端子进程
openclaw_process = None  # OpenClaw 网关进程

# 视频转换异步任务管理
convert_tasks = {}
tasks_lock = threading.Lock()

# 批量转换会话管理
batch_sessions = {}
batch_lock = threading.Lock()

# 日志采集全局变量
current_logcat_process = None
current_logcat_device = None
current_logcat_file = None
current_logcat_keywords = None  # 当前采集使用的关键字列表
current_logcat_reader_thread = None  # 过滤读取线程

# 全局变量，用于在 pywebview 模式下访问托盘图标
tray_icon = None