# -*- coding: utf-8 -*-
"""
OpenClaw 集成：启动、停止网关，调用 AI 代理
"""

import subprocess
import json
import os
import sys
import time
from config import USER_DATA_DIR
from state import openclaw_process

def get_openclaw_paths():
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)  # 主程序 exe 所在目录
    else:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

    openclaw_base = os.path.join(base_dir, 'openclaw', 'portable')
    core_dir = os.path.join(openclaw_base, 'app', 'core')
    runtime_dir = os.path.join(openclaw_base, 'app', 'runtime', 'node-win-x64')
    node_exe = os.path.join(runtime_dir, 'node.exe')
    gateway_script = os.path.join(core_dir, 'node_modules', 'openclaw', 'openclaw.mjs')

    # 配置文件放在程序目录下的 openclaw/portable/data/.openclaw 中（保证可写）
    config_dir = os.path.join(openclaw_base, 'data', '.openclaw')
    os.makedirs(config_dir, exist_ok=True)
    config_file = os.path.join(config_dir, 'openclaw.json')

    # 确保配置文件存在（如果不存在则创建空文件）
    if not os.path.exists(config_file):
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump({}, f)

    # 判断可用性
    available = os.path.exists(node_exe) and os.path.exists(gateway_script)

    return {
        'available': available,
        'node': node_exe,
        'gateway': gateway_script,
        'config': config_file,
        'cwd': core_dir
    }

def start_openclaw():
    global openclaw_process
    paths = get_openclaw_paths()
    if not paths['available']:
        print("OpenClaw 未安装，AI 功能不可用")
        return

    runtime_base = os.path.join(USER_DATA_DIR, 'openclaw_runtime')
    lock_file = os.path.join(runtime_base, 'state', 'agents', 'main', 'sessions', 'toolbox.jsonl.lock')
    if os.path.exists(lock_file):
        try:
            # 尝试读取锁文件中的 PID（如果有）
            pid = None
            with open(lock_file, 'r') as f:
                content = f.read().strip()
                if content.isdigit():
                    pid = int(content)
            if pid:
                # 尝试结束该进程
                subprocess.run(f'taskkill /F /PID {pid}', shell=True, capture_output=True)
                time.sleep(1)
            os.remove(lock_file)
            print(f"已删除锁文件: {lock_file}")
        except Exception as e:
            print(f"删除锁文件失败: {e}")
            # 如果删除失败，尝试直接强制删除（可能被占用）
            try:
                os.chmod(lock_file, 0o666)
                os.remove(lock_file)
            except:
                pass
    workspaces_dir = os.path.join(runtime_base, 'workspace')
    state_dir = os.path.join(runtime_base, 'state')
    cache_dir = os.path.join(runtime_base, 'cache')
    logs_dir = os.path.join(runtime_base, 'logs')
    for d in [workspaces_dir, state_dir, cache_dir, logs_dir]:
        os.makedirs(d, exist_ok=True)

    # 模拟用户目录，防止 OpenClaw 回退到 C:\Users\用户名
    fake_home = os.path.join(runtime_base, 'fake_home')
    os.makedirs(fake_home, exist_ok=True)

    # 修改当前进程的环境变量（影响子进程）
    os.environ['USERPROFILE'] = fake_home
    os.environ['HOME'] = fake_home
    os.environ['APPDATA'] = fake_home
    os.environ['LOCALAPPDATA'] = fake_home
    os.environ['OPENCLAW_CONFIG_PATH'] = paths['config']
    os.environ['OPENCLAW_STATE_DIR'] = state_dir
    os.environ['OPENCLAW_WORKSPACE_DIR'] = workspaces_dir
    os.environ['OPENCLAW_DATA_DIR'] = runtime_base
    os.environ['OPENCLAW_CACHE_DIR'] = cache_dir
    os.environ['OPENCLAW_LOGS_DIR'] = logs_dir

    # 复制给子进程
    env = os.environ.copy()

    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE

    cmd = [
        paths['node'], paths['gateway'],
        'gateway', '--port', '18789',
        # 如果支持，添加 --user-data-dir
        # '--user-data-dir', runtime_base
    ]
    openclaw_process = subprocess.Popen(
        cmd,
        cwd=runtime_base,   # 工作目录改为可写目录
        env=env,
        startupinfo=startupinfo,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
    )
    print(f"OpenClaw 网关已启动，PID: {openclaw_process.pid}")
    print(f"运行时目录：{runtime_base}")

def stop_openclaw():
    global openclaw_process
    if openclaw_process and openclaw_process.poll() is None:
        print("正在关闭 OpenClaw 网关...")
        # 用 taskkill /T /F 杀掉整个进程树（含子进程），防止临时目录被锁
        try:
            subprocess.run(
                f'taskkill /T /F /PID {openclaw_process.pid}',
                shell=True, capture_output=True, timeout=5
            )
        except Exception:
            openclaw_process.terminate()
        try:
            openclaw_process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            openclaw_process.kill()

    # 清理锁文件（防止退出后残留导致下次启动报 Warning）
    runtime_base = os.path.join(USER_DATA_DIR, 'openclaw_runtime')
    lock_file = os.path.join(runtime_base, 'state', 'agents', 'main', 'sessions', 'toolbox.jsonl.lock')
    if os.path.exists(lock_file):
        try:
            os.remove(lock_file)
            print(f"已清理锁文件: {lock_file}")
        except Exception as e:
            print(f"清理锁文件失败: {e}")

def _call_openclaw_agent(prompt):
    """调用 OpenClaw agent 获取 AI 回复（非流式），兼容输出混合的情况"""
    paths = get_openclaw_paths()
    if not paths['available']:
        return None, "OpenClaw 未安装，请下载并安装 AI 组件补丁包"

    # 创建统一的运行时目录（放在用户数据目录下，保证可写）
    runtime_base = os.path.join(USER_DATA_DIR, 'openclaw_runtime')
    workspaces_dir = os.path.join(runtime_base, 'workspace')
    state_dir = os.path.join(runtime_base, 'state')
    cache_dir = os.path.join(runtime_base, 'cache')
    logs_dir = os.path.join(runtime_base, 'logs')
    for d in [workspaces_dir, state_dir, cache_dir, logs_dir]:
        os.makedirs(d, exist_ok=True)

    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE

    cmd = [
        paths['node'], paths['gateway'],
        'agent', '--message', prompt, '--json', '--session-id', 'toolbox'
    ]

    # 设置环境变量，覆盖所有可能被 OpenClaw 使用的路径
    env = os.environ.copy()
    env['OPENCLAW_CONFIG_PATH'] = paths['config']
    env['OPENCLAW_STATE_DIR'] = state_dir
    env['OPENCLAW_WORKSPACE_DIR'] = workspaces_dir
    env['OPENCLAW_DATA_DIR'] = runtime_base
    env['OPENCLAW_CACHE_DIR'] = cache_dir
    env['OPENCLAW_LOGS_DIR'] = logs_dir
    # 覆盖系统家目录，防止回退到 C:\Users\用户名
    env['USERPROFILE'] = runtime_base
    env['HOME'] = runtime_base
    env['APPDATA'] = runtime_base
    env['LOCALAPPDATA'] = runtime_base
    env['XDG_CONFIG_HOME'] = runtime_base
    env['XDG_DATA_HOME'] = runtime_base
    env['XDG_CACHE_HOME'] = cache_dir

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=180,
            env=env,
            cwd=paths['cwd'],
            startupinfo=startupinfo
        )
        stdout = result.stdout.decode('utf-8', errors='replace')
        stderr = result.stderr.decode('utf-8', errors='replace')
        print("STDOUT:", stdout)
        print("STDERR:", stderr)

        # 从文本中提取 JSON 并返回 payloads 中的文本
        def extract_text_from_output(output):
            if not output.strip():
                return None
            # 找到第一个 '{' 和最后一个 '}' 提取 JSON
            start = output.find('{')
            end = output.rfind('}')
            if start == -1 or end == -1:
                return None
            json_str = output[start:end+1]
            try:
                data = json.loads(json_str)
                if 'result' in data and 'payloads' in data['result']:
                    payloads = data['result']['payloads']
                elif 'payloads' in data:
                    payloads = data['payloads']
                else:
                    return None
                if payloads and len(payloads) > 0:
                    text = payloads[0].get('text', '')
                    if text:
                        return text
            except json.JSONDecodeError:
                pass
            return None

        # 优先从 stdout 提取
        text = extract_text_from_output(stdout)
        if text is not None:
            return text, None

        # 再从 stderr 提取
        text = extract_text_from_output(stderr)
        if text is not None:
            return text, None

        # 都无法提取，返回原始错误
        if stderr:
            return None, stderr
        elif stdout:
            return None, f"无法解析 AI 响应（非 JSON 格式）: {stdout[:200]}"
        else:
            return None, "OpenClaw 未返回任何数据"

    except subprocess.TimeoutExpired:
        return None, "请求超时（超过180秒）"
    except Exception as e:
        return None, str(e)
    
def _call_openclaw_agent_stream(prompt):
    """流式调用 OpenClaw agent，逐行返回响应"""
    paths = get_openclaw_paths()
    if not paths['available']:
        yield "data: " + json.dumps({'error': 'OpenClaw 未安装'}) + "\n\n"
        return

    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE

    cmd = [
        paths['node'], paths['gateway'],
        'agent', '--message', prompt,
        '--stream',
        '--session-id', 'toolbox'
    ]
    env = os.environ.copy()
    env['OPENCLAW_CONFIG_PATH'] = paths['config']

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        cwd=paths['cwd'],
        env=env,
        startupinfo=startupinfo,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
    )

    try:
        for line in iter(process.stdout.readline, ''):
            if not line:
                break
            line = line.strip()
            if line:
                yield "data: " + json.dumps({'chunk': line}) + "\n\n"
        stderr = process.stderr.read()
        if stderr:
            yield "data: " + json.dumps({'error': stderr}) + "\n\n"
    finally:
        process.terminate()
        process.wait(timeout=3)