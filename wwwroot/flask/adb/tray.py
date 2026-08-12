# -*- coding: utf-8 -*-
"""
系统托盘图标模块
"""

import sys
import os
import webbrowser
import pystray
from PIL import Image
from config import get_static_dir

def get_icon_path():
    """获取图标文件路径（支持打包后）"""
    if getattr(sys, 'frozen', False):
        base_dir = sys._MEIPASS
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, 'app.ico')

def open_browser():
    webbrowser.open('http://localhost:5000')

def shutdown_server():
    """停止服务（Flask 为 daemon 线程，主线程退出时自动终止）"""
    pass

def open_page(page_hash):
    webbrowser.open(f'http://localhost:5000/{page_hash}')

def open_external(url):
    webbrowser.open(url)

def create_tray_icon():
    """创建并运行系统托盘图标"""
    icon_path = get_icon_path()
    if not os.path.exists(icon_path):
        image = Image.new('RGB', (64, 64), color='blue')
    else:
        image = Image.open(icon_path)

    menu = pystray.Menu(
        pystray.MenuItem("打开浏览器", lambda: open_browser()),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("交通解析工具", pystray.Menu(
            pystray.MenuItem("JT808解析工具", lambda: open_page("#JT808Parse")),
            pystray.MenuItem("JT809解析工具", lambda: open_page("#JT809Parse")),
            pystray.MenuItem("JT1078解析工具", lambda: open_page("#JT1078Parse")),
            pystray.MenuItem("JT19056解析工具", lambda: open_page("#JT19056Parse")),
            pystray.MenuItem("JT905解析工具", lambda: open_page("#JT905Parse")),
            pystray.MenuItem("主动安全解析工具", lambda: open_page("#JTSBParse")),
        )),
        pystray.MenuItem("数据处理工具", pystray.Menu(
            pystray.MenuItem("Hex工具", lambda: open_page("#HexParse")),
            pystray.MenuItem("数据字段处理工具V5.2", lambda: open_page("#DataTools")),
            pystray.MenuItem("经纬度坐标查询工具", lambda: open_page("#LatLngQuery")),
            pystray.MenuItem("H264转MP4工具", lambda: open_page("#H264Convert")),
            pystray.MenuItem("时间计算器", lambda: open_page("#TimeCalc")),
        )),
        pystray.MenuItem("终端命令调试工具", pystray.Menu(
            pystray.MenuItem("云Monitor", lambda: open_external("http://yuweicloud.com:8990/server/mainIndex.action;cm=E73E06307A2BD318BFB317ADEF280CCC")),
            pystray.MenuItem("ADB命令调试工具", lambda: open_page("#AdbTool")),
            pystray.MenuItem("生僻字指令生成器", lambda: open_page("#RareCharTool")),
            pystray.MenuItem("二维码解析工具", lambda: open_page("#QrParseTool")),
            pystray.MenuItem("公里海里转换指令生成工具", lambda: open_page("#KmNmiConvert")),
        )),
        pystray.MenuItem("其他工具(友情链接)", pystray.Menu(
            # pystray.MenuItem("时间计算工具", lambda: open_external("https://www.shijianjisuanqi.com/")),
            # pystray.MenuItem("海里公里转换工具", lambda: open_external("https://convertlive.com/zh/u/%E8%BD%AC%E6%8D%A2/%E5%85%AC%E9%87%8C/%E8%87%AA/%E6%B5%B7%E9%87%8C")),
            pystray.MenuItem("霆哥解析工具大全", lambda: open_external("http://www.tingge666.top/")),
            pystray.MenuItem("时间戳转换工具", lambda: open_external("https://tool.lu/timestamp/")),
            pystray.MenuItem("北京时间精确到毫秒", lambda: open_external("http://time.syiban.com/haomiao.php")),
            pystray.MenuItem("ICO图标转换工具", lambda: open_external("https://www.toolhelper.cn/Image/ImageToIco")),
        )),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("退出", lambda icon: (shutdown_server(), icon.stop()))
    )
    icon = pystray.Icon("YUWEITEK工具箱", image, "YUWEITEK工具箱", menu)
    try:
        icon.run()
    except Exception as e:
        print(f"托盘图标运行异常: {e}")
