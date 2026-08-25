export const ALLOWED_GRAPHVIZ_ENGINES = Object.freeze(["dot", "neato"]);

const ALLOWED_GRAPHVIZ_ENGINE_SET = new Set(ALLOWED_GRAPHVIZ_ENGINES);

export function validateGraphvizRenderInput(dot, engine) {
  if (typeof dot !== "string" || !dot.trim()) {
    throw new GraphvizRenderError("缺少可渲染的 DOT 内容。", {
      code: "INVALID_DOT_INPUT",
    });
  }

  if (!ALLOWED_GRAPHVIZ_ENGINE_SET.has(engine)) {
    throw new GraphvizRenderError(
      `不支持的 Graphviz 布局引擎：${engine || "（空）"}；可用值：${ALLOWED_GRAPHVIZ_ENGINES.join(", ")}`,
      { code: "UNSUPPORTED_ENGINE" },
    );
  }
}

export class GraphvizRenderError extends Error {
  constructor(message, options = {}) {
    super(String(message || "Graphviz 渲染失败。"));
    this.name = "GraphvizRenderError";
    this.code = options.code || "GRAPHVIZ_RENDER_FAILED";
    this.details = Array.isArray(options.details) ? options.details : [];
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function serializeRenderError(error, fallbackCode = "GRAPHVIZ_RENDER_FAILED") {
  const details = Array.isArray(error?.details)
    ? error.details.map((detail) => String(detail)).filter(Boolean)
    : [];

  return {
    name: String(error?.name || "Error"),
    code: String(error?.code || fallbackCode),
    message: String(error?.message || "Graphviz 渲染失败。"),
    details,
  };
}

export function deserializeRenderError(payload) {
  return new GraphvizRenderError(payload?.message, {
    code: payload?.code,
    details: payload?.details,
  });
}
