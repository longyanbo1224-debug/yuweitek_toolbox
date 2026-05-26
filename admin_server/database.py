import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta
from config import DB_FILE, DEFAULT_LICENSE_DAYS

# 工具列表
TOOLS = [
    ('jt808',       'JT808协议解析'),
    ('jt809',       'JT809协议解析'),
    ('jt1078',      'JT1078协议解析'),
    ('jt19056',     'JT19056协议解析'),
    ('jt905',       'JT905协议解析'),
    ('safety',      '主动安全协议'),
    ('hex',         'Hex转换工具'),
    ('data_fields', '数据字段处理工具集'),
    ('geo',         '经纬度查询'),
    ('h264',        'H264转MP4'),
    ('cloud_mon',   '云Monitor'),
    ('adb',         'ADB命令调试'),
    ('rare_char',   '生僻字查询'),
    ('time_calc',   '时间计算器'),
    ('nautical',    '海里公里转换'),
    ('timestamp',   '时间戳转换'),
]

def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_code TEXT UNIQUE NOT NULL,
        user_name TEXT DEFAULT '',
        granted_to TEXT DEFAULT '',
        operator TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        license_code TEXT DEFAULT '',
        expire_date TEXT DEFAULT '',
        note TEXT DEFAULT '',
        auth_source TEXT DEFAULT 'remote',
        blocked INTEGER DEFAULT 0,
        last_seen TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
    )''')

    # 升级：加 blocked 列（已有则跳过）
    try:
        c.execute("ALTER TABLE licenses ADD COLUMN blocked INTEGER DEFAULT 0")
    except:
        pass

    c.execute('''CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        target TEXT DEFAULT '',
        detail TEXT DEFAULT '',
        operator TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS tool_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_code TEXT NOT NULL,
        tool_key TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        note TEXT DEFAULT '',
        UNIQUE(machine_code, tool_key)
    )''')

    # 默认超级管理员
    from config import ADMIN_USERNAME, ADMIN_PASSWORD
    c.execute("SELECT id FROM admins WHERE username=?", (ADMIN_USERNAME,))
    if not c.fetchone():
        pwd_hash = hashlib.sha256(ADMIN_PASSWORD.encode()).hexdigest()
        c.execute("INSERT INTO admins (username, password_hash, role) VALUES (?, ?, 'super_admin')",
                  (ADMIN_USERNAME, pwd_hash))
        print(f"[OK] default super admin created: {ADMIN_USERNAME}")

    conn.commit()
    conn.close()


# ====== 管理员 ======

def verify_admin(username, password):
    conn = get_db()
    c = conn.cursor()
    pwd_hash = hashlib.sha256(password.encode()).hexdigest()
    c.execute("SELECT id, role FROM admins WHERE username=? AND password_hash=?", (username, pwd_hash))
    result = c.fetchone()
    conn.close()
    if result:
        return {'id': result['id'], 'username': username, 'role': result['role']}
    return None


def get_admin_by_id(admin_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, username, role, created_at FROM admins WHERE id=?", (admin_id,))
    result = c.fetchone()
    conn.close()
    return dict(result) if result else None


def list_admins():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, username, role, created_at FROM admins ORDER BY id")
    results = [dict(r) for r in c.fetchall()]
    conn.close()
    return results


def create_admin(username, password, role='admin'):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM admins WHERE username=?", (username,))
    if c.fetchone():
        conn.close()
        return False, '用户名已存在'
    pwd_hash = hashlib.sha256(password.encode()).hexdigest()
    c.execute("INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)",
              (username, pwd_hash, role))
    conn.commit()
    conn.close()
    log_action('创建管理员', username, f'角色: {role}')
    return True, '创建成功'


def update_admin_password(admin_id, new_password):
    conn = get_db()
    c = conn.cursor()
    pwd_hash = hashlib.sha256(new_password.encode()).hexdigest()
    c.execute("UPDATE admins SET password_hash=? WHERE id=?", (pwd_hash, admin_id))
    conn.commit()
    conn.close()
    log_action('修改管理员密码', str(admin_id))


def delete_admin(admin_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT username, role FROM admins WHERE id=?", (admin_id,))
    row = c.fetchone()
    if row and row['role'] == 'super_admin':
        conn.close()
        return False, '不能删除超级管理员'
    c.execute("DELETE FROM admins WHERE id=? AND role!='super_admin'", (admin_id,))
    conn.commit()
    conn.close()
    log_action('删除管理员', row['username'] if row else str(admin_id))
    return True, '删除成功'


def change_admin_password(username, new_password):
    conn = get_db()
    c = conn.cursor()
    pwd_hash = hashlib.sha256(new_password.encode()).hexdigest()
    c.execute("UPDATE admins SET password_hash=? WHERE username=?", (pwd_hash, username))
    conn.commit()
    conn.close()


# ====== 授权 ======

def register_machine(machine_code, user_name='', granted_to='', has_local=False):
    """注册设备。被拉黑的设备不会自动注册。"""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, status, blocked FROM licenses WHERE machine_code=?", (machine_code,))
    row = c.fetchone()

    if row:
        # 已存在
        if row['blocked']:
            # 被拉黑 → 不处理
            conn.close()
            return False
        # 被删除的设备 → 允许重新注册为 pending
        if row['status'] == 'deleted':
            c.execute("""UPDATE licenses SET status='pending', auth_source=?, user_name=?,
                        last_seen=datetime('now','localtime'), updated_at=datetime('now','localtime')
                        WHERE machine_code=?""",
                      ('remote' if not has_local else 'local', user_name, machine_code))
            conn.commit()
            conn.close()
            log_action('设备重新注册', machine_code, f'用户: {user_name}，等待审核')
            print(f"[DB] deleted→pending: {machine_code[:16]}...")
            return True
        # 只更新在线时间，不覆盖已有的用户名
        c.execute("UPDATE licenses SET last_seen=datetime('now','localtime') WHERE machine_code=?",
                  (machine_code,))
        # 本地授权了但还是 pending → 自动批准
        if has_local and row['status'] == 'pending':
            license_code = 'LOCAL-' + secrets.token_hex(8)
            c.execute("""UPDATE licenses SET status='approved', license_code=?, auth_source='local',
                        updated_at=datetime('now','localtime') WHERE machine_code=? AND status='pending'""",
                      (license_code, machine_code))
            log_action('本地授权上报', machine_code, f'用户: {user_name}，自动批准')
            print(f"[DB] pending→approved: {machine_code[:16]}...")
        # 已批准但 auth_source 不对 → 同步为 local
        elif has_local and row['status'] == 'approved' and row['auth_source'] != 'local':
            c.execute("UPDATE licenses SET auth_source='local', updated_at=datetime('now','localtime') WHERE machine_code=?",
                      (machine_code,))
            log_action('授权方式同步', machine_code, f'远程→本地')
            print(f"[DB] auth_source→local: {machine_code[:16]}...")
        conn.commit()
        conn.close()
        return False

    # 新设备（无论是否有本地授权，都先注册为 pending，等管理员审批）
    if has_local:
        license_code = 'LOCAL-' + secrets.token_hex(8)
        c.execute("""INSERT INTO licenses (machine_code, user_name, granted_to, status, license_code, auth_source, last_seen)
                     VALUES (?, ?, ?, 'pending', ?, 'local', datetime('now','localtime'))""",
                  (machine_code, user_name, granted_to, license_code))
        conn.commit()
        conn.close()
        log_action('本地授权上报', machine_code, f'用户: {user_name}，等待审核')
        print(f"[DB] 新设备(本地授权,待审核): {machine_code[:16]}...")
        return True
    else:
        c.execute("""INSERT INTO licenses (machine_code, user_name, granted_to, status, auth_source, last_seen)
                     VALUES (?, ?, ?, 'pending', 'remote', datetime('now','localtime'))""",
                  (machine_code, user_name, granted_to))
        conn.commit()
        conn.close()
        log_action('新机器注册', machine_code, f'用户: {user_name}，等待审核')
        print(f"[DB] 新设备(待审核): {machine_code[:16]}...")
        return True


def sync_local_status(machine_code, has_local=False, user_name=''):
    """
    verify 时同步本地授权状态（只处理已有设备，不创建新设备，不自动批准）。
    - 设备已存在 + has_local=True + 已批准 → 同步 auth_source 为 local
    - 设备已存在 + has_local=True + 被拉黑 → 不处理
    - 设备不存在 → 不处理（由 register_machine 处理为 pending）
    """
    if not has_local:
        return
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, status, blocked, auth_source FROM licenses WHERE machine_code=?", (machine_code,))
    row = c.fetchone()

    if row and not row['blocked'] and row['status'] == 'approved':
        if row['auth_source'] != 'local':
            c.execute("UPDATE licenses SET auth_source='local', last_seen=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE machine_code=?",
                      (machine_code,))
            conn.commit()
            print(f"[SYNC] auth_source→local: {machine_code[:16]}...")
        else:
            c.execute("UPDATE licenses SET last_seen=datetime('now','localtime') WHERE machine_code=?",
                      (machine_code,))
            conn.commit()
    conn.close()


def get_all_licenses(status=None, include_blocked=False):
    conn = get_db()
    c = conn.cursor()
    if include_blocked:
        if status:
            c.execute("SELECT * FROM licenses WHERE status=? ORDER BY id DESC", (status,))
        else:
            c.execute("SELECT * FROM licenses ORDER BY id DESC")
    else:
        if status:
            c.execute("SELECT * FROM licenses WHERE status=? AND blocked=0 ORDER BY id DESC", (status,))
        else:
            c.execute("SELECT * FROM licenses WHERE blocked=0 ORDER BY id DESC")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


def get_license_by_machine(machine_code):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM licenses WHERE machine_code=?", (machine_code,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def approve_license(machine_code, license_code, expire_date, operator='admin'):
    conn = get_db()
    c = conn.cursor()
    # 保持已有的 auth_source，授权时不再覆盖
    c.execute("SELECT auth_source FROM licenses WHERE machine_code=?", (machine_code,))
    row = c.fetchone()
    auth_source = row['auth_source'] if row else 'remote'
    c.execute("""UPDATE licenses SET status='approved', license_code=?, expire_date=?,
                auth_source=?, blocked=0, operator=?, updated_at=datetime('now','localtime') WHERE machine_code=?""",
              (license_code, expire_date, auth_source, operator, machine_code))
    for tool_key, _ in TOOLS:
        c.execute("INSERT OR IGNORE INTO tool_permissions (machine_code, tool_key, enabled) VALUES (?, ?, 1)",
                  (machine_code, tool_key))
    conn.commit()
    conn.close()
    log_action('授权', machine_code, f'到期: {expire_date or "永久"}', operator)


def quick_approve(machine_code, expire_date='', operator='admin', user_name='', note=''):
    """快速授权（远程授权用，自动生成授权码）"""
    license_code = 'REMOTE-' + secrets.token_hex(8)
    conn = get_db()
    c = conn.cursor()
    sets = ["status='approved'", "license_code=?", "expire_date=?",
            "auth_source='remote'", "blocked=0", "operator=?", "updated_at=datetime('now','localtime')"]
    params = [license_code, expire_date, operator]
    if user_name:
        sets.append("user_name=?")
        params.append(user_name)
    if note:
        sets.append("note=?")
        params.append(note)
    params.append(machine_code)
    c.execute(f"UPDATE licenses SET {', '.join(sets)} WHERE machine_code=?", params)
    for tool_key, _ in TOOLS:
        c.execute("INSERT OR IGNORE INTO tool_permissions (machine_code, tool_key, enabled) VALUES (?, ?, 1)",
                  (machine_code, tool_key))
    conn.commit()
    conn.close()
    log_action('远程授权', machine_code, f'到期: {expire_date or "永久"}' + (f'，备注: {note}' if note else ''), operator)


def block_license(machine_code, operator='admin'):
    """拉黑设备（不再自动注册）"""
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE licenses SET blocked=1, updated_at=datetime('now','localtime') WHERE machine_code=?",
              (machine_code,))
    conn.commit()
    conn.close()
    log_action('拉黑设备', machine_code, '', operator)


def unblock_license(machine_code, operator='admin'):
    """解除拉黑"""
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE licenses SET blocked=0, updated_at=datetime('now','localtime') WHERE machine_code=?",
              (machine_code,))
    conn.commit()
    conn.close()
    log_action('解除拉黑', machine_code, '', operator)


def delete_license(machine_code, operator='admin'):
    """删除授权（软删除，标记为 deleted，客户端可立即检测到）"""
    conn = get_db()
    c = conn.cursor()
    c.execute("""UPDATE licenses SET status='deleted', license_code='', expire_date='',
                updated_at=datetime('now','localtime') WHERE machine_code=?""",
              (machine_code,))
    c.execute("DELETE FROM tool_permissions WHERE machine_code=?", (machine_code,))
    conn.commit()
    conn.close()
    log_action('删除授权', machine_code, '', operator)


def reactivate_license(machine_code, license_code, expire_date='', operator='system'):
    """恢复被删除的设备为已授权（用户重新激活时调用）"""
    conn = get_db()
    c = conn.cursor()
    c.execute("""UPDATE licenses SET status='approved', license_code=?, expire_date=?,
                blocked=0, updated_at=datetime('now','localtime') WHERE machine_code=?""",
              (license_code, expire_date, machine_code))
    for tool_key, _ in TOOLS:
        c.execute("INSERT OR IGNORE INTO tool_permissions (machine_code, tool_key, enabled) VALUES (?, ?, 1)",
                  (machine_code, tool_key))
    conn.commit()
    conn.close()
    log_action('设备重新激活', machine_code, '', operator)


def is_deleted_device(machine_code):
    """检查设备是否被管理员删除过"""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM audit_log WHERE target=? AND action IN ('删除授权', '批量删除') ORDER BY id DESC LIMIT 1",
              (machine_code,))
    result = c.fetchone() is not None
    conn.close()
    return result


def revoke_license(machine_code, operator='admin'):
    """删除授权（保留记录，改为 pending）"""
    conn = get_db()
    c = conn.cursor()
    c.execute("""UPDATE licenses SET status='pending', license_code='', expire_date='',
                updated_at=datetime('now','localtime') WHERE machine_code=?""",
              (machine_code,))
    c.execute("DELETE FROM tool_permissions WHERE machine_code=?", (machine_code,))
    conn.commit()
    conn.close()
    log_action('收回授权', machine_code, '', operator)


def update_last_seen(machine_code):
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE licenses SET last_seen=datetime('now','localtime') WHERE machine_code=?",
              (machine_code,))
    conn.commit()
    conn.close()


def update_user_name(machine_code, user_name):
    """更新客户端上报的用户名"""
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE licenses SET user_name=? WHERE machine_code=? AND (user_name IS NULL OR user_name='')",
              (user_name, machine_code))
    conn.commit()
    conn.close()


# ====== 工具权限 ======

def get_tool_permissions(machine_code):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT tool_key, enabled FROM tool_permissions WHERE machine_code=?", (machine_code,))
    rows = {r['tool_key']: bool(r['enabled']) for r in c.fetchall()}
    conn.close()
    for tool_key, _ in TOOLS:
        if tool_key not in rows:
            rows[tool_key] = True
    return rows


def set_tool_permission(machine_code, tool_key, enabled, operator='admin'):
    conn = get_db()
    c = conn.cursor()
    c.execute("""INSERT INTO tool_permissions (machine_code, tool_key, enabled)
                 VALUES (?, ?, ?)
                 ON CONFLICT(machine_code, tool_key) DO UPDATE SET enabled=?""",
              (machine_code, tool_key, int(enabled), int(enabled)))
    conn.commit()
    conn.close()
    action = '开启工具' if enabled else '关闭工具'
    log_action(action, machine_code, tool_key, operator)


def set_all_tools(machine_code, enabled, operator='admin'):
    conn = get_db()
    c = conn.cursor()
    for tool_key, _ in TOOLS:
        c.execute("""INSERT INTO tool_permissions (machine_code, tool_key, enabled)
                     VALUES (?, ?, ?)
                     ON CONFLICT(machine_code, tool_key) DO UPDATE SET enabled=?""",
                  (machine_code, tool_key, int(enabled), int(enabled)))
    conn.commit()
    conn.close()
    action = '开启全部工具' if enabled else '关闭全部工具'
    log_action(action, machine_code, '', operator)


# ====== 统计 ======

def get_stats():
    conn = get_db()
    c = conn.cursor()
    stats = {}
    c.execute("SELECT COUNT(*) FROM licenses WHERE blocked=0 AND status!='deleted'")
    stats['total'] = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM licenses WHERE status='approved' AND blocked=0")
    stats['approved'] = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM licenses WHERE status='pending' AND blocked=0")
    stats['pending'] = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM licenses WHERE status='revoked' AND blocked=0")
    stats['revoked'] = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM licenses WHERE blocked=1")
    stats['blocked'] = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM licenses WHERE status='deleted'")
    stats['deleted'] = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM licenses WHERE last_seen >= datetime('now','-24 hours') AND blocked=0 AND status!='deleted'")
    stats['online_24h'] = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM licenses WHERE date(created_at)=date('now','localtime') AND blocked=0 AND status!='deleted'")
    stats['today_new'] = c.fetchone()[0]
    conn.close()
    return stats


def search_licenses(keyword, include_blocked=True):
    conn = get_db()
    c = conn.cursor()
    like = f'%{keyword}%'
    if include_blocked:
        c.execute("""SELECT * FROM licenses WHERE
            machine_code LIKE ? OR user_name LIKE ? OR granted_to LIKE ? OR operator LIKE ? OR note LIKE ?
            ORDER BY id DESC""", (like, like, like, like, like))
    else:
        c.execute("""SELECT * FROM licenses WHERE blocked=0 AND
            (machine_code LIKE ? OR user_name LIKE ? OR granted_to LIKE ? OR operator LIKE ? OR note LIKE ?)
            ORDER BY id DESC""", (like, like, like, like, like))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


def get_blocked_licenses():
    """获取所有被拉黑的设备"""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM licenses WHERE blocked=1 ORDER BY id DESC")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


def batch_delete(machine_codes, operator='admin'):
    """批量拉黑"""
    conn = get_db()
    c = conn.cursor()
    count = 0
    for mc in machine_codes:
        c.execute("UPDATE licenses SET blocked=1, updated_at=datetime('now','localtime') WHERE machine_code=?", (mc,))
        count += 1
    conn.commit()
    conn.close()
    log_action('批量拉黑', f'{count}条记录', '', operator)
    return count


def batch_delete_permanent(machine_codes, operator='admin'):
    """批量删除授权（软删除，标记为 deleted）"""
    conn = get_db()
    c = conn.cursor()
    count = 0
    for mc in machine_codes:
        c.execute("""UPDATE licenses SET status='deleted', license_code='', expire_date='',
                    updated_at=datetime('now','localtime') WHERE machine_code=?""", (mc,))
        c.execute("DELETE FROM tool_permissions WHERE machine_code=?", (mc,))
        count += 1
    conn.commit()
    conn.close()
    log_action('批量删除', f'{count}条记录', '', operator)
    return count


def batch_renew(machine_codes, expire_date, operator='admin', note=''):
    conn = get_db()
    c = conn.cursor()
    count = 0
    for mc in machine_codes:
        if note:
            c.execute("""UPDATE licenses SET expire_date=?, status='approved', blocked=0,
                        note=?, updated_at=datetime('now','localtime') WHERE machine_code=?""",
                      (expire_date, note, mc))
        else:
            c.execute("""UPDATE licenses SET expire_date=?, status='approved', blocked=0,
                        updated_at=datetime('now','localtime') WHERE machine_code=?""",
                      (expire_date, mc))
        count += 1
    conn.commit()
    conn.close()
    log_action('批量续期', f'{count}条记录', f'到期: {expire_date}' + (f'，备注: {note}' if note else ''), operator)
    return count


def bulk_import(records, operator='admin'):
    conn = get_db()
    c = conn.cursor()
    success = 0
    skipped = 0
    errors = []
    for rec in records:
        mc = rec.get('machine_code', '').strip()
        if not mc:
            continue
        status = rec.get('status', '') or ('approved' if rec.get('license_code') else 'pending')
        auth_source = rec.get('auth_source', '') or 'remote'
        # 授权人：xlsx有值用xlsx的，否则用导入操作的管理员账号
        op = rec.get('operator', '') or rec.get('import_operator', '') or operator
        c.execute("SELECT id FROM licenses WHERE machine_code=?", (mc,))
        if c.fetchone():
            c.execute("""UPDATE licenses SET granted_to=?, user_name=?, license_code=?, expire_date=?,
                        note=?, operator=?, status=?, auth_source=?, blocked=0, updated_at=datetime('now','localtime')
                        WHERE machine_code=?""",
                      (rec.get('granted_to', ''), rec.get('user_name', ''), rec.get('license_code', ''),
                       rec.get('expire_date', ''), rec.get('note', ''),
                       op, status, auth_source, mc))
            success += 1
        else:
            c.execute("""INSERT INTO licenses (machine_code, granted_to, user_name, status,
                        license_code, expire_date, note, operator, auth_source, last_seen)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')""",
                      (mc, rec.get('granted_to', ''), rec.get('user_name', ''), status,
                       rec.get('license_code', ''), rec.get('expire_date', ''),
                       rec.get('note', ''), op, auth_source))
            success += 1
    conn.commit()
    conn.close()
    log_action('批量导入', f'{success}条记录', '', operator)
    return success, skipped, errors


# ====== 日志 ======

def log_action(action, target='', detail='', operator=''):
    conn = get_db()
    c = conn.cursor()
    c.execute("INSERT INTO audit_log (action, target, detail, operator) VALUES (?, ?, ?, ?)",
              (action, target, detail, operator))
    conn.commit()
    conn.close()


def get_audit_logs(limit=100):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows
