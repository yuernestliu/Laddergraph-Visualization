import { serializeRenderError } from "./graphviz-render-protocol.js";
import { renderDotWithGraphviz } from "./graphviz-wasm.js";

self.addEventListener("message", async (event) => {
  const message = event.data;
  if (message?.type !== "render") return;

  const { id, dot, engine } = message;
  try {
    const result = await renderDotWithGraphviz(dot, engine);
    self.postMessage({
      type: "render-result",
      id,
      ...result,
    });
  } catch (error) {
    self.postMessage({
      type: "render-error",
      id,
      error: serializeRenderError(error),
    });
  }
});
