# -*- coding: utf-8 -*-
"""
可视化授权码生成工具（仅供管理员内部使用）
根据用户机器码和有效期生成授权码。
自动保存授权记录到 license.xlsx，记录包括：序号、机器码、有效期、授权码、生成时间、授权给、授权人、备注。
支持批量生成（Excel模板）、授权码验证、启动密码保护等。
"""

import base64
import os
import sys
import re
import shutil
from datetime import datetime, timedelta
from tkinter import *
from tkinter import messagebox, filedialog, ttk
from tkcalendar import DateEntry
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from openpyxl import Workbook, load_workbook

# ========== 获取资源文件的绝对路径，兼容开发环境和 PyInstaller 打包后 ==========
def resource_path(relative_path):
    """获取资源文件的绝对路径，兼容开发环境和 PyInstaller 打包后"""
    if hasattr(sys, '_MEIPASS'):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# ========== 授权核心逻辑 ==========
# 内置公钥（用于验证授权码，与 adb_server.py 中的公钥一致）
PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtK98BSNCpeHzADnSjJWP
ZqSOGY8tkj9rREkt5QR/vVHBNSiKmEj4S8GR8gSd6aZ/f7t5yGXwNRd40OzR6kuA
ZYVXxXpsEhLVwl5bRJbcnJ98M8g6SRGaw6jWdwN2B1HV39PWTBlvkA1hyzk6GQQq
W+TLKI6abyKUMfQlTfxiDrup7rn+3VoSNm2wrFYN2K1a80n0DdYZfC3dPpWot+ju
/D02PhJTyc5fnyCzJUAvvsDujLWILuRGOxejjdqL+PosfwwIGhQuMjCjF5Iq+4+X
S3nulFlamTjzR5MXTA7h5Aev0oCadEOterHPJbDUV2wAyKtTguZT6oBy0PRdnzBT
4QIDAQAB
-----END PUBLIC KEY-----"""

# 加密的私钥数据（由管理员持有）
ENCRYPTED_PRIVATE_KEY = {
    "salt": "ZaUDcMnLx99agFUeFEXVjA==",
    "iv": "fD2GfI3WbTl5fAhAOxzk/w==",
    "data": "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"
}

SUPER_PASSWORD = None  # 运行时由用户输入

def get_private_key():
    """使用用户输入的密码解密私钥"""
    global SUPER_PASSWORD
    if SUPER_PASSWORD is None:
        return None
    try:
        salt = base64.b64decode(ENCRYPTED_PRIVATE_KEY["salt"])
        iv = base64.b64decode(ENCRYPTED_PRIVATE_KEY["iv"])
        encrypted = base64.b64decode(ENCRYPTED_PRIVATE_KEY["data"])
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
            backend=default_backend()
        )
        aes_key = kdf.derive(SUPER_PASSWORD)
        cipher = Cipher(algorithms.AES(aes_key), modes.CFB(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        private_pem = decryptor.update(encrypted) + decryptor.finalize()
        private_key = serialization.load_pem_private_key(private_pem, password=None, backend=default_backend())
        return private_key
    except Exception:
        return None

def generate_license_code(machine_code, expire_date=None):
    private_key = get_private_key()
    if private_key is None:
        return None, "无法获取私钥，请检查超级密码"
    try:
        if expire_date:
            data = f"{machine_code}|{expire_date}"
        else:
            data = f"{machine_code}|"
        data_b64 = base64.b64encode(data.encode()).decode()
        signature = private_key.sign(data.encode(), padding.PKCS1v15(), hashes.SHA256())
        sig_b64 = base64.b64encode(signature).decode()
        return f"{data_b64}:{sig_b64}", None
    except Exception as e:
        return None, str(e)

def verify_license_code(machine_code, license_code):
    """验证授权码，返回 (是否有效, 有效期字符串或错误信息)"""
    try:
        # 加载公钥
        public_key = serialization.load_pem_public_key(PUBLIC_KEY_PEM.encode(), backend=default_backend())
        if ':' not in license_code:
            # 旧格式（永久）
            try:
                signature = base64.b64decode(license_code)
                public_key.verify(signature, machine_code.encode(), padding.PKCS1v15(), hashes.SHA256())
                return True, "永久"
            except Exception:
                return False, "授权码无效"
        else:
            data_b64, sig_b64 = license_code.split(':', 1)
            try:
                data = base64.b64decode(data_b64).decode()
                sig = base64.b64decode(sig_b64)
            except Exception:
                return False, "授权码格式错误"
            public_key.verify(sig, data.encode(), padding.PKCS1v15(), hashes.SHA256())
            parts = data.split('|')
            if len(parts) != 2:
                return False, "授权码格式错误"
            stored_machine, expire_str = parts
            if stored_machine != machine_code:
                return False, "机器码不匹配"
            if expire_str:
                expire_date = datetime.strptime(expire_str, "%Y-%m-%d")
                if datetime.now() > expire_date:
                    return False, f"授权已过期（过期日期 {expire_str}）"
                return True, f"有效期至 {expire_str}"
            else:
                return True, "永久"
    except Exception as e:
        return False, f"验证失败: {str(e)}"

# ========== Excel 记录管理（自动保存）==========
def get_excel_file_path():
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, "license.xlsx")

def init_excel():
    excel_path = get_excel_file_path()
    if not os.path.exists(excel_path):
        wb = Workbook()
        ws = wb.active
        ws.title = "授权记录"
        ws.append(['序号', '机器码', '用户名', '授权人', '状态', '授权方式', '授权码', '有效期', '备注', '注册时间'])
        wb.save(excel_path)

def get_next_sequence():
    """获取下一条记录的序号（基于最大序号+1，避免删除行后序号重复）"""
    excel_path = get_excel_file_path()
    if not os.path.exists(excel_path):
        return 1
    wb = load_workbook(excel_path)
    ws = wb.active
    max_seq = 0
    # 从第二行开始遍历所有行的第一列（序号列）
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is not None and isinstance(row[0], int):
            max_seq = max(max_seq, row[0])
    return max_seq + 1

def save_license_record(machine_code, expire_date, license_code, authorized_to, authorized_by, remark=""):
    """将授权记录追加到 Excel 文件，返回 (成功, 错误信息)"""
    try:
        init_excel()
        excel_path = get_excel_file_path()
        expire_display = expire_date if expire_date else '永久'
        generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        seq = get_next_sequence()
        wb = load_workbook(excel_path)
        ws = wb.active
        # 新格式：序号、机器码、用户名、授权人、状态、授权方式、授权码、有效期、备注、注册时间
        ws.append([seq, machine_code, authorized_to, authorized_by, '已授权', '本地', license_code, expire_display, remark, generated_at])
        wb.save(excel_path)
        return True, None
    except PermissionError:
        return False, "license.xlsx 文件被占用，请关闭 Excel 后重试"
    except Exception as e:
        return False, str(e)

def is_machine_code_exists(machine_code):
    """检查机器码是否已存在（返回是否已存在）"""
    excel_path = get_excel_file_path()
    if not os.path.exists(excel_path):
        return False
    try:
        wb = load_workbook(excel_path)
        ws = wb.active
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row[1] == machine_code:  # 机器码在第2列
                return True
        return False
    except:
        return False

# ========== 授权码验证窗口 ==========
class VerifyWindow:
    def __init__(self, parent):
        self.win = Toplevel(parent)
        self.win.title("授权码验证工具")
        self.win.geometry("600x350")
        self.win.resizable(False, False)
        self.win.grab_set()

        # 机器码区域（带粘贴按钮）
        frame_machine = Frame(self.win)
        frame_machine.pack(pady=(15, 5), fill=X, padx=10)
        Label(frame_machine, text="机器码：", font=("微软雅黑", 10)).pack(side=LEFT)
        self.machine_entry = Text(frame_machine, height=3, width=50, font=("Consolas", 9))
        self.machine_entry.pack(side=LEFT, padx=5, fill=X, expand=True)
        Button(frame_machine, text="粘贴", command=self.paste_machine, width=6).pack(side=LEFT)

        # 授权码区域（带粘贴按钮）
        frame_code = Frame(self.win)
        frame_code.pack(pady=(5, 5), fill=X, padx=10)
        Label(frame_code, text="授权码：", font=("微软雅黑", 10)).pack(side=LEFT)
        self.code_entry = Text(frame_code, height=4, width=50, font=("Consolas", 9))
        self.code_entry.pack(side=LEFT, padx=5, fill=X, expand=True)
        Button(frame_code, text="粘贴", command=self.paste_code, width=6).pack(side=LEFT)

        btn_frame = Frame(self.win)
        btn_frame.pack(pady=10)
        Button(btn_frame, text="验证", command=self.verify, bg="#4CAF50", fg="white", width=10).pack(side=LEFT, padx=5)
        Button(btn_frame, text="清空", command=self.clear, width=10).pack(side=LEFT, padx=5)

        self.result_label = Label(self.win, text="", font=("微软雅黑", 10), fg="blue")
        self.result_label.pack(pady=10)

    def paste_machine(self):
        try:
            text = self.win.clipboard_get()
            self.machine_entry.delete(1.0, END)
            self.machine_entry.insert(END, text)
        except:
            messagebox.showerror("错误", "剪贴板无内容或无法读取")

    def paste_code(self):
        try:
            text = self.win.clipboard_get()
            self.code_entry.delete(1.0, END)
            self.code_entry.insert(END, text)
        except:
            messagebox.showerror("错误", "剪贴板无内容或无法读取")

    def verify(self):
        machine_code = self.machine_entry.get(1.0, END).strip()
        license_code = self.code_entry.get(1.0, END).strip()
        if not machine_code or not license_code:
            messagebox.showerror("错误", "请填写机器码和授权码")
            return
        valid, msg = verify_license_code(machine_code, license_code)
        if valid:
            self.result_label.config(text=f"✅ 授权有效：{msg}", fg="green")
        else:
            self.result_label.config(text=f"❌ 授权无效：{msg}", fg="red")

    def clear(self):
        self.machine_entry.delete(1.0, END)
        self.code_entry.delete(1.0, END)
        self.result_label.config(text="")

# ========== 批量生成进度窗口 ==========
class BatchProgress:
    def __init__(self, parent, machine_codes, common_params):
        self.parent = parent
        self.machine_codes = machine_codes
        self.common_params = common_params
        self.total = len(machine_codes)
        self.current = 0
        self.success_count = 0
        self.fail_count = 0
        self.skip_count = 0
        self.cancelled = False
        self.auto_close_id = None

        self.win = Toplevel(parent)
        self.win.title("批量生成进度")
        self.win.geometry("500x200")
        self.win.resizable(False, False)
        self.win.grab_set()

        Label(self.win, text=f"共 {self.total} 个机器码，正在生成...", font=("微软雅黑", 10)).pack(pady=10)
        self.progress = ttk.Progressbar(self.win, length=400, mode='determinate', maximum=self.total)
        self.progress.pack(pady=10)
        self.status_label = Label(self.win, text="准备就绪", font=("微软雅黑", 9))
        self.status_label.pack(pady=5)
        self.cancel_btn = Button(self.win, text="取消", command=self.cancel, bg="#f44336", fg="white")
        self.cancel_btn.pack(pady=10)

        self.process_next()

    def cancel(self):
        self.cancelled = True
        self.cancel_btn.config(state=DISABLED, text="正在取消...")
        self.status_label.config(text="正在取消，请稍候...")

    def process_next(self):
        if self.cancelled:
            self.finish("已取消")
            return
        if self.current >= self.total:
            self.finish("完成")
            return

        machine_code = self.machine_codes[self.current]
        self.current += 1
        self.progress['value'] = self.current
        self.status_label.config(text=f"正在处理 ({self.current}/{self.total}): {machine_code[:20]}...")
        self.win.update()

        if is_machine_code_exists(machine_code):
            if not messagebox.askyesno("重复授权", f"机器码 {machine_code} 已有授权记录，是否继续生成？"):
                self.skip_count += 1
                self.status_label.config(text=f"跳过 {machine_code[:20]}...")
                self.win.after(10, self.process_next)
                return

        expire_date = self.common_params['expire_date'] if self.common_params['expire_date'] != 'permanent' else None
        license_code, error = generate_license_code(machine_code, expire_date)
        if license_code:
            ok, err = save_license_record(
                machine_code,
                expire_date,
                license_code,
                self.common_params['authorized_to'],
                self.common_params['authorized_by'],
                self.common_params['remark']
            )
            if ok:
                self.success_count += 1
                self.status_label.config(text=f"成功生成 {machine_code[:20]}...")
            else:
                self.fail_count += 1
                self.status_label.config(text=f"保存失败: {err}")
                messagebox.showerror("保存失败", f"机器码 {machine_code}\n{err}")
        else:
            self.fail_count += 1
            self.status_label.config(text=f"生成失败: {error[:50]}...")
            messagebox.showerror("生成失败", f"机器码 {machine_code}\n{error}")

        self.win.after(10, self.process_next)

    def finish(self, status):
        self.progress['value'] = self.total
        msg = f"批量处理{status}：成功 {self.success_count}，失败 {self.fail_count}，跳过 {self.skip_count}"
        self.status_label.config(text=msg)
        self.cancel_btn.config(state=NORMAL, text="关闭", command=self.manual_close)
        self.auto_close_id = self.win.after(3000, self.win.destroy)

    def manual_close(self):
        if self.auto_close_id:
            self.win.after_cancel(self.auto_close_id)
        self.win.destroy()

# ========== 主 GUI ==========
class LicenseGeneratorGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("YUWEITEK 工具箱_Agent 授权工具（管理员专用）")
        self.root.geometry("750x600")
        self.root.resizable(False, False)

        # 机器码输入
        Label(root, text="用户机器码：", font=("微软雅黑", 12)).pack(pady=(20, 5))
        self.machine_code_entry = Text(root, height=3, width=70, font=("Consolas", 10))
        self.machine_code_entry.pack(pady=5)
        btn_frame = Frame(root)
        btn_frame.pack()
        Button(btn_frame, text="粘贴", command=self.paste_machine_code, width=10).pack(side=LEFT, padx=5)
        Button(btn_frame, text="清空", command=self.clear_machine_code, width=10).pack(side=LEFT, padx=5)

        # 授权信息横向布局
        info_frame = Frame(root)
        info_frame.pack(pady=(10, 5), fill=X)

        # 授权给（用户名/客户名称）
        frame1 = Frame(info_frame)
        frame1.pack(side=LEFT, padx=5, expand=True, fill=X)
        Label(frame1, text="授权给（用户名/客户名称）：", font=("微软雅黑", 10)).pack(anchor=W)
        self.authorized_to_entry = Entry(frame1, width=20, font=("微软雅黑", 10))
        self.authorized_to_entry.pack(fill=X, pady=2)

        # 授权人（自动获取当前 Windows 用户名，可手动修改）
        frame2 = Frame(info_frame)
        frame2.pack(side=LEFT, padx=5, expand=True, fill=X)
        Label(frame2, text="授权人（自动获取，可修改）：", font=("微软雅黑", 10)).pack(anchor=W)
        self.authorized_by_entry = Entry(frame2, width=20, font=("微软雅黑", 10))
        default_user = os.environ.get('USERNAME') or os.environ.get('USER') or '未知'
        self.authorized_by_entry.insert(0, default_user)
        self.authorized_by_entry.pack(fill=X, pady=2)

        # 备注（可选）
        frame3 = Frame(info_frame)
        frame3.pack(side=LEFT, padx=5, expand=True, fill=X)
        Label(frame3, text="备注（可选）：", font=("微软雅黑", 10)).pack(anchor=W)
        self.remark_entry = Entry(frame3, width=20, font=("微软雅黑", 10))
        self.remark_entry.pack(fill=X, pady=2)

                # 有效期选择（横向布局）
        Label(root, text="有效期：", font=("微软雅黑", 12)).pack(pady=(10, 5))
        self.expire_type = StringVar(value="permanent")

        radio_frame = Frame(root)
        radio_frame.pack(pady=5)
        Radiobutton(radio_frame, text="永久", variable=self.expire_type, value="permanent", command=self.on_expire_type_change).pack(side=LEFT, padx=10)
        Radiobutton(radio_frame, text="自定义日期", variable=self.expire_type, value="custom", command=self.on_expire_type_change).pack(side=LEFT, padx=10)

        # 自定义选项框架（横向排列）
        self.options_frame = Frame(root)  # 关键：创建 self.options_frame
        self.options_frame.pack(pady=5)

        # 天数输入框（允许手动输入）
        self.days_label = Label(self.options_frame, text="授权天数：")
        self.days_entry = Entry(self.options_frame, width=8, font=("微软雅黑", 10))
        self.days_entry.insert(0, "30")
        self.days_btn = Button(self.options_frame, text="应用天数", command=self.apply_days, width=8)

        # 日期选择器（自定义日期）
        self.date_frame = Frame(self.options_frame)
        self.date_label = Label(self.date_frame, text="或选择日期：")
        self.cal = DateEntry(self.date_frame, width=12, background='darkblue', foreground='white',
                             borderwidth=2, date_pattern='yyyy-mm-dd')
        self.cal.pack(side=LEFT, padx=5)
        self.date_label.pack(side=LEFT, padx=5)

        # 初始隐藏所有自定义控件
        self.days_label.pack_forget()
        self.days_entry.pack_forget()
        self.days_btn.pack_forget()
        self.date_frame.pack_forget()

        # 按钮行
        btn_row = Frame(root)
        btn_row.pack(pady=15)
        # 顺序：批量生成 -> 验证授权码 -> 下载模板 -> 生成授权码（最右）
        self.batch_btn = Button(btn_row, text="批量生成", command=self.batch_generate,
                                bg="#FF9800", fg="white", font=("微软雅黑", 12), width=12)
        self.batch_btn.pack(side=LEFT, padx=5)
        self.verify_btn = Button(btn_row, text="验证授权码", command=self.open_verify_window,
                                bg="#2196F3", fg="white", font=("微软雅黑", 12), width=12)
        self.verify_btn.pack(side=LEFT, padx=5)
        self.template_btn = Button(btn_row, text="下载模板", command=self.download_template,
                                bg="#9E9E9E", fg="white", font=("微软雅黑", 12), width=12)
        self.template_btn.pack(side=LEFT, padx=5)
        self.generate_btn = Button(btn_row, text="生成授权码", command=self.generate,
                                bg="#4CAF50", fg="white", font=("微软雅黑", 12), width=12)
        self.generate_btn.pack(side=LEFT, padx=5)

        # 结果显示
        Label(root, text="生成的授权码：", font=("微软雅黑", 12)).pack()
        self.result_text = Text(root, height=6, width=70, font=("Consolas", 10))
        self.result_text.pack(pady=5)
        Button(root, text="复制授权码", command=self.copy_to_clipboard, bg="#2196F3", fg="white", width=15).pack(pady=5)

        # 状态栏
        self.status = Label(root, text="就绪", bd=1, relief=SUNKEN, anchor=W)
        self.status.pack(side=BOTTOM, fill=X)

    def paste_machine_code(self):
        try:
            text = self.root.clipboard_get()
            self.machine_code_entry.delete(1.0, END)
            self.machine_code_entry.insert(END, text)
            self.status.config(text="已粘贴")
        except:
            self.status.config(text="剪贴板无内容")

    def clear_machine_code(self):
        self.machine_code_entry.delete(1.0, END)
        self.status.config(text="已清空")

    def on_expire_type_change(self):
        if self.expire_type.get() == "custom":
            self.days_label.pack(side=LEFT, padx=5)
            self.days_entry.pack(side=LEFT, padx=5)
            self.days_btn.pack(side=LEFT, padx=5)
            self.date_frame.pack(side=LEFT, padx=5)
            # 确保日期选择器的子元素已正确布局（已在初始化时 pack 好）
        else:
            self.days_label.pack_forget()
            self.days_entry.pack_forget()
            self.days_btn.pack_forget()
            self.date_frame.pack_forget()

    def apply_days(self):
        """根据输入的天数自动计算到期日期并设置到日期选择器"""
        try:
            days_text = self.days_entry.get().strip()
            if not days_text:
                messagebox.showerror("错误", "请输入天数")
                return
            days = int(days_text)
            if days <= 0:
                messagebox.showerror("错误", "天数必须为正整数")
                return
            expire_date = datetime.now() + timedelta(days=days)
            self.cal.set_date(expire_date)
            # 自动切换到自定义模式（如果尚未选中）
            if self.expire_type.get() != "custom":
                self.expire_type.set("custom")
                self.on_expire_type_change()
            messagebox.showinfo("提示", f"已设置到期日期为 {expire_date.strftime('%Y-%m-%d')}")
        except ValueError:
            messagebox.showerror("错误", "请输入有效的数字天数")

    def download_template(self):
        """下载批量导入模板（直接保存，不生成临时文件）"""
        save_path = filedialog.asksaveasfilename(
            defaultextension=".xlsx",
            filetypes=[("Excel 文件", "*.xlsx")],
            initialfile="batch_template.xlsx",
            title="保存模板文件"
        )
        if not save_path:
            self.status.config(text="取消下载")
            return

        try:
            wb = Workbook()
            ws = wb.active
            ws.title = "机器码列表"
            ws.append(["机器码"])
            ws.column_dimensions['A'].width = 50
            wb.save(save_path)
            messagebox.showinfo("成功", f"模板已保存到：{save_path}")
            self.status.config(text="模板下载成功")
        except PermissionError:
            messagebox.showerror("失败", "模板保存失败：文件被占用，请关闭已打开的该文件后重试")
            self.status.config(text="模板下载失败")
        except Exception as e:
            messagebox.showerror("失败", f"保存模板失败：{str(e)}")
            self.status.config(text="模板下载失败")

    def generate(self):
        # 禁用生成按钮，防止重复点击
        self.generate_btn.config(state=DISABLED)
        try:
            # 清理机器码中的空白字符
            machine_code_raw = self.machine_code_entry.get(1.0, END).strip()
            machine_code = re.sub(r'\s+', '', machine_code_raw)
            if not machine_code:
                messagebox.showerror("错误", "请输入用户机器码")
                return
            if not re.fullmatch(r'[0-9a-fA-F]{64}', machine_code):
                messagebox.showerror("格式错误", "机器码必须为64位十六进制字符（0-9, a-f）")
                return
            authorized_to = self.authorized_to_entry.get().strip()
            if not authorized_to:
                messagebox.showerror("错误", "请输入授权给（用户名/客户名称）")
                return
            authorized_by = self.authorized_by_entry.get().strip()
            if not authorized_by:
                authorized_by = os.environ.get('USERNAME') or os.environ.get('USER') or '未知'
                self.authorized_by_entry.insert(0, authorized_by)
            remark = self.remark_entry.get().strip()

            expire_date = None
            if self.expire_type.get() == "custom":
                try:
                    expire_date = self.cal.get_date().strftime("%Y-%m-%d")
                    if expire_date < datetime.now().strftime("%Y-%m-%d"):
                        messagebox.showerror("错误", "到期日期不能早于今天")
                        return
                except:
                    messagebox.showerror("错误", "请选择有效的日期")
                    return
        finally:
            # 恢复生成按钮
            self.generate_btn.config(state=NORMAL)

        # 检查重复
        if is_machine_code_exists(machine_code):
            if not messagebox.askyesno("重复授权", f"机器码 {machine_code} 已有授权记录，是否继续生成？"):
                return

        license_code, error = generate_license_code(machine_code, expire_date)
        if license_code:
            self.result_text.delete(1.0, END)
            self.result_text.insert(END, license_code)
            # 自动复制到剪贴板
            self.root.clipboard_clear()
            self.root.clipboard_append(license_code)
            # 保存到 Excel
            ok, err_msg = save_license_record(machine_code, expire_date, license_code, authorized_to, authorized_by, remark)
            if ok:
                self.status.config(text="授权码生成成功，已保存记录并复制到剪贴板")
            else:
                self.status.config(text=f"授权码生成成功，但保存失败：{err_msg}")
                messagebox.showerror("保存失败", err_msg)
        else:
            messagebox.showerror("生成失败", error)
            self.status.config(text="生成失败")

    def copy_to_clipboard(self):
        code = self.result_text.get(1.0, END).strip()
        if code:
            self.root.clipboard_clear()
            self.root.clipboard_append(code)
            self.status.config(text="已复制到剪贴板")
            messagebox.showinfo("提示", "授权码已复制到剪贴板")
        else:
            messagebox.showwarning("提示", "没有可复制的授权码")

    def open_verify_window(self):
        VerifyWindow(self.root)

    def batch_generate(self):
        # 获取公共参数
        authorized_to = self.authorized_to_entry.get().strip()
        if not authorized_to:
            messagebox.showerror("错误", "请先填写「授权给」")
            return
        authorized_by = self.authorized_by_entry.get().strip()
        if not authorized_by:
            authorized_by = os.environ.get('USERNAME') or os.environ.get('USER') or '未知'
            self.authorized_by_entry.insert(0, authorized_by)
        remark = self.remark_entry.get().strip()

        expire_date = None
        expire_display = "permanent"
        if self.expire_type.get() == "custom":
            try:
                expire_date = self.cal.get_date().strftime("%Y-%m-%d")
                if expire_date < datetime.now().strftime("%Y-%m-%d"):
                    messagebox.showerror("错误", "到期日期不能早于今天")
                    return
                expire_display = expire_date
            except:
                messagebox.showerror("错误", "请选择有效的日期")
                return

        file_path = filedialog.askopenfilename(
            title="选择机器码 Excel 文件（第一列为机器码）",
            filetypes=[("Excel 文件", "*.xlsx"), ("所有文件", "*.*")]
        )
        if not file_path:
            return

        machine_codes = []
        invalid_codes = []
        try:
            wb = load_workbook(file_path)
            ws = wb.active
            for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                if not row or len(row) == 0:
                    continue
                code = row[0]
                if code is None:
                    continue
                code_str = str(code).strip()
                if code_str:
                    code_str = re.sub(r'\s+', '', code_str)
                    if code_str:
                        if re.fullmatch(r'[0-9a-fA-F]{64}', code_str):
                            machine_codes.append(code_str)
                        else:
                            invalid_codes.append(f"第{i}行: {code_str}")
        except Exception as e:
            messagebox.showerror("读取失败", f"无法读取 Excel 文件：{str(e)}")
            return

        if not machine_codes:
            msg = "文件中没有有效的机器码（请确保第一列包含64位十六进制机器码，且从第二行开始）"
            if invalid_codes:
                msg += f"\n\n无效记录（已忽略）:\n" + "\n".join(invalid_codes[:10])
            messagebox.showwarning("警告", msg)
            return
        elif invalid_codes:
            messagebox.showinfo("提示", f"共识别 {len(machine_codes)} 个有效机器码，{len(invalid_codes)} 个无效机器码已被忽略。")

        common_params = {
            'authorized_to': authorized_to,
            'authorized_by': authorized_by,
            'expire_date': expire_display,
            'remark': remark
        }
        BatchProgress(self.root, machine_codes, common_params)

# ========== 启动密码验证 ==========
def check_password():
    """弹出密码输入框，验证管理员密码（居中显示），返回 (password_ok, password_bytes)"""
    pwd_window = Toplevel()
    pwd_window.title("YUWEITEK 授权工具_管理员验证")
    pwd_window.geometry("350x200")
    pwd_window.resizable(False, False)
    pwd_window.grab_set()

    icon_path = resource_path("logo.ico")
    if os.path.exists(icon_path):
        pwd_window.iconbitmap(icon_path)

    screen_width = pwd_window.winfo_screenwidth()
    screen_height = pwd_window.winfo_screenheight()
    window_width = 350
    window_height = 200
    x = (screen_width - window_width) // 2
    y = (screen_height - window_height) // 2
    pwd_window.geometry(f"+{x}+{y}")

    Label(pwd_window, text="请输入管理员密码：", font=("微软雅黑", 12)).pack(pady=(15, 5))

    frame_pwd = Frame(pwd_window)
    frame_pwd.pack(pady=5)
    pwd_entry = Entry(frame_pwd, show="*", width=20, font=("微软雅黑", 10))
    pwd_entry.pack(side=LEFT, padx=5)
    show_var = BooleanVar()
    def toggle_show():
        if show_var.get():
            pwd_entry.config(show="")
        else:
            pwd_entry.config(show="*")
    Checkbutton(frame_pwd, text="显示密码", variable=show_var, command=toggle_show).pack(side=LEFT)

    pwd_entry.focus()

    result = {"success": False, "password": None, "cancelled": False}

    def verify():
        pwd = pwd_entry.get().strip()
        if not pwd:
            messagebox.showerror("错误", "密码不能为空")
            return
        result["password"] = pwd.encode()
        result["success"] = True
        pwd_window.destroy()

    def cancel():
        result["cancelled"] = True
        pwd_window.destroy()

    btn_frame = Frame(pwd_window)
    btn_frame.pack(pady=15)
    Button(btn_frame, text="确定", command=verify, width=10).pack(side=LEFT, padx=10)
    Button(btn_frame, text="取消", command=cancel, width=10).pack(side=LEFT, padx=10)

    pwd_window.bind('<Return>', lambda e: verify())
    pwd_window.wait_window()

    if result["cancelled"]:
        return False, None
    if result["success"]:
        return True, result["password"]
    else:
        return False, None

if __name__ == "__main__":
    root = Tk()
    root.withdraw()

    # 循环直到密码正确或用户取消
    while True:
        ok, pwd = check_password()
        if not ok:
            # 用户取消或出错，退出程序
            sys.exit(0)
        SUPER_PASSWORD = pwd
        if get_private_key() is not None:
            break
        else:
            messagebox.showerror("错误", "密码错误，无法解密私钥，请重新输入")
            # 继续循环，重新弹出密码窗口

    # 密码正确，关闭隐藏的根窗口并显示主界面
    root.geometry("750x600")
    screen_width = root.winfo_screenwidth()
    screen_height = root.winfo_screenheight()
    window_width = 750
    window_height = 600
    x = (screen_width - window_width) // 2
    y = (screen_height - window_height) // 2
    root.geometry(f"+{x}+{y}")
    root.deiconify()
    root.title("YUWEITEK 工具箱_Agent 授权工具（管理员专用）")
    icon_path = resource_path("logo.ico")
    if os.path.exists(icon_path):
        root.iconbitmap(icon_path)
    app = LicenseGeneratorGUI(root)
    root.mainloop()