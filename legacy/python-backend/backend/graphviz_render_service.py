from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


DEFAULT_DOT_BIN = shutil.which("dot") or "/opt/homebrew/bin/dot"
SUPPORTED_ENGINES = ("dot", "neato")
DEFAULT_TIMEOUT_SECONDS = 60.0


class GraphvizBinaryNotFoundError(FileNotFoundError):
    pass


class GraphvizRenderError(RuntimeError):
    pass


class UnsupportedGraphvizEngineError(ValueError):
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
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> GraphvizRenderResult:
    if engine not in SUPPORTED_ENGINES:
        raise UnsupportedGraphvizEngineError(
            f"不支持的 Graphviz 布局引擎：{engine}；可用值：{', '.join(SUPPORTED_ENGINES)}"
        )

    if not Path(dot_bin).exists():
        raise GraphvizBinaryNotFoundError(f"未找到 Graphviz `dot` 可执行文件：{dot_bin}")

    try:
        result = subprocess.run(
            [dot_bin, f"-K{engine}", "-Tsvg"],
            input=dot_source,
            text=True,
            capture_output=True,
            check=False,
            cwd=cwd,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise GraphvizRenderError(
            f"Graphviz 渲染超过 {timeout:g} 秒未完成，已中止。请减少显示的节点数后重试。"
        ) from exc

    stderr_text = (result.stderr or "").strip()
    if result.returncode != 0:
        raise GraphvizRenderError(stderr_text or "Graphviz 渲染失败。")

    return GraphvizRenderResult(svg_text=result.stdout, stderr_text=stderr_text)
