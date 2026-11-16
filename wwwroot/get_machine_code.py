# -*- coding: utf-8 -*-
"""
独立取机器码工具（不依赖 Flask 主线程，直接用本机 Python 跑）

用法：
    python get_machine_code.py

输出：
    新版机器码 / 旧版机器码 + 参与哈希的原始内容，便于核对。
"""

import hashlib
import sys

import pythoncom
import wmi


def _with_com(func):
    pythoncom.CoInitialize()
    # 不 CoUninitialize，避免退出时释放 WMI COM 对象报 IUnknown 警告
    return func()


def _read():
    c = wmi.WMI()
    try:
        motherboard_serial = c.Win32_BaseBoard()[0].SerialNumber.strip()
    except Exception:
        motherboard_serial = "Unknown"

    # 新算法：只看固定硬盘，按 Index 排序（注意 int(d.Index) if d.Index else 999 的原始写法）
    try:
        fixed_disks = [d for d in c.Win32_DiskDrive()
                       if d.MediaType == 'Fixed hard disk media' and d.SerialNumber]
        if fixed_disks:
            fixed_disks.sort(key=lambda d: int(d.Index) if d.Index else 999)
            new_disk = fixed_disks[0].SerialNumber.strip()
        else:
            new_disk = "Unknown"
    except Exception:
        new_disk = "Unknown"

    # 旧算法：Win32_PhysicalMedia 第一项
    try:
        legacy_disk = c.Win32_PhysicalMedia()[0].SerialNumber.strip()
    except Exception:
        legacy_disk = "Unknown"

    return motherboard_serial, new_disk, legacy_disk


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    mb, new_disk, legacy_disk = _with_com(_read)

    new_raw = f"{mb}|{new_disk}"
    legacy_raw = f"{mb}|{legacy_disk}"
    new_code = hashlib.sha256(new_raw.encode()).hexdigest()
    legacy_code = hashlib.sha256(legacy_raw.encode()).hexdigest()

    print("主板序列号 :", mb)
    print("固定硬盘   :", new_disk)
    print("物理介质0  :", legacy_disk)
    print()
    print("新版机器码 :", new_code)
    print("  原始内容 :", new_raw)
    print("旧版机器码 :", legacy_code)
    print("  原始内容 :", legacy_raw)
    print("两者一致   :", new_code == legacy_code)


if __name__ == "__main__":
    main()
