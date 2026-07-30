from __future__ import annotations

import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from backend.graphviz_render_service import (
    DEFAULT_DOT_BIN,
    GraphvizBinaryNotFoundError,
    GraphvizRenderError,
    render_dot_to_svg,
)

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8000


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

        try:
            render_result = render_dot_to_svg(dot_source, engine, dot_bin=DEFAULT_DOT_BIN, cwd=str(ROOT))
        except GraphvizBinaryNotFoundError as exc:
            self._write_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": f"调用 Graphviz 失败：{exc}"},
            )
            return
        except GraphvizRenderError as exc:
            self._write_json(
                HTTPStatus.BAD_REQUEST,
                {
                    "error": "Graphviz 渲染失败。",
                    "details": str(exc),
                },
            )
            return
        except Exception as exc:
            self._write_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": f"调用 Graphviz 失败：{exc}"},
            )
            return

        svg_body = render_result.svg_text.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
        self.send_header("Content-Length", str(len(svg_body)))
        self.send_header("X-Graphviz-Engine", engine)
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
