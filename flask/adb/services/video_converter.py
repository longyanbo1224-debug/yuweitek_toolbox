# -*- coding: utf-8 -*-
import os
import sys
import subprocess
import re
import threading
import time
from datetime import datetime


def get_ffmpeg_path():
    """获取ffmpeg.exe的路径，适配PyInstaller打包后的环境"""
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        # 开发环境：video_converter.py 位于 flask/adb 目录，向上取一级到 flask 根目录
        script_dir = os.path.dirname(os.path.abspath(__file__))
        base_path = os.path.dirname(script_dir)   # flask 根目录
    ffmpeg_path = os.path.join(base_path, 'ffmpeg.exe')
    if not os.path.exists(ffmpeg_path):
        # 兼容旧路径：尝试在脚本同级目录查找
        ffmpeg_path = os.path.join(os.path.dirname(__file__), 'ffmpeg.exe')
    return ffmpeg_path


def get_total_frames(input_path):
    """使用 ffprobe 获取视频总帧数，隐藏窗口"""
    ffmpeg_path = get_ffmpeg_path()
    ffprobe_path = ffmpeg_path.replace('ffmpeg.exe', 'ffprobe.exe')
    if not os.path.exists(ffprobe_path):
        return None
    cmd = [ffprobe_path, '-v', 'error', '-select_streams', 'v:0', '-count_packets',
           '-show_entries', 'stream=nb_read_packets', '-of', 'default=nokey=1:noprint_wrappers=1', input_path]
    
    # 隐藏窗口
    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10,
            startupinfo=startupinfo,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        )
        if result.returncode == 0 and result.stdout.strip().isdigit():
            return int(result.stdout.strip())
    except:
        pass
    return None


def check_ffmpeg():
    ffmpeg_path = get_ffmpeg_path()
    if os.path.exists(ffmpeg_path):
        return True
    try:
        subprocess.run(['ffmpeg', '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return True
    except (subprocess.SubprocessError, FileNotFoundError):
        return False


def convert_file(input_path, output_path, reencode=False, crf=23):
    """同步转换，无进度回调，隐藏窗口"""
    try:
        ffmpeg_path = get_ffmpeg_path()
        # 添加 -err_detect ignore_err 忽略非致命错误
        cmd = [ffmpeg_path, '-err_detect', 'ignore_err', '-i', input_path, '-f', 'mp4', '-y']
        if reencode:
            cmd.extend(['-c:v', 'libx264', '-crf', str(crf)])
        else:
            cmd.extend(['-c:v', 'copy'])
        cmd.append(output_path)

        # 隐藏窗口
        startupinfo = None
        if sys.platform == 'win32':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

        # 增加超时时间到 1800 秒（30分钟）
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=1800,
            startupinfo=startupinfo,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        )

        # 检查返回码，但允许某些非致命错误（如警告）
        if result.returncode != 0:
            # 如果输出文件已生成且大小大于0，可能只是警告，视为成功
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                print(f"警告：FFmpeg 返回非零但输出文件有效 ({output_path})", file=sys.stderr)
                return True
            else:
                error_msg = f"FFmpeg 错误 (returncode {result.returncode}):\nSTDERR: {result.stderr}\nSTDOUT: {result.stdout}"
                print(error_msg, file=sys.stderr)
                # 写入日志文件
                log_path = os.path.join(os.path.dirname(__file__), 'ffmpeg_error.log')
                with open(log_path, 'a', encoding='utf-8') as f:
                    f.write(f"{datetime.now()} - {input_path}\n{error_msg}\n\n")
                return False
        return True

    except subprocess.TimeoutExpired:
        print(f"转换超时 (>{1800}秒): {input_path}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"处理文件时出错 {input_path}: {str(e)}", file=sys.stderr)
        return False


def batch_convert(folder_path, reencode=False, crf=23, overwrite=False):
    if not os.path.isdir(folder_path):
        print(f"错误: 文件夹 '{folder_path}' 不存在", file=sys.stderr)
        return 0, 0

    video_files = []
    for f in os.listdir(folder_path):
        lower_f = f.lower()
        if (lower_f.endswith('.264') or lower_f.endswith('.h264')) and os.path.isfile(os.path.join(folder_path, f)):
            video_files.append(f)

    if not video_files:
        print(f"在 '{folder_path}' 中未找到任何.264或.h264文件")
        return 0, 0

    success_count = 0
    fail_count = 0
    print(f"找到 {len(video_files)} 个视频文件，开始转换...")

    for i, filename in enumerate(video_files, 1):
        input_path = os.path.join(folder_path, filename)
        output_filename = os.path.splitext(filename)[0] + '.mp4'
        output_path = os.path.join(folder_path, output_filename)

        if os.path.exists(output_path) and not overwrite:
            print(f"({i}/{len(video_files)}) 已存在，跳过: {output_filename}")
            continue

        print(f"({i}/{len(video_files)}) 正在转换: {filename}")
        if convert_file(input_path, output_path, reencode, crf):
            success_count += 1
            print(f"({i}/{len(video_files)}) 转换成功: {output_filename}")
        else:
            fail_count += 1
            print(f"({i}/{len(video_files)}) 转换失败: {filename}")

    return success_count, fail_count


def convert_file_async(input_path, output_path, reencode=False, crf=23, progress_callback=None, task=None):
    ffmpeg_path = get_ffmpeg_path()
    # 获取总帧数（可选）
    total_frames = get_total_frames(input_path)

    cmd = [ffmpeg_path, '-i', input_path, '-f', 'mp4', '-y']
    if reencode:
        cmd.extend(['-c:v', 'libx264', '-crf', str(crf)])
    else:
        cmd.extend(['-c:v', 'copy'])
    cmd.append(output_path)

    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        startupinfo=startupinfo,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
    )
    # 保存进程引用到 task，以便取消
    if task:
        task.process = process

    duration = None
    duration_pattern = re.compile(r'Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})')
    time_pattern = re.compile(r'out_time_ms=(\d+)')
    frame_pattern = re.compile(r'frame=\s*(\d+)')
    last_frame = 0

    for line in iter(process.stderr.readline, ''):
        if not line:
            break
        # 检查取消标志
        if task and task.status == 'cancelled':
            process.terminate()
            process.wait(timeout=2)
            return False
        # 获取总时长
        if duration is None:
            match = duration_pattern.search(line)
            if match:
                h, m, s = match.groups()
                duration = int(h) * 3600 + int(m) * 60 + float(s)
        if duration:
            match = time_pattern.search(line)
            if match:
                ms = int(match.group(1))
                current = ms / 1_000_000.0
                percent = min(100, int(current / duration * 100))
                if progress_callback:
                    # 如果有总帧数，可以同时显示帧数信息
                    frame_info = f" ({last_frame}/{total_frames} 帧)" if total_frames and last_frame > 0 else ""
                    progress_callback(percent, f"转换中... {percent}%{frame_info}")
                continue
        match = frame_pattern.search(line)
        if match:
            frame = int(match.group(1))
            if frame != last_frame:
                last_frame = frame
                if progress_callback:
                    if total_frames:
                        percent = min(100, int(frame / total_frames * 100))
                        progress_callback(percent, f"编码中... {percent}% ({frame}/{total_frames} 帧)")
                    else:
                        progress_callback(0, f"编码中... 已处理 {frame} 帧")

    process.wait()
    if progress_callback:
        if process.returncode == 0:
            progress_callback(100, "转换完成")
        else:
            progress_callback(0, "转换失败")
    return process.returncode == 0