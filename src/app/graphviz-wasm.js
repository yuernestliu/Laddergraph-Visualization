import { instance } from "@viz-js/viz";
import {
  GraphvizRenderError,
  validateGraphvizRenderInput,
} from "./graphviz-render-protocol.js";

let vizInstancePromise = null;

async function getVizInstance() {
  if (!vizInstancePromise) {
    vizInstancePromise = instance().catch((error) => {
      vizInstancePromise = null;
      throw new GraphvizRenderError("浏览器端 Graphviz 初始化失败。", {
        code: "WASM_INIT_FAILED",
        cause: error,
        details: error?.message ? [error.message] : [],
      });
    });
  }
  return vizInstancePromise;
}

export async function renderDotWithGraphviz(dot, engine) {
  validateGraphvizRenderInput(dot, engine);
  const viz = await getVizInstance();
  const result = viz.render(dot, { format: "svg", engine });
  const messages = result.errors
    .map(({ level, message }) => `${level ? `${level}: ` : ""}${message}`.trim())
    .filter(Boolean);

  if (result.status !== "success") {
    throw new GraphvizRenderError(
      result.errors.find(({ level }) => level === "error")?.message || "Graphviz 无法解析这份 DOT。",
      {
        code: "GRAPHVIZ_RENDER_FAILED",
        details: messages,
      },
    );
  }

  if (typeof result.output !== "string" || !/<svg(?:\s|>)/i.test(result.output)) {
    throw new GraphvizRenderError("Graphviz 没有返回有效 SVG。", {
      code: "INVALID_GRAPHVIZ_OUTPUT",
      details: messages,
    });
  }

  return {
    svgMarkup: result.output,
    warnings: result.errors
      .filter(({ level }) => level !== "error")
      .map(({ message }) => String(message || "").trim())
      .filter(Boolean),
  };
}
