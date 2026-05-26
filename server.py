import http.server
import os
import pathlib
import socketserver
import sys

# 站点根目录：脚本所在目录
ROOT = pathlib.Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "3000"))


class SpaHandler(http.server.SimpleHTTPRequestHandler):
    """简易静态服务器，未命中路由回退到 index.html，便于前端路由。"""

    def translate_path(self, path: str) -> str:
        clean = path.split("?", 1)[0].split("#", 1)[0]
        target = ROOT.joinpath(clean.lstrip("/"))

        if target.is_dir():
            return str(target / "index.html")
        if target.exists():
            return str(target)
        return str(ROOT / "index.html")


def main() -> None:
    os.chdir(ROOT)
    with socketserver.TCPServer(("", PORT), SpaHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"本地站点已启动: {url}")

        # 自动打开默认浏览器，失败时仅提示
        try:
            import webbrowser

            webbrowser.open(url)
        except Exception:
            print("自动打开浏览器失败，请手动访问上述地址")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止")
            sys.exit(0)


if __name__ == "__main__":
    main()

