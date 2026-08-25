import { describe, expect, it } from "vitest";

import { renderDotWithGraphviz } from "../src/app/graphviz-wasm.js";

describe("browser Graphviz WASM", () => {
  it.each(["dot", "neato"])("renders an interactive SVG with the %s engine", async (engine) => {
    const { svgMarkup } = await renderDotWithGraphviz(
      "digraph { a [label=Alpha]; a -> b; }",
      engine,
    );

    expect(svgMarkup).toMatch(/<svg(?:\s|>)/i);
    expect(svgMarkup).toMatch(/class="node"/);
    expect(svgMarkup).toMatch(/class="edge"/);
    expect(svgMarkup).toContain("<title>a</title>");
    expect(svgMarkup).toContain("<title>a&#45;&gt;b</title>");
  });

  it("returns a structured syntax error", async () => {
    await expect(renderDotWithGraphviz("digraph { a ->", "dot")).rejects.toMatchObject({
      name: "GraphvizRenderError",
      code: "GRAPHVIZ_RENDER_FAILED",
    });
  });

  it("rejects engines outside the public allow-list", async () => {
    await expect(renderDotWithGraphviz("digraph { a -> b }", "fdp")).rejects.toMatchObject({
      code: "UNSUPPORTED_ENGINE",
    });
  });
});
