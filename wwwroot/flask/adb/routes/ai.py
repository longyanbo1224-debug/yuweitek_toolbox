# -*- coding: utf-8 -*-
"""
AI 功能 API：JT808 智能解析、ADB 命令智能生成、智能助手
"""

from flask import Blueprint, request, jsonify, Response
from flask import stream_with_context
import json
from services import call_openclaw_agent, call_openclaw_agent_stream
from services.license import is_licensed
from utils import require_version

ai_bp = Blueprint('ai', __name__)

@ai_bp.route('/ai/parse', methods=['POST'])
@require_version
def ai_parse():
    if not is_licensed():
        return jsonify({'error': '未授权，请先激活'}), 401
    data = request.get_json()
    hex_data = data.get('hex', '')
    protocol = data.get('protocol', 'JT808')
    prompt = f"""你是一个专业的交通协议解析专家。请严格按照 {protocol} 协议规范，对以下十六进制数据进行逐字段解析。

**要求：**
1. 按数据包顺序，列出每个字段。
2. 每个字段说明：字段名、原始值、解析后的值、协议定义的含义。
3. **仅做解析，不要进行故障诊断、问题分析或修复建议。**
4. 如果字段值超出协议范围，可标注“（值异常）”，但仍需解析其应有含义。

**数据：** {hex_data}

**输出格式示例：**
- 消息头：7E 02 00 00 26 → 消息标识，标识一个完整数据包
- 消息ID：0x0200 → 位置信息上报
- 终端号：123456789012 → 终端唯一标识
- ... 继续解析其他字段
"""
    answer, error = call_openclaw_agent(prompt)
    if answer:
        return jsonify({'success': True, 'answer': answer})
    else:
        return jsonify({'success': False, 'error': error}), 500

@ai_bp.route('/ai/generate_command', methods=['POST'])
@require_version
def ai_generate_command():
    """ADB 命令智能生成"""
    if not is_licensed():
        return jsonify({'error': '未授权，请先激活'}), 401
    data = request.get_json()
    instruction = data.get('instruction', '')
    prompt = f"""你是 ADB 命令生成助手。请根据用户需求，生成一条严格符合以下规则的 ADB 命令（不要加 adb 前缀，只输出命令本身）。

**规则：**
1. 基础格式：直接输出子命令，不要加 "adb " 前缀。
2. Shell 命令：必须以 "shell " 开头，例如 "shell ls /sdcard"。
3. 特殊符号（|, >, <, &, ; 等）：必须将整个命令用双引号包裹，例如 shell "ps | grep com.example"。
4. 避免纯 shell：不要只输出 "shell"，必须带有具体子命令。
5. 含空格路径：用双引号包裹整个路径，例如 shell ls "/sdcard/My Documents"。
6. 多条命令组合：使用分号或 && 组合时，整体用双引号包裹，例如 shell "cd /sdcard; ls -l"。
7. 不支持交互式命令：只输出一次性执行的命令。

**示例需求与输出：**
- 需求：列出 /sdcard 目录下的文件 → 输出：shell ls /sdcard
- 需求：查看设备上的进程并过滤 com.example → 输出：shell "ps | grep com.example"
- 需求：将 "hello" 写入 /sdcard/test.txt → 输出：shell "echo hello > /sdcard/test.txt"
- 需求：切换目录并列出文件 → 输出：shell "cd /sdcard && ls -l"
- 需求：获取设备序列号 → 输出：shell getprop ro.serialno

**用户需求：** {instruction}

**请只输出命令本身，不要输出任何解释或额外内容。**"""
    answer, error = call_openclaw_agent(prompt)
    if answer:
        command = answer.strip()
        return jsonify({'success': True, 'command': command})
    else:
        return jsonify({'success': False, 'error': error}), 500

@ai_bp.route('/ai/ask', methods=['GET', 'POST'])
@require_version
def ai_ask():
    if not is_licensed():
        return jsonify({'error': '未授权，请先激活'}), 401
    if request.method == 'GET':
        question = request.args.get('question', '')
    else:
        data = request.get_json()
        question = data.get('question', '')
    prompt = f"请回答以下关于YUWEITEK工具箱或ADB调试的问题：{question}"

    def generate():
        yield "data: " + json.dumps({'status': 'start'}) + "\n\n"
        answer, error = call_openclaw_agent(prompt)
        if answer:
            yield "data: " + json.dumps({'chunk': answer}) + "\n\n"
        else:
            yield "data: " + json.dumps({'error': error}) + "\n\n"
        yield "data: " + json.dumps({'status': 'end'}) + "\n\n"

    return Response(stream_with_context(generate()), mimetype='text/event-stream')