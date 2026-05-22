from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


DEFAULT_DOT_BIN = shutil.which("dot") or "/opt/homebrew/bin/dot"


class GraphvizBinaryNotFoundError(FileNotFoundError):
    pass


class GraphvizRenderError(RuntimeError):
    pass


@dataclass(frozen=True)
class GraphvizRenderResult:
    svg_text: str
    stderr_text: str


def render_dot_to_svg(
    dot_source: str,
    engine: str = "dot",
    *,
    dot_bin: str = DEFAULT_DOT_BIN,
    cwd: str | None = None,
) -> GraphvizRenderResult:
    if not Path(dot_bin).exists():
      raise GraphvizBinaryNotFoundError(f"未找到 Graphviz `dot` 可执行文件：{dot_bin}")

    result = subprocess.run(
        [dot_bin, f"-K{engine}", "-Tsvg"],
        input=dot_source,
        text=True,
        capture_output=True,
        check=False,
        cwd=cwd,
    )
    stderr_text = (result.stderr or "").strip()
    if result.returncode != 0:
        raise GraphvizRenderError(stderr_text or "Graphviz 渲染失败。")

    return GraphvizRenderResult(svg_text=result.stdout, stderr_text=stderr_text)
