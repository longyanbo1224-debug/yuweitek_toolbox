# -*- coding: utf-8 -*-
"""
一键更新版本号脚本
用法: python update_version.py 1.3.2
"""
import sys
import re
import os

# 需要替换的文件和对应的正则模式
REPLACEMENTS = [
    {
        "file": "installer.iss",
        "pattern": r'(#define\s+MyAppVersion\s+")([^"]+)(")',
        "label": "installer.iss → #define MyAppVersion",
    },
    {
        "file": os.path.join("flask", "adb", "config.py"),
        "pattern": r'(APP_VERSION\s*=\s*")([^"]+)(")',
        "label": "config.py → APP_VERSION",
    },
    {
        "file": os.path.join("js", "core", "config.js"),
        "pattern": r'(const\s+FRONTEND_VERSION\s*=\s*")([^"]+)(")',
        "label": "config.js → FRONTEND_VERSION",
    },
]


def main():
    if len(sys.argv) < 2:
        print("用法: python update_version.py <新版本号>")
        print("示例: python update_version.py 1.3.2")
        return 1

    new_version = sys.argv[1].strip()

    # 简单校验版本号格式
    if not re.match(r'^\d+\.\d+\.\d+$', new_version):
        print(f"[ERROR] 版本号格式不正确: {new_version}")
        print("请使用 x.y.z 格式，例如 1.3.2")
        return 1

    root = os.path.dirname(os.path.abspath(__file__))
    success_count = 0

    print(f"目标版本: {new_version}\n")

    for item in REPLACEMENTS:
        file_path = os.path.join(root, item["file"])
        if not os.path.isfile(file_path):
            print(f"  [SKIP] 文件不存在: {item['file']}")
            continue

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        match = re.search(item["pattern"], content)
        if not match:
            print(f"  [WARN] 未匹配到模式: {item['label']}")
            continue

        old_version = match.group(2)
        if old_version == new_version:
            print(f"  [OK]   {item['label']}  已是 {new_version}，无需修改")
            success_count += 1
            continue

        new_content = re.sub(item["pattern"], rf'\g<1>{new_version}\g<3>', content)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        print(f"  [OK]   {item['label']}  {old_version} → {new_version}")
        success_count += 1

    print(f"\n完成: {success_count}/{len(REPLACEMENTS)} 个文件已更新")
    return 0


if __name__ == "__main__":
    sys.exit(main())
