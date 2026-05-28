# -*- coding: utf-8 -*-
"""
JTT 代理路由：转发请求到 .NET 后端 (JTTools.exe)
"""

from flask import Blueprint, request, jsonify, Response
import requests
from services.license import is_licensed

jtt_bp = Blueprint('jtt', __name__)

@jtt_bp.route('/jtt/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
def proxy_to_dotnet(path):
    """代理所有 /jtt/* 请求到 .NET 后端（JTTools.exe），并检查授权状态"""
    # 1. 检查授权（未授权则拒绝）
    if not is_licensed():
        return jsonify({'Code': 401, 'Message': '未授权，请先激活'}), 401

    # 2. 构建目标 URL（.NET 后端默认运行在 18889 端口）
    target_url = f"http://127.0.0.1:18889/jtt/{path}"

    # 3. 转发请求（保留原方法、请求体、头部）
    headers = {k: v for k, v in request.headers if k.lower() != 'host'}
    try:
        if request.method == 'GET':
            resp = requests.get(target_url, params=request.args, headers=headers, timeout=30)
        elif request.method == 'POST':
            # 尝试获取 JSON 数据，若失败则使用原始数据
            if request.is_json:
                json_data = request.get_json()
                resp = requests.post(target_url, json=json_data, headers=headers, timeout=30)
            else:
                resp = requests.post(target_url, data=request.get_data(), headers=headers, timeout=30)
        elif request.method == 'PUT':
            if request.is_json:
                json_data = request.get_json()
                resp = requests.put(target_url, json=json_data, headers=headers, timeout=30)
            else:
                resp = requests.put(target_url, data=request.get_data(), headers=headers, timeout=30)
        elif request.method == 'DELETE':
            resp = requests.delete(target_url, headers=headers, timeout=30)
        elif request.method == 'OPTIONS':
            # 预检请求直接返回 200，让浏览器通过 CORS
            return Response(status=200)
        else:
            return jsonify({'error': 'Method not allowed'}), 405

        # 4. 返回 .NET 后端的响应
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        response_headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded_headers}
        return Response(resp.content, status=resp.status_code, headers=response_headers)

    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'转发失败: {str(e)}'}), 500