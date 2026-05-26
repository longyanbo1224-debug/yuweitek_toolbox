##  YUWEITEK 工具箱 - 项目结构说明
本文件记录了当前项目的拆分结构和关键信息，方便后续维护或与 AI 协作时快速理解。

## 项目概述
YUWEITEK 工具箱是一个桌面端多功能工具集，主要面向道路运输车辆卫星定位终端的调试和维护场景。项目包含两大部分：

1. **主程序（wwwroot/）**：桌面客户端 + Flask 后端，提供交通协议解析、ADB 调试、数据处理、视频转换、AI 智能助手等功能，打包为单个 exe 分发。

2. **远程授权管理后台（admin_server/）**：独立的 Flask Web 应用，用于管理设备授权、审批、续期、拉黑等，支持多管理员角色，部署在远程服务器上供客户端在线验证。

## 客户端功能一览（wwwroot/）

### 交通协议解析工具
- **JT808 解析**：解析 JT/T 808 协议数据包，支持原始日志模式（自动提取 7E/2323 格式数据）
- **JT809 解析**：解析 JT/T 809 协议数据包
- **JT1078 解析**：解析 JT/T 1078 视频协议数据包
- **JT19056 解析**：解析 JT/T 19056 行驶记录仪协议
- **JT905 解析**：解析 JT/T 905 协议数据包
- **主动安全解析**：解析主动安全报警数据（JTSB）

### 数据处理工具
- **Hex 工具**：十六进制 / ASCII 实时互转，支持 2-36 进制通用转换
- **数据字段处理工具 V5.2**：数据包提取（7E/2323 格式）、格式清洗、空格去除、结果复制
- **经纬度坐标查询工具**：地址/坐标互转、坐标格式转换、批量处理、地图展示

### 终端命令调试工具
- **ADB 命令调试**：设备管理、命令发送/编辑/拖拽排序、分组管理、日志采集、文件管理、导出/导入命令
- **AI 命令生成**：自然语言描述自动转 ADB 命令
- **云 Monitor**：远程监控终端状态
- **生僻字指令生成器**：生成 16x16/24x24 点阵 ADB 指令（王汝坪专用）

### 其他工具
- **H264 转 MP4**：视频格式转换，支持单文件/批量、CRF 质量调整、进度推送
- **AI 智能助手**：悬浮窗问答，SSE 流式接收 AI 回复，支持智能解析协议数据

### 客户端技术栈
- **前端**：单页应用（SPA），Bootstrap 5 + Bootstrap Icons，模块化 JS（core/config → core/utils → core/auth → modules/* → site.js）
- **后端**：Flask（Python），蓝图架构（routes/ + services/），系统托盘（pystray）
- **打包**：PyInstaller 单文件 exe，Inno Setup 安装包

## 目录结构

```
YUWEITEK工具箱 Agent v1.3.0_1/
├── wwwroot/                              # 客户端主程序
│   ├── flask/                            # 后端 Python 代码
│   │   ├── JTTools.exe                   # .NET 后端主程序
│   │   ├── appsettings.json              # .NET 后端配置
│   │   └── adb/                          # 后端根目录
│   │       ├── adb_server.py             # 主入口（启动 Flask、后台服务、托盘）
│   │       ├── app.py                    # Flask 应用工厂
│   │       ├── config.py                 # 全局配置（版本、路径、授权、ADB 路径等）
│   │       ├── state.py                  # 全局状态变量
│   │       ├── utils.py                  # 通用工具函数
│   │       ├── tray.py                   # 系统托盘图标
│   │       ├── routes/                   # API 路由（蓝图）
│   │       │   ├── adb.py                # 设备列表、命令管理、发送命令
│   │       │   ├── ai.py                 # AI 解析、命令生成、智能问答
│   │       │   ├── license.py            # 授权检查、激活、版本信息
│   │       │   ├── logcat.py             # 日志采集启动/停止/状态
│   │       │   ├── static.py             # 静态文件服务 + 打开文件夹
│   │       │   ├── video.py              # 视频转换 API（同步/异步/批量/SSE）
│   │       │   └── jtt.py                # JTT 代理路由（转发到 .NET 后端）
│   │       └── services/                 # 业务逻辑层
│   │           ├── dotnet.py             # .NET 后端启动/停止
│   │           ├── openclaw.py           # OpenClaw 网关管理 + AI 调用
│   │           ├── adb_client.py         # ADB 设备操作、命令读写
│   │           ├── license.py            # 授权验证核心函数
│   │           ├── logcat.py             # 日志采集后台逻辑
│   │           └── video_converter.py    # 视频转换核心逻辑
│   ├── js/                               # 前端 JavaScript
│   │   ├── core/                         # 核心模块（必须按顺序加载）
│   │   │   ├── config.js                 # 全局常量、axios 配置
│   │   │   ├── utils.js                  # 通用工具函数
│   │   │   └── auth.js                   # 授权管理、版本检查、激活弹窗
│   │   ├── modules/                      # 功能模块（按需加载）
│   │   │   ├── hex-convert.js            # 十六进制转换工具
│   │   │   ├── data-processor.js         # 数据字段处理工具
│   │   │   ├── jt-parse.js               # JT 协议解析（808/809/1078/19056/905/SB）
│   │   │   ├── latlng-query.js           # 经纬度坐标查询
│   │   │   ├── video-convert.js          # H264 转 MP4
│   │   │   ├── adb-tools.js              # ADB 命令调试工具
│   │   │   ├── ai-assistant.js           # AI 智能助手
│   │   │   └── rare-char.js              # 生僻字指令生成器
│   │   └── site.js                       # 入口文件（菜单切换、Hash 路由）
│   ├── css/                              # 样式文件
│   ├── img/                              # 图片资源
│   ├── lib/                              # 第三方前端库
│   ├── index.html                        # 前端主页面
│   ├── build.bat                         # PyInstaller 打包脚本
│   ├── installer.iss                     # Inno Setup 安装脚本
│   └── ...                               # 其他资源文件
│
├── admin_server/                         # 远程授权管理后台（独立部署）
│   ├── app.py                            # Flask 主程序（路由 + 启动）
│   ├── config.py                         # 配置文件（端口、密码、路径）
│   ├── database.py                       # 数据库操作（SQLite）
│   ├── licenses.db                       # 数据库文件（首次运行自动创建）
│   ├── requirements.txt                  # Python 依赖
│   ├── 启动管理后台.bat                   # Windows 启动脚本
│   ├── README.md                         # 部署说明文档
│   ├── static/                           # 静态资源
│   │   ├── bootstrap.min.css             # Bootstrap CSS（本地化）
│   │   ├── bootstrap.bundle.min.js       # Bootstrap JS（本地化）
│   │   ├── bootstrap-icons.css           # Bootstrap Icons CSS
│   │   └── fonts/                        # 字体文件
│   └── templates/                        # HTML 模板
│       ├── login.html                    # 登录页
│       ├── dashboard.html                # 仪表盘（首页）
│       ├── licenses.html                 # 授权管理
│       ├── permissions.html              # 工具权限管理
│       ├── admins.html                   # 管理员管理
│       ├── import.html                   # Excel 导入
│       ├── logs.html                     # 审计日志
│       └── password.html                 # 修改密码
│
└── CHANGELOG.md                          # 版本更新记录
```

## 远程授权管理后台（admin_server/）

### 功能
- **设备注册 & 自动审批**：客户端首次启动自动注册，管理员在后台审批
- **授权管理**：授权 / 续期 / 拉黑 / 删除，支持批量操作
- **工具权限控制**：按设备、按工具粒度控制功能访问
- **管理员权限管理**：超级管理员 / 普通管理员角色
- **操作审计日志**：记录所有管理操作
- **Excel 导入/导出**：批量导入授权数据、导出报表

### 技术栈
- **后端**：Flask + SQLite（sql.js）+ node-cron
- **前端**：Vue3 + TypeScript + Element Plus + Vite
- **认证**：Session + SECRET_KEY
- **API**：RESTful（/api/verify、/api/register）

### 部署
1. 上传 admin_server/ 到服务器
2. `pip install -r requirements.txt`
3. 修改 config.py（密码、端口、SECRET_KEY）
4. `python app.py` 或双击启动脚本
5. 开放防火墙端口（默认 8080）
6. 可选：配合 nginx 反向代理使用 80 端口

详细部署说明见 `admin_server/README.md`。

### 客户端对接
客户端 config.py 中配置服务器地址：
```python
REMOTE_VERIFY_URL = "http://服务器IP:8080/api/verify"
REMOTE_REGISTER_URL = "http://服务器IP:8080/api/register"
```

## 关键配置

### 客户端（wwwroot/flask/adb/config.py）
- `APP_VERSION`：当前版本号
- `MIN_REQUIRED_VERSION`：最低兼容版本
- `PUBLIC_KEY_PEM`：RSA 公钥（授权验证）
- Flask 默认端口：5000
- .NET 后端端口：18889
- OpenClaw 网关端口：18789

### 管理后台（admin_server/config.py）
- `PORT`：服务端口（默认 8080）
- `ADMIN_PASSWORD`：管理员密码
- `ADMIN_PATH`：后台访问路径（/mgr-yt2026）
- `SECRET_KEY`：会话密钥

## 前端加载顺序（index.html）
```html
<!-- 核心模块（必须按顺序） -->
<script src="/js/core/config.js"></script>
<script src="/js/core/utils.js"></script>
<script src="/js/core/auth.js"></script>

<!-- 功能模块（无顺序依赖） -->
<script src="/js/modules/hex-convert.js"></script>
<script src="/js/modules/data-processor.js"></script>
<script src="/js/modules/jt-parse.js"></script>
<script src="/js/modules/latlng-query.js"></script>
<script src="/js/modules/video-convert.js"></script>
<script src="/js/modules/adb-tools.js"></script>
<script src="/js/modules/ai-assistant.js"></script>
<script src="/js/modules/rare-char.js"></script>

<!-- 入口文件（最后加载） -->
<script src="/js/site.js"></script>
```

## 开发环境准备

### 客户端
```bash
cd wwwroot/flask/adb
pip install -r requirements.txt
python adb_server.py
# 访问 http://127.0.0.1:5000
```

### 管理后台
```bash
cd admin_server
pip install -r requirements.txt
python app.py
# 访问 http://127.0.0.1:8080/mgr-yt2026
```

## 打包与分发

1. **打包 exe**：在 wwwroot/ 下执行 `build.bat`，生成 `YUWEITEK工具箱 Agent.exe`
2. **制作安装包**：使用 `installer.iss`（Inno Setup）生成安装程序
3. **AI 补丁包**：单独提供 `openclaw/portable/` 目录的自解压包
4. **管理后台**：独立部署到服务器，不随客户端打包

## 常见问题与维护要点

1. **导入错误**：确保 routes/ai.py 使用 `from services import call_openclaw_agent`
2. **全局状态**：视频转换变量统一从 state 导入
3. **退出清理**：atexit.register 和 signal.signal 必须在 create_tray_icon() 之前注册
4. **JTT 代理**：必须注册 jtt_bp 蓝图（无前缀）
5. **服务启动失败**：检查端口 18889 是否被占用；OpenClaw 需 AI 补丁包
6. **前端模块加载顺序**：core 模块按序加载，功能模块无序，site.js 最后
7. **管理后台部署**：云服务器需在安全组开放端口；Bootstrap 已本地化，无需外网 CDN
8. **bat 文件编码**：必须用无 BOM 的 UTF-8 编码，否则中文注释被 cmd 误解析

---

*文档更新时间：2026-05-21*
