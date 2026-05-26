# -*- coding: utf-8 -*-
"""
YUWEITEK工具箱 - 远程授权管理后台
"""
import os
import sys
from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from flask_cors import CORS
from functools import wraps
from datetime import datetime
from config import HOST, PORT, ADMIN_PATH, SECRET_KEY
from database import (
    init_db, verify_admin, change_admin_password, log_action,
    register_machine, get_all_licenses, get_license_by_machine,
    approve_license, revoke_license, update_last_seen,
    get_stats, get_audit_logs, search_licenses, batch_delete, batch_renew,
    get_tool_permissions, set_tool_permission, set_all_tools, TOOLS,
    quick_approve, list_admins, create_admin, update_admin_password, delete_admin,
    get_admin_by_id, block_license, unblock_license, sync_local_status,
    delete_license, is_deleted_device, batch_delete_permanent, reactivate_license
)

app = Flask(__name__)
app.secret_key = SECRET_KEY
CORS(app, supports_credentials=True)


@app.route('/')
def root_redirect():
    return redirect(ADMIN_PATH + '/')


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return redirect(ADMIN_PATH + '/login')
        return f(*args, **kwargs)
    return decorated


# ========== 客户端 API ==========

@app.route('/api/verify', methods=['POST'])
def api_verify():
    try:
        data = request.get_json() or {}
        machine_code = data.get('machine_code', '').strip()
        license_code = data.get('license_code', '').strip()
        user_name = data.get('user_name', '').strip()
        has_local = data.get('has_local_license', False)

        if not machine_code:
            return jsonify({'valid': False, 'message': '缺少 machine_code'}), 400

        # 同步本地授权状态
        sync_local_status(machine_code, has_local, user_name)
        update_last_seen(machine_code)
        if user_name:
            from database import update_user_name
            update_user_name(machine_code, user_name)

        record = get_license_by_machine(machine_code)

        if not record:
            # 新设备，自动注册
            register_machine(machine_code, user_name, '', has_local)
            record = get_license_by_machine(machine_code)
            if not record:
                return jsonify({'valid': False, 'status': 'pending', 'message': '设备已注册，等待管理员审核'})

        # 被删除的设备 → 检查是否带了授权码（重新激活）
        if record['status'] == 'deleted':
            if license_code:
                # 用户带了授权码 → 重新激活
                reactivate_license(machine_code, license_code)
                record = get_license_by_machine(machine_code)
                # 继续走下面的 approved 流程
            else:
                # 没有授权码 → 返回 deleted，等用户手动输入
                return jsonify({'valid': False, 'status': 'deleted', 'message': '设备授权已被删除，请重新输入授权码激活'})

        if record['blocked']:
            return jsonify({'valid': False, 'status': 'blocked', 'message': '设备已被拉黑，请联系管理员'})

        if record['status'] == 'deleted':
            return jsonify({'valid': False, 'status': 'deleted', 'message': '设备授权已被删除，请联系管理员重新授权'})

        if record['status'] == 'revoked':
            return jsonify({'valid': False, 'status': 'revoked', 'message': '授权已被收回，请联系管理员'})

        if record['status'] == 'pending':
            return jsonify({'valid': False, 'status': 'pending', 'message': '授权审核中，请等待管理员审批'})

        if record['status'] == 'approved':
            if record['expire_date'] and record['expire_date'] not in ('永久', '永久授权', ''):
                try:
                    expire = datetime.strptime(record['expire_date'], '%Y-%m-%d')
                    if datetime.now() > expire:
                        return jsonify({'valid': False, 'status': 'expired',
                                        'message': f'授权已过期（{record["expire_date"]}），请联系管理员续期'})
                except ValueError:
                    pass  # 日期格式异常则视为永久
            tools = get_tool_permissions(machine_code)
            return jsonify({
                'valid': True, 'status': 'approved',
                'expire': record['expire_date'] or '永久',
                'tools': tools, 'message': '授权有效',
                'license_code': record.get('license_code', '')
            })

        return jsonify({'valid': False, 'status': 'unknown', 'message': '未知状态'})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'valid': False, 'message': f'服务器内部错误: {str(e)}'}), 500


@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json() or {}
    machine_code = data.get('machine_code', '').strip()
    user_name = data.get('user_name', '').strip()
    granted_to = data.get('granted_to', '').strip()
    has_local = data.get('has_local_license', False)
    print(f"[REGISTER] mc={machine_code[:16]}... user={user_name} has_local={has_local}")
    if not machine_code:
        return jsonify({'success': False, 'message': '缺少 machine_code'}), 400
    is_new = register_machine(machine_code, user_name, granted_to, has_local)
    print(f"[REGISTER] result: is_new={is_new}")
    return jsonify({'success': True, 'message': '已提交注册，等待管理员审批' if is_new else '设备已注册'})


# ========== 管理后台 ==========

@app.route(ADMIN_PATH + '/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'GET':
        return render_template('login.html', admin_path=ADMIN_PATH)
    username = request.form.get('username', '')
    password = request.form.get('password', '')
    admin = verify_admin(username, password)
    if admin:
        session['admin_logged_in'] = True
        session['admin_user'] = username
        session['admin_role'] = admin['role']
        session['admin_id'] = admin['id']
        log_action('管理员登录', '', '', username)
        return redirect(ADMIN_PATH + '/')
    return render_template('login.html', admin_path=ADMIN_PATH, error='用户名或密码错误')


@app.route(ADMIN_PATH + '/logout')
def admin_logout():
    session.clear()
    return redirect(ADMIN_PATH + '/login')


@app.route(ADMIN_PATH + '/')
@admin_required
def admin_dashboard():
    stats = get_stats()
    # 待审核列表直接从数据库取，跟授权管理同步
    pending = get_all_licenses('pending')
    return render_template('dashboard.html', admin_path=ADMIN_PATH, stats=stats,
                         pending_list=pending,
                         admin_user=session.get('admin_user', 'admin'), admin_role=session.get('admin_role', 'admin'))


@app.route(ADMIN_PATH + '/licenses')
@admin_required
def admin_licenses():
    status = request.args.get('status', '')
    keyword = request.args.get('q', '')
    if status == 'blocked':
        # 筛选拉黑的设备
        from database import get_blocked_licenses
        licenses = get_blocked_licenses()
        if keyword:
            licenses = [l for l in licenses if keyword.lower() in (l.get('machine_code','') + l.get('user_name','') + l.get('note','')).lower()]
    elif keyword:
        licenses = search_licenses(keyword, include_blocked=True)
        if status:
            licenses = [l for l in licenses if l['status'] == status]
    else:
        licenses = get_all_licenses(status if status else None, include_blocked=True)
    return render_template('licenses.html', admin_path=ADMIN_PATH, licenses=licenses,
                         current_status=status, search_q=keyword,
                         admin_user=session.get('admin_user', 'admin'), admin_role=session.get('admin_role', 'admin'))


@app.route(ADMIN_PATH + '/approve', methods=['POST'])
@admin_required
def admin_approve():
    machine_code = request.form.get('machine_code', '')
    license_code = request.form.get('license_code', '')
    expire_date = request.form.get('expire_date', '')
    user_name = request.form.get('user_name', '')
    note = request.form.get('note', '')
    operator = session.get('admin_user', 'admin')
    if not machine_code:
        return jsonify({'success': False, 'message': '缺少机器码'}), 400
    # 如果没填授权码，自动生成（远程授权模式）
    if not license_code:
        quick_approve(machine_code, expire_date, operator, user_name=user_name, note=note)
        return jsonify({'success': True, 'message': '授权成功'})
    approve_license(machine_code, license_code, expire_date, operator)
    return jsonify({'success': True, 'message': '授权成功'})


@app.route(ADMIN_PATH + '/export')
@admin_required
def admin_export():
    """导出授权记录为 xlsx"""
    import openpyxl
    from io import BytesIO
    licenses = get_all_licenses()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = '授权记录'
    # 表头
    headers = ['序号', '机器码', '用户名', '授权人', '状态', '授权方式', '授权码', '有效期', '备注', '注册时间']
    ws.append(headers)
    # 数据
    status_map = {'pending': '待审核', 'approved': '已授权', 'revoked': '已收回'}
    auth_map = {'local': '本地', 'remote': '远程'}
    for i, lic in enumerate(licenses, 1):
        ws.append([
            i,
            lic['machine_code'],
            lic.get('user_name', ''),
            lic.get('operator', ''),
            status_map.get(lic['status'], lic['status']),
            auth_map.get(lic.get('auth_source', ''), lic.get('auth_source', '')),
            lic.get('license_code', ''),
            lic.get('expire_date', '') or '永久',
            lic.get('note', ''),
            lic.get('created_at', ''),
        ])
    # 列宽
    ws.column_dimensions['A'].width = 6
    ws.column_dimensions['B'].width = 20
    ws.column_dimensions['C'].width = 12
    ws.column_dimensions['D'].width = 12
    ws.column_dimensions['E'].width = 8
    ws.column_dimensions['F'].width = 8
    ws.column_dimensions['G'].width = 25
    ws.column_dimensions['H'].width = 12
    ws.column_dimensions['I'].width = 20
    ws.column_dimensions['J'].width = 20
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    from flask import send_file
    return send_file(buf, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name='license.xlsx')


@app.route(ADMIN_PATH + '/revoke', methods=['POST'])
@admin_required
def admin_revoke():
    machine_code = request.form.get('machine_code', '')
    operator = session.get('admin_user', 'admin')
    if not machine_code:
        return jsonify({'success': False, 'message': '缺少机器码'}), 400
    block_license(machine_code, operator)
    return jsonify({'success': True, 'message': '已拉黑'})


@app.route(ADMIN_PATH + '/block', methods=['POST'])
@admin_required
def admin_block():
    machine_code = request.form.get('machine_code', '')
    operator = session.get('admin_user', 'admin')
    if not machine_code:
        return jsonify({'success': False, 'message': '缺少机器码'}), 400
    block_license(machine_code, operator)
    return jsonify({'success': True, 'message': '已拉黑'})


@app.route(ADMIN_PATH + '/unblock', methods=['POST'])
@admin_required
def admin_unblock():
    machine_code = request.form.get('machine_code', '')
    operator = session.get('admin_user', 'admin')
    if not machine_code:
        return jsonify({'success': False, 'message': '缺少机器码'}), 400
    unblock_license(machine_code, operator)
    return jsonify({'success': True, 'message': '已解除拉黑'})


@app.route(ADMIN_PATH + '/delete', methods=['POST'])
@admin_required
def admin_delete():
    machine_code = request.form.get('machine_code', '')
    operator = session.get('admin_user', 'admin')
    if not machine_code:
        return jsonify({'success': False, 'message': '缺少机器码'}), 400
    delete_license(machine_code, operator)
    return jsonify({'success': True, 'message': '已删除'})


@app.route(ADMIN_PATH + '/batch_delete', methods=['POST'])
@admin_required
def admin_batch_delete():
    data = request.get_json() or {}
    codes = data.get('machine_codes', [])
    operator = session.get('admin_user', 'admin')
    if not codes:
        return jsonify({'success': False, 'message': '未选择设备'}), 400
    count = batch_delete(codes, operator)
    return jsonify({'success': True, 'message': f'已拉黑 {count} 台设备'})


@app.route(ADMIN_PATH + '/batch_delete_permanent', methods=['POST'])
@admin_required
def admin_batch_delete_permanent():
    data = request.get_json() or {}
    codes = data.get('machine_codes', [])
    operator = session.get('admin_user', 'admin')
    if not codes:
        return jsonify({'success': False, 'message': '未选择设备'}), 400
    from database import batch_delete_permanent
    count = batch_delete_permanent(codes, operator)
    return jsonify({'success': True, 'message': f'已删除 {count} 条记录'})


@app.route(ADMIN_PATH + '/batch_renew', methods=['POST'])
@admin_required
def admin_batch_renew():
    data = request.get_json() or {}
    codes = data.get('machine_codes', [])
    expire_date = data.get('expire_date', '')
    note = data.get('note', '')
    operator = session.get('admin_user', 'admin')
    if not codes:
        return jsonify({'success': False, 'message': '未选择设备'}), 400
    count = batch_renew(codes, expire_date, operator, note=note)
    return jsonify({'success': True, 'message': f'已续期 {count} 条记录'})


# ========== 工具权限管理 ==========

@app.route(ADMIN_PATH + '/permissions')
@admin_required
def admin_permissions():
    # 获取所有已授权用户及其权限
    licenses = get_all_licenses('approved')
    users = []
    for lic in licenses:
        perms = get_tool_permissions(lic['machine_code'])
        users.append({**lic, 'tools': perms})
    return render_template('permissions.html', admin_path=ADMIN_PATH, users=users,
                         tools=TOOLS, admin_user=session.get('admin_user', 'admin'), admin_role=session.get('admin_role', 'admin'))


@app.route(ADMIN_PATH + '/toggle_tool', methods=['POST'])
@admin_required
def admin_toggle_tool():
    data = request.get_json() or {}
    mc = data.get('machine_code', '')
    tool_key = data.get('tool_key', '')
    enabled = data.get('enabled', True)
    operator = session.get('admin_user', 'admin')
    if not mc or not tool_key:
        return jsonify({'success': False, 'message': '参数不完整'}), 400
    set_tool_permission(mc, tool_key, enabled, operator)
    return jsonify({'success': True, 'message': '已更新'})


@app.route(ADMIN_PATH + '/toggle_all_tools', methods=['POST'])
@admin_required
def admin_toggle_all_tools():
    data = request.get_json() or {}
    mc = data.get('machine_code', '')
    enabled = data.get('enabled', True)
    operator = session.get('admin_user', 'admin')
    if not mc:
        return jsonify({'success': False, 'message': '缺少机器码'}), 400
    set_all_tools(mc, enabled, operator)
    return jsonify({'success': True, 'message': '已更新全部工具'})


# ========== 其他 ==========

@app.route(ADMIN_PATH + '/import', methods=['GET', 'POST'])
@admin_required
def admin_import():
    if request.method == 'GET':
        return render_template('import.html', admin_path=ADMIN_PATH,
                             admin_user=session.get('admin_user', 'admin'), admin_role=session.get('admin_role', 'admin'))
    file = request.files.get('file')
    if not file or not file.filename.endswith('.xlsx'):
        return render_template('import.html', admin_path=ADMIN_PATH,
                             admin_user=session.get('admin_user', 'admin'), error='请上传 .xlsx 文件')
    try:
        import openpyxl
        wb = openpyxl.load_workbook(file.stream)
        ws = wb.active
        headers = {}
        for cell in ws[1]:
            val = str(cell.value or '').strip()
            if '机器码' in val or 'machine' in val.lower():
                headers['machine_code'] = cell.column - 1
            elif '授权码' in val or 'license' in val.lower():
                headers['license_code'] = cell.column - 1
            elif '有效期' in val or 'expire' in val.lower():
                headers['expire_date'] = cell.column - 1
            elif '授权给' in val:
                headers['granted_to'] = cell.column - 1
            elif '用户名' in val:
                headers['user_name'] = cell.column - 1
            elif '授权人' in val:
                headers['operator'] = cell.column - 1
            elif '状态' in val:
                headers['status'] = cell.column - 1
            elif '授权方式' in val:
                headers['auth_source'] = cell.column - 1
            elif '备注' in val or 'note' in val.lower():
                headers['note'] = cell.column - 1
        if 'machine_code' not in headers:
            return render_template('import.html', admin_path=ADMIN_PATH,
                                 admin_user=session.get('admin_user', 'admin'),
                                 error='未找到"机器码"列')
        status_map = {'已授权': 'approved', '待审核': 'pending', '已收回': 'revoked'}
        auth_map = {'本地': 'local', '远程': 'remote'}
        records = []
        for row in ws.iter_rows(min_row=2, values_only=True):
            row = list(row)
            raw_status = str(row[headers.get('status', -1)] or '').strip() if 'status' in headers else ''
            raw_auth = str(row[headers.get('auth_source', -1)] or '').strip() if 'auth_source' in headers else ''
            rec = {
                'machine_code': str(row[headers['machine_code']] or '').strip(),
                'license_code': str(row[headers.get('license_code', -1)] or '').strip() if 'license_code' in headers else '',
                'expire_date': str(row[headers.get('expire_date', -1)] or '').strip() if 'expire_date' in headers else '',
                'granted_to': str(row[headers.get('granted_to', -1)] or '').strip() if 'granted_to' in headers else '',
                'user_name': str(row[headers.get('user_name', -1)] or '').strip() if 'user_name' in headers else '',
                'operator': str(row[headers.get('operator', -1)] or '').strip() if 'operator' in headers else '',
                'note': str(row[headers.get('note', -1)] or '').strip() if 'note' in headers else '',
                'status': status_map.get(raw_status, raw_status) if raw_status else '',
                'auth_source': auth_map.get(raw_auth, raw_auth) if raw_auth else '',
                'import_operator': session.get('admin_user', 'admin'),
            }
            if rec['machine_code']:
                records.append(rec)
        from database import bulk_import
        success, skipped, errors = bulk_import(records, session.get('admin_user', 'admin'))
        return render_template('import.html', admin_path=ADMIN_PATH,
                             admin_user=session.get('admin_user', 'admin'),
                             success=f'导入完成：成功 {success} 条，跳过 {skipped} 条', errors=errors)
    except Exception as e:
        return render_template('import.html', admin_path=ADMIN_PATH,
                             admin_user=session.get('admin_user', 'admin'), error=f'解析失败: {str(e)}')


@app.route(ADMIN_PATH + '/logs')
@admin_required
def admin_logs():
    logs = get_audit_logs(200)
    return render_template('logs.html', admin_path=ADMIN_PATH, logs=logs,
                         admin_user=session.get('admin_user', 'admin'), admin_role=session.get('admin_role', 'admin'))


@app.route(ADMIN_PATH + '/password', methods=['GET', 'POST'])
@admin_required
def admin_password():
    if request.method == 'GET':
        return render_template('password.html', admin_path=ADMIN_PATH,
                             admin_user=session.get('admin_user', 'admin'), admin_role=session.get('admin_role', 'admin'))
    old_pwd = request.form.get('old_password', '')
    new_pwd = request.form.get('new_password', '')
    confirm = request.form.get('confirm_password', '')
    if not verify_admin(session.get('admin_user', 'admin'), old_pwd):
        return render_template('password.html', admin_path=ADMIN_PATH, error='原密码错误')
    if new_pwd != confirm:
        return render_template('password.html', admin_path=ADMIN_PATH, error='两次密码不一致')
    if len(new_pwd) < 6:
        return render_template('password.html', admin_path=ADMIN_PATH, error='密码至少6位')
    change_admin_password(session.get('admin_user', 'admin'), new_pwd)
    log_action('修改密码', '', '', session.get('admin_user', 'admin'))
    return render_template('password.html', admin_path=ADMIN_PATH, success='密码修改成功')


# ========== 管理员管理 ==========

@app.route(ADMIN_PATH + '/admins')
@admin_required
def admin_manage():
    if session.get('admin_role') != 'super_admin':
        return redirect(ADMIN_PATH + '/')
    admins = list_admins()
    return render_template('admins.html', admin_path=ADMIN_PATH, admins=admins,
                         admin_user=session.get('admin_user', 'admin'),
                         admin_role=session.get('admin_role'))


@app.route(ADMIN_PATH + '/admins/create', methods=['POST'])
@admin_required
def admin_create():
    if session.get('admin_role') != 'super_admin':
        return jsonify({'success': False, 'message': '权限不足'}), 403
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '').strip()
    role = request.form.get('role', 'admin')
    if not username or not password:
        return jsonify({'success': False, 'message': '用户名和密码不能为空'})
    if len(password) < 6:
        return jsonify({'success': False, 'message': '密码至少6位'})
    ok, msg = create_admin(username, password, role)
    return jsonify({'success': ok, 'message': msg})


@app.route(ADMIN_PATH + '/admins/reset_password', methods=['POST'])
@admin_required
def admin_reset_pwd():
    if session.get('admin_role') != 'super_admin':
        return jsonify({'success': False, 'message': '权限不足'}), 403
    admin_id = request.form.get('admin_id', '')
    new_pwd = request.form.get('new_password', '').strip()
    if not admin_id or not new_pwd:
        return jsonify({'success': False, 'message': '参数不完整'})
    if len(new_pwd) < 6:
        return jsonify({'success': False, 'message': '密码至少6位'})
    update_admin_password(int(admin_id), new_pwd)
    return jsonify({'success': True, 'message': '密码已重置'})


@app.route(ADMIN_PATH + '/admins/delete', methods=['POST'])
@admin_required
def admin_del():
    if session.get('admin_role') != 'super_admin':
        return jsonify({'success': False, 'message': '权限不足'}), 403
    admin_id = request.form.get('admin_id', '')
    if not admin_id:
        return jsonify({'success': False, 'message': '缺少ID'})
    ok, msg = delete_admin(int(admin_id))
    return jsonify({'success': ok, 'message': msg})


if __name__ == '__main__':
    print("=" * 50)
    print("  YUWEITEK工具箱 - 远程授权管理后台")
    print("=" * 50)
    print(f"  管理后台: http://127.0.0.1:{PORT}{ADMIN_PATH}")
    print(f"  API 验证: http://127.0.0.1:{PORT}/api/verify")
    print("=" * 50)
    init_db()
    app.run(host=HOST, port=PORT, debug=False)
