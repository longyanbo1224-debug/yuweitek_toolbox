# -*- coding: utf-8 -*-
"""
YUWEITEK 工具箱密钥对生成工具（仅供管理员内部使用）
用于生成 RSA 密钥对（公钥+私钥），私钥使用 AES 加密存储。
生成后公钥需复制到工具箱客户端（config.py），加密私钥数据需复制到授权码生成工具（license_generator_gui.py）。
支持更换超级密码（重新加密现有私钥），无需重新生成密钥对。
"""

import tkinter as tk
from tkinter import scrolledtext, messagebox
import base64
import json
import os
import hashlib
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

class KeyGeneratorApp:
    def __init__(self, root):
        self.root = root
        root.title("YUWEITEK 工具箱授权密钥生成器")
        root.geometry("800x680")
        root.resizable(True, True)

        # 超级密码输入（带显示密码复选框）
        tk.Label(root, text="超级密码（用于加密新私钥）:").pack(pady=(10,0))
        pwd_frame = tk.Frame(root)
        pwd_frame.pack(pady=5)
        self.password_entry = tk.Entry(pwd_frame, show="*", width=30, font=("微软雅黑", 10))
        self.password_entry.pack(side=tk.LEFT, padx=5)
        self.show_pwd_var = tk.BooleanVar()
        def toggle_pwd():
            if self.show_pwd_var.get():
                self.password_entry.config(show="")
            else:
                self.password_entry.config(show="*")
        tk.Checkbutton(pwd_frame, text="显示密码", variable=self.show_pwd_var, command=toggle_pwd).pack(side=tk.LEFT)

        # 按钮区域
        btn_frame = tk.Frame(root)
        btn_frame.pack(pady=10)
        self.gen_btn = tk.Button(btn_frame, text="生成新密钥对", command=self.generate_keys)
        self.gen_btn.pack(side=tk.LEFT, padx=5)
        self.reencrypt_btn = tk.Button(btn_frame, text="更换超级密码（重新加密现有私钥）", command=self.reencrypt_private_key)
        self.reencrypt_btn.pack(side=tk.LEFT, padx=5)

        # 公钥显示区域
        tk.Label(root, text="公钥（PEM格式，需复制到 config.py 中）:").pack(anchor='w', padx=10)
        self.pub_text = scrolledtext.ScrolledText(root, height=10, width=90, wrap=tk.WORD)
        self.pub_text.pack(padx=10, pady=5, fill=tk.BOTH, expand=True)

        # 加密私钥数据区域
        tk.Label(root, text="加密私钥数据（JSON格式，需放入 license_generator_gui.py 的 ENCRYPTED_PRIVATE_KEY）:").pack(anchor='w', padx=10)
        self.priv_text = scrolledtext.ScrolledText(root, height=12, width=90, wrap=tk.WORD)
        self.priv_text.pack(padx=10, pady=5, fill=tk.BOTH, expand=True)

        # 按钮栏
        copy_frame = tk.Frame(root)
        copy_frame.pack(pady=10)
        tk.Button(copy_frame, text="复制公钥", command=self.copy_pub).pack(side=tk.LEFT, padx=5)
        tk.Button(copy_frame, text="复制加密私钥", command=self.copy_priv).pack(side=tk.LEFT, padx=5)
        tk.Button(copy_frame, text="保存到文件", command=self.save_to_file).pack(side=tk.LEFT, padx=5)

        self.current_private_pem = None
        self.current_encrypted_data = None

    def generate_keys(self):
        password = self.password_entry.get().strip()
        if not password:
            messagebox.showerror("错误", "请输入超级密码")
            return
        try:
            private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            public_key = private_key.public_key()

            public_pem = public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            ).decode()

            private_pem = private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            )

            salt = os.urandom(16)
            aes_key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000, dklen=32)

            iv = os.urandom(16)
            cipher = Cipher(algorithms.AES(aes_key), modes.CFB(iv), backend=default_backend())
            encryptor = cipher.encryptor()
            encrypted_private = encryptor.update(private_pem) + encryptor.finalize()

            encrypted_data = {
                "salt": base64.b64encode(salt).decode(),
                "iv": base64.b64encode(iv).decode(),
                "data": base64.b64encode(encrypted_private).decode()
            }
            encrypted_json = json.dumps(encrypted_data, indent=2)

            self.pub_text.delete(1.0, tk.END)
            self.pub_text.insert(tk.END, public_pem)
            self.priv_text.delete(1.0, tk.END)
            self.priv_text.insert(tk.END, f"ENCRYPTED_PRIVATE_KEY = {encrypted_json}")

            self.current_private_pem = private_pem
            self.current_encrypted_data = encrypted_data

            messagebox.showinfo("成功", "密钥对生成成功！请妥善保存公钥和加密私钥数据。")
        except Exception as e:
            messagebox.showerror("生成失败", str(e))

    def reencrypt_private_key(self):
        """更换超级密码：验证旧密码 -> 输入新密码 -> 重新加密私钥"""
        cur_enc_raw = self.priv_text.get(1.0, tk.END).strip()
        if not cur_enc_raw:
            messagebox.showerror("错误", "没有找到现有加密私钥数据，请先生成密钥对或将已有的加密数据粘贴到下方文本框")
            return

        if cur_enc_raw.startswith("ENCRYPTED_PRIVATE_KEY ="):
            cur_enc_json = cur_enc_raw[len("ENCRYPTED_PRIVATE_KEY ="):].strip()
        else:
            cur_enc_json = cur_enc_raw

        # 验证旧密码窗口（带显示密码和错误标签，支持重试）
        old_pwd_window = tk.Toplevel(self.root)
        old_pwd_window.title("验证旧密码")
        old_pwd_window.geometry("450x200")
        old_pwd_window.resizable(False, False)

        tk.Label(old_pwd_window, text="请输入旧超级密码:").pack(pady=(15,5))
        frame_old = tk.Frame(old_pwd_window)
        frame_old.pack(pady=5)
        old_pwd_entry = tk.Entry(frame_old, show="*", width=25)
        old_pwd_entry.pack(side=tk.LEFT, padx=5)
        show_old_var = tk.BooleanVar()
        def toggle_old():
            if show_old_var.get():
                old_pwd_entry.config(show="")
            else:
                old_pwd_entry.config(show="*")
        tk.Checkbutton(frame_old, text="显示密码", variable=show_old_var, command=toggle_old).pack(side=tk.LEFT)

        error_label = tk.Label(old_pwd_window, text="", fg="red", wraplength=380)
        error_label.pack(pady=5)

        result = {"private_pem": None, "success": False}

        def verify_old():
            old_pwd = old_pwd_entry.get().strip()
            if not old_pwd:
                error_label.config(text="密码不能为空")
                old_pwd_entry.delete(0, tk.END)
                old_pwd_entry.focus()
                return
            try:
                cur_enc_data = json.loads(cur_enc_json)
                salt = base64.b64decode(cur_enc_data["salt"])
                iv = base64.b64decode(cur_enc_data["iv"])
                encrypted = base64.b64decode(cur_enc_data["data"])
                kdf = hashlib.pbkdf2_hmac('sha256', old_pwd.encode(), salt, 100000, dklen=32)
                cipher = Cipher(algorithms.AES(kdf), modes.CFB(iv), backend=default_backend())
                decryptor = cipher.decryptor()
                private_pem = decryptor.update(encrypted) + decryptor.finalize()
                serialization.load_pem_private_key(private_pem, password=None, backend=default_backend())
                result["private_pem"] = private_pem
                result["success"] = True
                old_pwd_window.destroy()
            except Exception as e:
                error_label.config(text=f"旧密码错误或数据无效: {str(e)}")
                old_pwd_entry.delete(0, tk.END)
                old_pwd_entry.focus()

        tk.Button(old_pwd_window, text="验证", command=verify_old).pack(pady=10)
        old_pwd_window.bind('<Return>', lambda e: verify_old())
        old_pwd_entry.focus()
        self.root.wait_window(old_pwd_window)

        if not result["success"]:
            return

        # 输入新密码窗口（两个密码框各带显示复选框）
        new_pwd_window = tk.Toplevel(self.root)
        new_pwd_window.title("输入新密码")
        new_pwd_window.geometry("400x240")

        tk.Label(new_pwd_window, text="新超级密码:").pack(pady=(10,5))
        frame_new1 = tk.Frame(new_pwd_window)
        frame_new1.pack(pady=5)
        new_pwd_entry = tk.Entry(frame_new1, show="*", width=25)
        new_pwd_entry.pack(side=tk.LEFT, padx=5)
        show_new1_var = tk.BooleanVar()
        def toggle_new1():
            if show_new1_var.get():
                new_pwd_entry.config(show="")
            else:
                new_pwd_entry.config(show="*")
        tk.Checkbutton(frame_new1, text="显示", variable=show_new1_var, command=toggle_new1).pack(side=tk.LEFT)

        tk.Label(new_pwd_window, text="确认新超级密码:").pack(pady=(5,0))
        frame_new2 = tk.Frame(new_pwd_window)
        frame_new2.pack(pady=5)
        confirm_entry = tk.Entry(frame_new2, show="*", width=25)
        confirm_entry.pack(side=tk.LEFT, padx=5)
        show_new2_var = tk.BooleanVar()
        def toggle_new2():
            if show_new2_var.get():
                confirm_entry.config(show="")
            else:
                confirm_entry.config(show="*")
        tk.Checkbutton(frame_new2, text="显示", variable=show_new2_var, command=toggle_new2).pack(side=tk.LEFT)

        error_label2 = tk.Label(new_pwd_window, text="", fg="red")
        error_label2.pack(pady=5)

        def confirm_new():
            new_pwd = new_pwd_entry.get().strip()
            confirm = confirm_entry.get().strip()
            if not new_pwd or not confirm:
                error_label2.config(text="密码不能为空")
                return
            if new_pwd != confirm:
                error_label2.config(text="两次输入的密码不一致")
                return
            try:
                private_pem = result["private_pem"]
                new_salt = os.urandom(16)
                new_iv = os.urandom(16)
                kdf_new = hashlib.pbkdf2_hmac('sha256', new_pwd.encode(), new_salt, 100000, dklen=32)
                cipher_new = Cipher(algorithms.AES(kdf_new), modes.CFB(new_iv), backend=default_backend())
                encryptor = cipher_new.encryptor()
                new_encrypted = encryptor.update(private_pem) + encryptor.finalize()
                new_encrypted_data = {
                    "salt": base64.b64encode(new_salt).decode(),
                    "iv": base64.b64encode(new_iv).decode(),
                    "data": base64.b64encode(new_encrypted).decode()
                }
                new_encrypted_json = json.dumps(new_encrypted_data, indent=2)
                self.priv_text.delete(1.0, tk.END)
                self.priv_text.insert(tk.END, f"ENCRYPTED_PRIVATE_KEY = {new_encrypted_json}")
                self.current_private_pem = private_pem
                self.current_encrypted_data = new_encrypted_data
                messagebox.showinfo("成功", "超级密码更换成功！新加密私钥数据已生成，请替换到授权工具中。")
                new_pwd_window.destroy()
            except Exception as e:
                error_label2.config(text=f"重新加密失败: {str(e)[:50]}")

        tk.Button(new_pwd_window, text="确定", command=confirm_new).pack(pady=15)

    def copy_pub(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.pub_text.get(1.0, tk.END).strip())
        messagebox.showinfo("复制", "公钥已复制到剪贴板")

    def copy_priv(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.priv_text.get(1.0, tk.END).strip())
        messagebox.showinfo("复制", "加密私钥数据已复制到剪贴板")

    def save_to_file(self):
        pub_content = self.pub_text.get(1.0, tk.END).strip()
        priv_content = self.priv_text.get(1.0, tk.END).strip()
        if not pub_content or not priv_content:
            messagebox.showerror("错误", "没有可保存的数据")
            return
        from tkinter import filedialog
        file_path = filedialog.asksaveasfilename(defaultextension=".txt", filetypes=[("Text files", "*.txt"), ("All files", "*.*")])
        if file_path:
            with open(file_path, 'w') as f:
                f.write("=== 公钥 ===\n")
                f.write(pub_content)
                f.write("\n\n=== 加密私钥数据 ===\n")
                f.write(priv_content)
            messagebox.showinfo("保存", f"已保存到 {file_path}")

if __name__ == "__main__":
    root = tk.Tk()
    app = KeyGeneratorApp(root)
    root.mainloop()