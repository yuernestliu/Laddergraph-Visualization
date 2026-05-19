from __future__ import annotations

import json
import shutil
import subprocess
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8000
DOT_BIN = shutil.which("dot") or "/opt/homebrew/bin/dot"


class GraphvizHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self) -> None:
        if self.path != "/api/render":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return

        content_length = int(self.headers.get("Content-Length", "0") or "0")
        try:
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:
            self._write_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "请求体必须是合法 JSON。"},
            )
            return

        dot_source = str(payload.get("dot") or "")
        engine = str(payload.get("engine") or "dot").strip() or "dot"
        if not dot_source.strip():
            self._write_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "缺少 DOT 内容。"},
            )
            return

        if not Path(DOT_BIN).exists():
            self._write_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": f"未找到 Graphviz `dot` 可执行文件：{DOT_BIN}"},
            )
            return

        try:
            result = subprocess.run(
                [DOT_BIN, f"-K{engine}", "-Tsvg"],
                input=dot_source,
                text=True,
                capture_output=True,
                check=False,
                cwd=str(ROOT),
            )
        except Exception as exc:
            self._write_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": f"调用 Graphviz 失败：{exc}"},
            )
            return

        if result.returncode != 0:
            self._write_json(
                HTTPStatus.BAD_REQUEST,
                {
                    "error": "Graphviz 渲染失败。",
                    "details": (result.stderr or "").strip(),
                },
            )
            return

        svg_body = result.stdout.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
        self.send_header("Content-Length", str(len(svg_body)))
        self.send_header("X-Graphviz-Engine", engine)
        self.send_header("X-Graphviz-Stderr", (result.stderr or "").strip())
        self.end_headers()
        self.wfile.write(svg_body)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _write_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), GraphvizHandler)
    print(f"Serving {ROOT} at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
