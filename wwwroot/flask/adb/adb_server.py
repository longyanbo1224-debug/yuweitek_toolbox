# -*- coding: utf-8 -*-
"""
ADB 调试工具后端服务（入口文件）
启动 Flask 应用、后台服务、打开浏览器、系统托盘
"""

import sys
import requests
import os
import ctypes
import webbrowser
import shutil
from threading import Timer, Thread
import time
import atexit
import signal
import math

# ========== 抑制 PyInstaller 退出时的 _MEIPASS 临时目录删除警告 ==========
os.environ['PYINSTALLER_SUPPRESS_WARNINGS'] = '1'

# 添加当前目录到路径，确保能导入模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from services.dotnet import start_dotnet_backend, cleanup_dotnet
from services.openclaw import start_openclaw, stop_openclaw
from tray import create_tray_icon


# ========== 启动 Splash 窗口 ==========
def show_splash_screen(splash_ready_callback):
    """
    显示 Tkinter 启动动画窗口。
    在后台线程中轮询 Flask 就绪状态，就绪后通过回调通知关闭 splash。
    """
    try:
        import tkinter as tk
    except ImportError:
        # tkinter 不可用时直接回调跳过
        splash_ready_callback()
        return

    root = tk.Tk()
    root.overrideredirect(True)          # 无边框窗口
    root.attributes('-topmost', True)    # 置顶
    root.configure(bg='#0f172a')

    # ---------- 窗口尺寸与居中 ----------
    win_w, win_h = 460, 340
    screen_w = root.winfo_screenwidth()
    screen_h = root.winfo_screenheight()
    x = (screen_w - win_w) // 2
    y = (screen_h - win_h) // 2
    root.geometry(f'{win_w}x{win_h}+{x}+{y}')

    canvas = tk.Canvas(root, width=win_w, height=win_h,
                       bg='#0f172a', highlightthickness=0)
    canvas.pack()

    # ---------- 圆角矩形背景 ----------
    def rounded_rect(cv, x1, y1, x2, y2, r, **kw):
        points = [
            x1+r, y1, x2-r, y1, x2, y1, x2, y1+r,
            x2, y2-r, x2, y2, x2-r, y2, x1+r, y2,
            x1, y2, x1, y2-r, x1, y1+r, x1, y1
        ]
        return cv.create_polygon(points, smooth=True, **kw)

    rounded_rect(canvas, 8, 8, win_w-8, win_h-8, 24,
                 fill='#1e293b', outline='#334155', width=1)

    # ---------- Logo 圆环动画 ----------
    cx, cy = win_w // 2, 105
    logo_r = 42
    ring_items = []

    def draw_ring(angle_offset):
        for item in ring_items:
            canvas.delete(item)
        ring_items.clear()
        for i in range(12):
            a = math.radians(angle_offset + i * 30)
            alpha = 1.0 - i / 14
            x1 = cx + logo_r * math.cos(a) - 4
            y1 = cy + logo_r * math.sin(a) - 4
            x2 = x1 + 8
            y2 = y1 + 8
            # 从亮蓝渐变到暗蓝
            r_val = int(59 + (130 - 59) * (1 - alpha))
            g_val = int(130 + (200 - 130) * (1 - alpha))
            b_val = int(246 + (246 - 246) * (1 - alpha))
            color = f'#{r_val:02x}{g_val:02x}{b_val:02x}'
            item = canvas.create_oval(x1, y1, x2, y2, fill=color, outline='')
            ring_items.append(item)

    # Logo 中心图标（加载真实 logo 图片）
    logo_img_obj = None
    try:
        from PIL import Image, ImageTk
        if getattr(sys, 'frozen', False):
            logo_base = sys._MEIPASS
        else:
            logo_base = os.path.dirname(os.path.abspath(__file__))
        logo_path = os.path.join(logo_base, 'img', 'favicon.png')
        if os.path.exists(logo_path):
            pil_img = Image.open(logo_path).convert('RGBA').resize((72, 72), Image.LANCZOS)
            logo_img_obj = ImageTk.PhotoImage(pil_img)
            canvas.logo_img_obj = logo_img_obj  # 防止 GC 回收
            canvas.create_image(cx, cy, image=logo_img_obj)
        else:
            raise FileNotFoundError("logo not found")
    except Exception:
        # 回退：用 Canvas 绘制简陋 logo
        canvas.create_rectangle(cx-20, cy-16, cx+20, cy+16,
                                fill='#3b82f6', outline='#60a5fa', width=2)
        canvas.create_arc(cx-10, cy-24, cx+10, cy-8,
                          start=180, extent=180, style='arc',
                          outline='#60a5fa', width=2)

    # ---------- 文字 ----------
    canvas.create_text(cx, 175, text='YUWEITEK工具箱',
                       fill='#f1f5f9', font=('Microsoft YaHei UI', 18, 'bold'))
    canvas.create_text(cx, 205, text='深圳市有为信息技术发展有限公司',
                       fill='#94a3b8', font=('Microsoft YaHei UI', 10))

    # ---------- 进度条 ----------
    bar_x1, bar_y1 = cx - 110, 240
    bar_x2, bar_y2 = cx + 110, 248
    canvas.create_rectangle(bar_x1, bar_y1, bar_x2, bar_y2,
                            fill='#1e293b', outline='#334155', width=1, tags='bar_track')
    bar_fill = canvas.create_rectangle(bar_x1+1, bar_y1+1, bar_x1+1, bar_y2-1,
                                        fill='#3b82f6', outline='', tags='bar_fill')

    # ---------- 状态文字 ----------
    status_text = canvas.create_text(cx, 270, text='正在启动服务...',
                                     fill='#cbd5e1', font=('Microsoft YaHei UI', 9))

    # ---------- 版权 ----------
    canvas.create_text(cx, win_h - 25, text='Powered by YUWEITEK · v1.3.8',
                       fill='#475569', font=('Microsoft YaHei UI', 8))

    # ---------- 动画状态 ----------
    splash_state = {'progress': 0, 'angle': 0, 'alive': True,
                    'flask_ready': False, 'start_time': time.time()}
    MIN_DISPLAY_SECONDS = 3.0  # 最低显示时间，保证动画完整展示

    def animate():
        if not splash_state['alive']:
            return
        # 圆环旋转
        splash_state['angle'] += 6
        draw_ring(splash_state['angle'])

        current = splash_state['progress']

        if splash_state['flask_ready']:
            # Flask 已就绪：检查最低显示时间是否满足
            elapsed = time.time() - splash_state['start_time']
            if elapsed >= MIN_DISPLAY_SECONDS and current >= 98:
                # 时间到且进度接近满 → 关闭 splash
                splash_state['alive'] = False
                try:
                    root.after(0, lambda: (root.destroy(), splash_ready_callback()))
                except Exception:
                    splash_ready_callback()
                return
            elif current < 98:
                # 平滑推进到 100%（每次 +2%，约 1 秒走完剩余）
                splash_state['progress'] = min(current + 2, 100)
                bar_end = bar_x1 + 1 + (bar_x2 - bar_x1 - 2) * splash_state['progress'] / 100
                canvas.coords(bar_fill, bar_x1+1, bar_y1+1, bar_end, bar_y2-1)
                if splash_state['progress'] >= 95:
                    canvas.itemconfigure(status_text, text='启动完成！')
        else:
            # Flask 未就绪：进度条缓慢推进（最多到 80%）
            if current < 80:
                splash_state['progress'] = min(current + 0.5, 80)
                bar_end = bar_x1 + 1 + (bar_x2 - bar_x1 - 2) * splash_state['progress'] / 100
                canvas.coords(bar_fill, bar_x1+1, bar_y1+1, bar_end, bar_y2-1)

        root.after(50, animate)

    animate()

    # ---------- 后台线程轮询 Flask 就绪 ----------
    def poll_flask():
        port = int(os.environ.get('PORT', 5000))
        max_wait = 15.0
        start = time.time()
        while time.time() - start < max_wait and splash_state['alive']:
            try:
                requests.get(f'http://127.0.0.1:{port}/api/health', timeout=0.5)
                break
            except Exception:
                time.sleep(0.2)

        # Flask 就绪 → 通知动画开始收尾，由 animate() 负责关闭
        if splash_state['alive']:
            splash_state['flask_ready'] = True

    poll_thread = Thread(target=poll_flask, daemon=True)
    poll_thread.start()

    # ---------- 窗口拖动支持 ----------
    drag_state = {'x': 0, 'y': 0}

    def on_press(event):
        drag_state['x'] = event.x
        drag_state['y'] = event.y

    def on_drag(event):
        dx = event.x - drag_state['x']
        dy = event.y - drag_state['y']
        new_x = root.winfo_x() + dx
        new_y = root.winfo_y() + dy
        root.geometry(f'+{new_x}+{new_y}')

    canvas.bind('<Button-1>', on_press)
    canvas.bind('<B1-Motion>', on_drag)

    # ---------- 安全关闭 ----------
    def on_splash_close():
        splash_state['alive'] = False
        try:
            root.destroy()
        except Exception:
            pass
        splash_ready_callback()

    root.protocol('WM_DELETE_WINDOW', on_splash_close)
    root.mainloop()

# ========== 单实例检查（防止重复启动出现多个系统托盘） ==========
MUTEX_NAME = "Global\\YUWEITEK_TOOLBOX_MUTEX"
mutex_handle = ctypes.windll.kernel32.CreateMutexW(None, True, MUTEX_NAME)
if ctypes.windll.kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
    ctypes.windll.user32.MessageBoxW(0, "程序已经在运行中，请勿重复启动！", "YUWEITEK工具箱", 0x40)
    sys.exit(0)

app = create_app()


def force_cleanup_children():
    """强制清理所有子进程并等待句柄释放"""
    print("正在清理子进程...")
    cleanup_dotnet()
    stop_openclaw()
    time.sleep(0.5)


def cleanup_meipass():
    """手动清理 PyInstaller _MEIPASS 临时目录（带重试）"""
    if not getattr(sys, 'frozen', False):
        return
    meipass = os.environ.get('_MEIPASS', getattr(sys, '_MEIPASS', ''))
    if not meipass or not os.path.isdir(meipass):
        return
    for attempt in range(3):
        try:
            shutil.rmtree(meipass, ignore_errors=False)
            print(f"已清理临时目录: {meipass}")
            return
        except (PermissionError, OSError):
            if attempt < 2:
                time.sleep(1)


if __name__ == '__main__':
    # ========== 1. 先注册退出清理（确保托盘关闭时也能清理子进程） ==========
    atexit.register(cleanup_dotnet)
    atexit.register(stop_openclaw)
    signal.signal(signal.SIGTERM, lambda signum, frame: (cleanup_dotnet(), stop_openclaw()))

    # ========== 2. 并行启动 .NET 和 OpenClaw ==========
    def start_background_services():
        start_dotnet_backend()
        start_openclaw()
    service_thread = Thread(target=start_background_services, daemon=True)
    service_thread.start()

    port = int(os.environ.get('PORT', 5000))
    print(f"启动服务，访问 http://localhost:{port}")

    # 在后台线程中运行 Flask
    flask_thread = Thread(target=app.run, kwargs={'host': '127.0.0.1', 'port': port, 'debug': False, 'use_reloader': False})
    flask_thread.daemon = True
    flask_thread.start()

    # ========== 3. 显示 Splash 启动动画（阻塞直到 Flask 就绪或超时） ==========
    browser_opened = [False]

    def on_splash_ready():
        """Splash 关闭后打开浏览器"""
        if not browser_opened[0]:
            browser_opened[0] = True
            print("Splash 关闭，打开浏览器")
            webbrowser.open(f'http://127.0.0.1:{port}')

    show_splash_screen(on_splash_ready)

    # 如果 splash 因异常未打开浏览器，兜底打开
    if not browser_opened[0]:
        webbrowser.open(f'http://127.0.0.1:{port}')

    # ========== 4. 最后创建系统托盘（会阻塞主线程） ==========
    create_tray_icon()

    # ========== 5. 托盘退出后，显式清理子进程 ==========
    force_cleanup_children()
    cleanup_meipass()
