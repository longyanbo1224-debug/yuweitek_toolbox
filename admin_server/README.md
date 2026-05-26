# YUWEITEK工具箱 - 远程授权管理后台 v1.0.0

## 版本说明 (v1.0.0)

基于 v1.3.0 的增量更新，主要变更：

- **Bootstrap 本地化**：CSS/JS 从 CDN 改为本地 `/static/` 目录加载，解决国内服务器无法访问国外 CDN 的问题
- **默认端口调整**：默认端口从 9800 改为 8080
- **nginx 反向代理支持**：可配合宝塔面板 nginx 做 80 → 8080 反向代理
- **静态资源本地化**：bootstrap.min.css、bootstrap.bundle.min.js、bootstrap-icons 等全部内嵌

## 功能概述

- 设备注册 & 自动审批
- 授权管理（授权 / 续期 / 拉黑 / 删除）
- 工具权限控制（按设备、按工具粒度）
- 批量操作（批量授权 / 续期 / 拉黑 / 删除）
- 管理员权限管理（超级管理员 / 普通管理员）
- 操作审计日志
- Excel 导入 / 导出

## 目录结构

```
admin_server/
├── app.py                # 主程序（Flask 路由）
├── config.py             # 配置文件（端口、密码、路径）
├── database.py           # 数据库操作（SQLite）
├── licenses.db           # 数据库文件（首次运行自动创建）
├── requirements.txt      # Python 依赖
├── 启动管理后台.bat       # Windows 启动脚本
├── README.md             # 本文档
├── static/
│   ├── img/favicon.png
│   ├── bootstrap.min.css
│   ├── bootstrap.bundle.min.js
│   ├── bootstrap-icons.css
│   └── fonts/
│       ├── bootstrap-icons.woff2
│       └── bootstrap-icons.woff
└── templates/
    ├── login.html        # 登录页
    ├── dashboard.html    # 仪表盘（首页）
    ├── licenses.html     # 授权管理
    ├── permissions.html  # 工具权限管理
    ├── admins.html       # 管理员管理
    ├── import.html       # Excel 导入
    ├── logs.html         # 审计日志
    └── password.html     # 修改密码
```

## 部署步骤（Windows 服务器）

### 1. 上传到服务器
将整个 `admin_server` 文件夹复制到服务器任意目录。

### 2. 安装依赖
```bash
cd admin_server
pip install -r requirements.txt
```

依赖列表：
- `flask>=2.3.0` — Web 框架
- `flask-cors>=4.0.0` — 跨域支持
- `openpyxl>=3.1.0` — Excel 导入导出

### 3. 修改配置
编辑 `config.py`：

```python
# ⚠️ 必须修改！
ADMIN_PASSWORD = '你的强密码'

# 可选修改
PORT = 8080                          # 服务端口
ADMIN_PATH = '/mgr-yt2026'           # 后台访问路径（改了要同步改客户端）
SECRET_KEY = '随机字符串'             # 会话密钥
```

### 4. 启动服务
```bash
python app.py
```
或双击 `启动管理后台.bat`（无 BOM UTF-8 编码，中文正常显示）。

启动后控制台输出：
```
==================================================
  YUWEITEK工具箱 - 远程授权管理后台
==================================================
  管理后台: http://127.0.0.1:8080/mgr-yt2026
  API 验证: http://127.0.0.1:8080/api/verify
==================================================
```

### 5. 开放防火墙
Windows 防火墙 → 入站规则 → 新建规则 → 端口 → TCP `8080` → 允许连接。

### 6. 验证部署
浏览器打开 `http://服务器IP:8080/mgr-yt2026`，看到登录页即部署成功。

### 7.（可选）nginx 反向代理

如果需要通过 80 端口访问，可用 nginx 反向代理：

1. 安装宝塔面板（Windows 版），安装 Nginx 套件
2. 在宝塔面板 → 网站 → 添加反向代理站点
3. 域名填服务器 IP，目标 URL 填 `http://127.0.0.1:8080`
4. 访问 `http://服务器IP/mgr-yt2026`

或手动编辑 nginx 配置：
```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## 客户端配置

在工具箱的 `config.py` 中，将 `YOUR_SERVER_IP` 替换为服务器公网 IP：

```python
REMOTE_VERIFY_URL = "http://你的服务器IP:8080/api/verify"
REMOTE_REGISTER_URL = "http://你的服务器IP:8080/api/register"
```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/verify` | POST | 客户端验证授权（核心接口） |
| `/api/register` | POST | 新设备注册 |

### /api/verify 请求体
```json
{
  "machine_code": "设备机器码",
  "license_code": "授权码（可选）",
  "user_name": "用户名（可选）",
  "has_local_license": true
}
```

### /api/verify 响应状态
| status | 说明 | 客户端行为 |
|--------|------|-----------|
| `approved` | 授权有效 | 正常使用 |
| `pending` | 待审核 | 等待管理员审批 |
| `blocked` | 已拉黑 | 清除本地文件，禁止使用 |
| `deleted` | 已删除 | 清除本地文件，提示重新激活 |
| `revoked` | 已收回 | 清除本地文件，禁止使用 |
| `expired` | 已过期 | 提示续期 |

## 授权流程

```
用户首次启动 → 自动注册（pending）
    ↓
管理员在后台看到待审核设备 → 点击授权
    ↓
用户输入授权码激活 → 本地验证 + 远程同步
    ↓
正常使用（每次刷新自动向服务器验证）
    ↓
管理员续期/拉黑/删除 → 客户端下次验证时自动同步
```

## 删除 vs 拉黑

| 操作 | 效果 | 客户端检测 | 恢复方式 |
|------|------|-----------|---------|
| 拉黑 | `blocked=1`，记录保留 | 立即同步 | 后台解除拉黑 |
| 删除 | `status='deleted'`，记录保留 | 立即同步 | 用户重新输入授权码 / 后台重新授权 |

## 管理员角色

| 角色 | 权限 |
|------|------|
| `super_admin` | 所有功能 + 管理员管理 |
| `admin` | 授权管理 + 工具权限 + 日志查看 |

默认账号：`admin` / `admin123`（⚠️ 首次运行后必须修改！）

## 常见问题

### Q: 客户端连不上服务器？
1. 检查服务器防火墙是否放行端口
2. 检查 `config.py` 中 IP 和端口是否正确
3. 云服务器需在安全组中放行端口

### Q: 续期后客户端没同步？
客户端每次刷新会向服务器验证（`force=True`），服务器返回新授权码自动同步到本地。如仍不生效，检查客户端是否能正常访问 `/api/verify`。

### Q: 删除后用户还能用？
删除后客户端下次验证会检测到 `deleted` 状态，自动清除本地授权文件。用户需重新输入授权码激活。

### Q: 数据库在哪里？
首次运行 `python app.py` 后自动创建 `licenses.db`，与 `app.py` 同目录。

### Q: 如何备份？
复制 `licenses.db` 文件即可（SQLite 数据库，单文件）。

## 注意事项

- ⏱ 服务需保持运行，关机后用户无法远程验证
- 🔒 请务必修改默认密码
- 📝 授权码需使用配套的授权生成工具生成（RSA 签名）
- 🌐 确保服务器 8080 端口对外可访问（或通过 nginx 反向代理使用 80 端口）
- 🗄️ 定期备份 `licenses.db`
- 📋 bat 文件必须用无 BOM 的 UTF-8 编码，否则中文注释会被 cmd 误解析
