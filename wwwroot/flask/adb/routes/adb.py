# -*- coding: utf-8 -*-
"""
ADB 相关 API：设备列表、命令管理（含分组）、发送命令、批量操作
"""

from flask import Blueprint, request, jsonify
import subprocess
import json
import os
import sys
import shutil
from config import ADB_PATH, ADB_EXISTS, COMMANDS_FILE
from services.license import is_licensed

adb_bp = Blueprint('adb', __name__)

# ---------- 辅助函数 ----------
def load_commands():
    """加载已保存的命令列表，兼容旧数据（自动补 group 字段）"""
    if os.path.exists(COMMANDS_FILE):
        with open(COMMANDS_FILE, 'r', encoding='utf-8') as f:
            commands = json.load(f)
            for cmd in commands:
                if 'group' not in cmd:
                    cmd['group'] = ''
            return commands
    return []

def save_commands(commands):
    """保存命令列表到文件"""
    with open(COMMANDS_FILE, 'w', encoding='utf-8') as f:
        json.dump(commands, f, indent=2, ensure_ascii=False)

def get_devices():
    if not ADB_EXISTS:
        return []
    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
    try:
        result = subprocess.run([ADB_PATH, 'devices'], capture_output=True, timeout=5, startupinfo=startupinfo)
        stdout = result.stdout.decode('utf-8', errors='replace')
    except Exception:
        return []
    lines = stdout.strip().split('\n')
    devices = []
    for line in lines[1:]:
        if '\tdevice' in line:
            devices.append(line.split('\t')[0])
    return devices

# ---------- API 路由 ----------
@adb_bp.route('/devices', methods=['GET'])
def devices():
    if not is_licensed():
        return jsonify({'error': '未授权', 'devices': []}), 401
    return jsonify({'devices': get_devices()})

@adb_bp.route('/commands', methods=['GET'])
def get_commands():
    """获取所有命令"""
    if not is_licensed():
        return jsonify({'error': '未授权', 'commands': []}), 401
    return jsonify({'commands': load_commands()})

@adb_bp.route('/commands', methods=['POST'])
def add_command():
    """添加新命令（支持 group 字段）"""
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    data = request.get_json()
    name = data.get('name', '').strip()
    cmd = data.get('cmd', '').strip()
    group = data.get('group', '').strip()
    if not name or not cmd:
        return jsonify({'error': '名称和命令不能为空'}), 400
    commands = load_commands()
    if any(c['name'] == name for c in commands):
        return jsonify({'error': '命令名称已存在'}), 400
    commands.append({'name': name, 'cmd': cmd, 'group': group})
    save_commands(commands)
    return jsonify({'message': '添加成功', 'commands': commands})

@adb_bp.route('/commands/<path:name>', methods=['PUT'])
def update_command(name):
    """修改命令（支持 group 字段）"""
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    data = request.get_json()
    new_name = data.get('name', '').strip()
    new_cmd = data.get('cmd', '').strip()
    new_group = data.get('group', '').strip()
    if not new_name or not new_cmd:
        return jsonify({'error': '名称和命令不能为空'}), 400
    commands = load_commands()
    found = False
    for i, c in enumerate(commands):
        if c['name'] == name:
            if new_name != name and any(c2['name'] == new_name for c2 in commands):
                return jsonify({'error': '新名称已存在'}), 400
            commands[i] = {'name': new_name, 'cmd': new_cmd, 'group': new_group}
            found = True
            break
    if not found:
        return jsonify({'error': '命令不存在'}), 404
    save_commands(commands)
    return jsonify({'message': '修改成功', 'commands': commands})

@adb_bp.route('/commands/<path:name>', methods=['DELETE'])
def delete_command(name):
    """删除命令"""
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    commands = load_commands()
    new_commands = [c for c in commands if c['name'] != name]
    if len(new_commands) == len(commands):
        return jsonify({'error': '命令不存在'}), 404
    save_commands(new_commands)
    return jsonify({'message': '删除成功', 'commands': new_commands})

# ---------- 批量操作 ----------
@adb_bp.route('/commands/batch_delete', methods=['POST'])
def batch_delete_commands():
    """批量删除命令"""
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    data = request.get_json()
    names = data.get('names', [])
    if not names:
        return jsonify({'error': '未选择命令'}), 400
    commands = load_commands()
    names_set = set(names)
    new_commands = [c for c in commands if c['name'] not in names_set]
    deleted = len(commands) - len(new_commands)
    save_commands(new_commands)
    return jsonify({'message': f'已删除 {deleted} 条命令', 'commands': new_commands})

@adb_bp.route('/commands/batch_move', methods=['POST'])
def batch_move_commands():
    """批量移动命令到指定分组"""
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    data = request.get_json()
    names = data.get('names', [])
    target_group = data.get('group', '').strip()
    if not names:
        return jsonify({'error': '未选择命令'}), 400
    commands = load_commands()
    names_set = set(names)
    moved = 0
    for c in commands:
        if c['name'] in names_set:
            c['group'] = target_group
            moved += 1
    save_commands(commands)
    return jsonify({'message': f'已移动 {moved} 条命令到 "{target_group or "未分组"}"', 'commands': commands})

# ---------- 分组管理 ----------
@adb_bp.route('/groups', methods=['GET'])
def get_groups():
    """获取所有分组名称列表"""
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    commands = load_commands()
    groups = sorted(set(c.get('group', '') for c in commands if c.get('group', '').strip()))
    return jsonify({'groups': groups})

@adb_bp.route('/groups/rename', methods=['POST'])
def rename_group():
    """重命名分组"""
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    data = request.get_json()
    old_name = data.get('old_name', '').strip()
    new_name = data.get('new_name', '').strip()
    if not old_name or not new_name:
        return jsonify({'error': '分组名称不能为空'}), 400
    if old_name == new_name:
        return jsonify({'error': '新旧名称相同'}), 400
    commands = load_commands()
    renamed = 0
    for c in commands:
        if c.get('group', '') == old_name:
            c['group'] = new_name
            renamed += 1
    save_commands(commands)
    return jsonify({'message': f'已重命名 {renamed} 条命令的分组', 'commands': commands})

@adb_bp.route('/groups/<path:group_name>', methods=['DELETE'])
def delete_group(group_name):
    """删除分组（组内命令移到未分组）"""
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    commands = load_commands()
    affected = 0
    for c in commands:
        if c.get('group', '') == group_name:
            c['group'] = ''
            affected += 1
    save_commands(commands)
    return jsonify({'message': f'已删除分组 "{group_name}"，{affected} 条命令移至未分组', 'commands': commands})

# ---------- 导入导出 ----------
@adb_bp.route('/commands/import', methods=['POST'])
def import_commands():
    """批量导入命令（替换全部）"""
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    data = request.get_json()
    if not isinstance(data, list):
        return jsonify({'error': '数据格式错误，应为命令列表'}), 400
    for item in data:
        if not isinstance(item, dict) or 'name' not in item or 'cmd' not in item:
            return jsonify({'error': '命令格式错误，每个命令需包含 name 和 cmd'}), 400
        if 'group' not in item:
            item['group'] = ''
    save_commands(data)
    return jsonify({'message': '导入成功', 'commands': data})

# ---------- 发送命令 ----------
@adb_bp.route('/send_command', methods=['POST'])
def send_command():
    """发送单条 ADB 命令"""
    if not is_licensed():
        return jsonify({'error': '未授权，请先激活'}), 401
    data = request.get_json()
    device = data.get('device')
    cmd_text = data.get('command')
    if not device or not cmd_text:
        return jsonify({'error': '缺少 device 或 command'}), 400
    if device not in get_devices():
        return jsonify({'error': '设备未连接或序列号错误'}), 400
    # 移除可能的 "adb " 前缀
    if cmd_text.startswith('adb '):
        cmd_text = cmd_text[4:]
    if not cmd_text.strip():
        return jsonify({'error': '命令不能为空，请提供有效的 adb 子命令'}), 400
    if cmd_text.strip() == 'shell':
        return jsonify({'error': '不支持纯 shell 交互命令，请添加具体指令'}), 400

    # 创建隐藏窗口的 startupinfo
    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE

    full_cmd_str = f'"{ADB_PATH}" -s {device} {cmd_text}'
    try:
        result = subprocess.run(full_cmd_str, shell=True, capture_output=True, text=True, timeout=30, startupinfo=startupinfo)
        return jsonify({
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        })
    except subprocess.TimeoutExpired:
        return jsonify({'error': '命令执行超时'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500
