# -*- coding: utf-8 -*-
"""
视频转换 API：单文件转换、批量转换、异步任务、SSE 进度推送
"""

from flask import Blueprint, request, jsonify, Response
from flask import stream_with_context
import threading
import uuid
import time
import json
import os
from datetime import datetime
from services.video_converter import convert_file, batch_convert, convert_file_async
from services.license import is_licensed
from state import convert_tasks, tasks_lock, batch_sessions, batch_lock

video_bp = Blueprint('video', __name__)

# ========== 视频转换异步任务管理 ==========
class ConvertTask:
    def __init__(self, input_path, output_path, reencode, crf):
        self.id = str(uuid.uuid4())
        self.input_path = input_path
        self.output_path = output_path
        self.reencode = reencode
        self.crf = crf
        self.status = 'pending'   # pending, running, completed, failed, cancelled
        self.progress = 0
        self.message = ''
        self.start_time = None
        self.end_time = None
        self.error = None
        self.process = None        # 保存 ffmpeg 子进程引用

def run_convert_task(task):
    try:
        task.status = 'running'
        task.start_time = datetime.now()
        task.message = '开始转换...'
        
        def progress_callback(percent, msg):
            if task.status == 'cancelled':
                return
            task.progress = percent
            task.message = msg
        
        success = convert_file_async(
            task.input_path, task.output_path,
            task.reencode, task.crf,
            progress_callback,
            task
        )
        if task.status == 'cancelled':
            return
        if success:
            task.status = 'completed'
            task.progress = 100
            task.message = '转换完成'
        else:
            task.status = 'failed'
            task.message = '转换失败，请检查日志'
    except Exception as e:
        task.status = 'failed'
        task.error = str(e)
        task.message = f'转换出错: {str(e)}'
    finally:
        task.end_time = datetime.now()

# ---------- 同步转换 API ----------
@video_bp.route('/video/convert', methods=['POST'])
def video_convert():
    """单个文件转换API（同步）"""
    if not is_licensed():
        return jsonify({'error': '未授权，请先激活'}), 401
    
    data = request.get_json()
    input_path = data.get('input_path', '')
    output_path = data.get('output_path', '')
    reencode = data.get('reencode', False)
    crf = data.get('crf', 23)
    
    if not input_path or not output_path:
        return jsonify({'error': '缺少 input_path 或 output_path 参数'}), 400
    
    if not os.path.exists(input_path):
        return jsonify({'error': f'输入文件不存在: {input_path}'}), 400
    
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    success = convert_file(input_path, output_path, reencode, crf)
    if success:
        return jsonify({'success': True, 'message': '转换成功', 'output_path': output_path})
    else:
        return jsonify({'success': False, 'error': '转换失败，请检查日志'}), 500

@video_bp.route('/video/batch_convert', methods=['POST'])
def video_batch_convert():
    """批量转换API（同步）"""
    if not is_licensed():
        return jsonify({'error': '未授权，请先激活'}), 401
    
    data = request.get_json()
    folder_path = data.get('folder_path', '')
    reencode = data.get('reencode', False)
    crf = data.get('crf', 23)
    overwrite = data.get('overwrite', False)
    
    if not folder_path:
        return jsonify({'error': '缺少 folder_path 参数'}), 400
    
    if not os.path.isdir(folder_path):
        return jsonify({'error': f'文件夹不存在: {folder_path}'}), 400
    
    success, fail = batch_convert(folder_path, reencode, crf, overwrite)
    return jsonify({
        'success': True,
        'success_count': success,
        'fail_count': fail,
        'message': f'批量转换完成：成功 {success} 个，失败 {fail} 个'
    })

# ---------- 异步转换 API ----------
@video_bp.route('/video/convert_async', methods=['POST'])
def video_convert_async():
    """异步启动转换任务"""
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    data = request.get_json()
    input_path = data.get('input_path', '')
    output_path = data.get('output_path', '')
    reencode = data.get('reencode', False)
    crf = data.get('crf', 23)

    if not input_path or not output_path:
        return jsonify({'error': '缺少 input_path 或 output_path'}), 400
    if not os.path.exists(input_path):
        return jsonify({'error': f'输入文件不存在: {input_path}'}), 400

    out_dir = os.path.dirname(output_path)
    if out_dir and not os.path.exists(out_dir):
        try:
            os.makedirs(out_dir, exist_ok=True)
        except Exception as e:
            return jsonify({'error': f'无法创建输出目录: {str(e)}'}), 500

    task = ConvertTask(input_path, output_path, reencode, crf)
    with tasks_lock:
        convert_tasks[task.id] = task

    thread = threading.Thread(target=run_convert_task, args=(task,))
    thread.daemon = True
    thread.start()

    return jsonify({'task_id': task.id, 'status': 'pending'})

# ---------- 异步任务状态查询 ----------
@video_bp.route('/video/task_status/<task_id>', methods=['GET'])
def video_task_status(task_id):
    """轮询任务状态"""
    with tasks_lock:
        task = convert_tasks.get(task_id)
    if not task:
        return jsonify({'error': '任务不存在'}), 404
    return jsonify({
        'status': task.status,
        'progress': task.progress,
        'message': task.message,
        'output_path': task.output_path if task.status == 'completed' else None
    })

@video_bp.route('/video/task_stream/<task_id>')
def video_task_stream(task_id):
    """SSE 推送任务进度"""
    def generate():
        last_progress = -1
        last_status = ''
        while True:
            with tasks_lock:
                task = convert_tasks.get(task_id)
            if not task:
                yield f"data: {json.dumps({'event': 'error', 'message': '任务不存在'})}\n\n"
                break
            if task.progress != last_progress or task.status != last_status:
                last_progress = task.progress
                last_status = task.status
                yield f"data: {json.dumps({'event': 'progress', 'status': task.status, 'progress': task.progress, 'message': task.message})}\n\n"
            if task.status in ('completed', 'failed'):
                break
            time.sleep(1)
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@video_bp.route('/video/cancel/<task_id>', methods=['POST'])
def cancel_convert(task_id):
    """取消正在进行的转换任务"""
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    
    with tasks_lock:
        task = convert_tasks.get(task_id)
    if not task:
        return jsonify({'error': '任务不存在'}), 404
    
    if task.status not in ('running', 'pending'):
        return jsonify({'error': f'任务状态为 {task.status}，无法取消'}), 400
    
    task.status = 'cancelled'
    task.message = '用户已取消转换'
    
    if task.process and task.process.poll() is None:
        try:
            task.process.terminate()
            task.process.wait(timeout=3)
        except:
            task.process.kill()
    
    return jsonify({'success': True, 'message': '转换已取消'})

# ---------- 批量转换文件夹的旧版 SSE 接口（保留兼容） ----------
@video_bp.route('/video/batch_convert_folder', methods=['GET'])
def batch_convert_folder():
    """批量转换文件夹内的所有.264/.h264文件，通过SSE推送进度（旧版）"""
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    
    folder_path = request.args.get('folder_path', '')
    reencode = request.args.get('reencode', 'false').lower() == 'true'
    crf = int(request.args.get('crf', 23))
    overwrite = request.args.get('overwrite', 'false').lower() == 'true'

    if not folder_path:
        return jsonify({'error': '缺少 folder_path 参数'}), 400
    if not os.path.isdir(folder_path):
        return jsonify({'error': f'文件夹不存在: {folder_path}'}), 400

    video_files = []
    for f in os.listdir(folder_path):
        lower_f = f.lower()
        if (lower_f.endswith('.264') or lower_f.endswith('.h264')) and os.path.isfile(os.path.join(folder_path, f)):
            video_files.append(f)
    if not video_files:
        return jsonify({'error': '文件夹中没有找到.264或.h264文件'}), 400

    def generate():
        yield f"data: {json.dumps({'event': 'start', 'total': len(video_files)})}\n\n"
        success_count = 0
        fail_count = 0
        for idx, filename in enumerate(video_files, 1):
            input_path = os.path.join(folder_path, filename)
            output_filename = os.path.splitext(filename)[0] + '.mp4'
            output_path = os.path.join(folder_path, output_filename)

            if os.path.exists(output_path) and not overwrite:
                yield f"data: {json.dumps({'event': 'skip', 'index': idx, 'total': len(video_files), 'filename': filename, 'message': '文件已存在，跳过'})}\n\n"
                continue

            yield f"data: {json.dumps({'event': 'file_start', 'index': idx, 'total': len(video_files), 'filename': filename})}\n\n"
            success = convert_file(input_path, output_path, reencode, crf)
            if success:
                success_count += 1
                yield f"data: {json.dumps({'event': 'file_end', 'index': idx, 'total': len(video_files), 'filename': filename, 'status': 'success', 'output': output_path})}\n\n"
            else:
                fail_count += 1
                yield f"data: {json.dumps({'event': 'file_end', 'index': idx, 'total': len(video_files), 'filename': filename, 'status': 'failed', 'error': '转换失败'})}\n\n"
        yield f"data: {json.dumps({'event': 'end', 'success_count': success_count, 'fail_count': fail_count})}\n\n"
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

# ---------- 批量转换会话管理（新版，支持取消） ----------
class BatchSession:
    def __init__(self, folder_path, reencode, crf, overwrite):
        self.id = str(uuid.uuid4())
        self.folder_path = folder_path
        self.reencode = reencode
        self.crf = crf
        self.overwrite = overwrite
        self.status = 'running'  # running, cancelled, completed
        self.video_files = []
        self.current_index = 0
        self.current_task = None
        self.success_count = 0
        self.fail_count = 0
        self.cancelled = False

def run_batch_conversion(session):
    """后台执行批量转换，通过 SSE 推送进度"""
    video_files = []
    for f in os.listdir(session.folder_path):
        lower_f = f.lower()
        if (lower_f.endswith('.264') or lower_f.endswith('.h264')) and os.path.isfile(os.path.join(session.folder_path, f)):
            video_files.append(f)
    if not video_files:
        return
    session.video_files = video_files
    total = len(video_files)
    _push_batch_event(session.id, {'event': 'start', 'total': total})
    
    for idx, filename in enumerate(video_files, 1):
        if session.cancelled:
            _push_batch_event(session.id, {'event': 'cancelled'})
            return
        session.current_index = idx
        input_path = os.path.join(session.folder_path, filename)
        output_filename = os.path.splitext(filename)[0] + '.mp4'
        output_path = os.path.join(session.folder_path, output_filename)
        if os.path.exists(output_path) and not session.overwrite:
            _push_batch_event(session.id, {'event': 'skip', 'index': idx, 'total': total, 'filename': filename, 'message': '文件已存在，跳过'})
            continue
        _push_batch_event(session.id, {'event': 'file_start', 'index': idx, 'total': total, 'filename': filename})
        
        task = ConvertTask(input_path, output_path, session.reencode, session.crf)
        session.current_task = task
        
        def progress_callback(percent, msg):
            if session.cancelled:
                return
            _push_batch_event(session.id, {'event': 'file_progress', 'index': idx, 'total': total, 'filename': filename, 'message': msg, 'progress': percent})
        
        success = convert_file_async(input_path, output_path, session.reencode, session.crf, progress_callback, task)
        session.current_task = None
        
        if session.cancelled:
            if task.process and task.process.poll() is None:
                task.process.terminate()
            _push_batch_event(session.id, {'event': 'cancelled'})
            return
        if success:
            session.success_count += 1
            _push_batch_event(session.id, {'event': 'file_end', 'index': idx, 'total': total, 'filename': filename, 'status': 'success', 'output': output_path})
        else:
            session.fail_count += 1
            _push_batch_event(session.id, {'event': 'file_end', 'index': idx, 'total': total, 'filename': filename, 'status': 'failed', 'error': '转换失败'})
    _push_batch_event(session.id, {'event': 'end', 'success_count': session.success_count, 'fail_count': session.fail_count})

def _push_batch_event(session_id, data):
    with batch_lock:
        if session_id in batch_sessions:
            batch_sessions[session_id]['events'].append(data)

@video_bp.route('/video/batch_convert_start', methods=['POST'])
def batch_convert_start():
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    data = request.get_json()
    folder_path = data.get('folder_path', '')
    reencode = data.get('reencode', False)
    crf = data.get('crf', 23)
    overwrite = data.get('overwrite', False)
    if not folder_path:
        return jsonify({'error': '缺少 folder_path'}), 400
    if not os.path.isdir(folder_path):
        return jsonify({'error': '文件夹不存在'}), 400
    session = BatchSession(folder_path, reencode, crf, overwrite)
    with batch_lock:
        batch_sessions[session.id] = {'session': session, 'events': []}
    thread = threading.Thread(target=run_batch_conversion, args=(session,))
    thread.daemon = True
    thread.start()
    return jsonify({'session_id': session.id})

@video_bp.route('/video/batch_stream/<session_id>')
def batch_stream(session_id):
    def generate():
        last_event_index = 0
        while True:
            with batch_lock:
                session_data = batch_sessions.get(session_id)
                if not session_data:
                    yield f"data: {json.dumps({'event': 'error', 'message': '会话不存在'})}\n\n"
                    break
                session = session_data['session']
                events = session_data['events']
                for i in range(last_event_index, len(events)):
                    yield f"data: {json.dumps(events[i])}\n\n"
                last_event_index = len(events)
                if session.status in ('completed', 'cancelled'):
                    break
            time.sleep(0.5)
        with batch_lock:
            if session_id in batch_sessions:
                del batch_sessions[session_id]
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@video_bp.route('/video/batch_cancel/<session_id>', methods=['POST'])
def batch_cancel(session_id):
    if not is_licensed():
        return jsonify({'error': '未授权'}), 401
    with batch_lock:
        session_data = batch_sessions.get(session_id)
        if not session_data:
            return jsonify({'error': '会话不存在'}), 404
        session = session_data['session']
        if session.cancelled:
            return jsonify({'success': True, 'message': '已取消'})
        session.cancelled = True
        if session.current_task:
            session.current_task.status = 'cancelled'
            if session.current_task.process and session.current_task.process.poll() is None:
                try:
                    session.current_task.process.terminate()
                    session.current_task.process.wait(timeout=3)
                except:
                    session.current_task.process.kill()
        session.status = 'cancelled'
    return jsonify({'success': True, 'message': '批量转换已取消'})