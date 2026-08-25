import { describe, expect, it, vi } from "vitest";

import { isCurrentRender } from "../src/app/render-token.js";

describe("render token guard", () => {
  it("blocks stale render side effects after an interleaved animation frame", async () => {
    let currentRenderToken = 1;
    const staleRenderToken = currentRenderToken;
    let releaseFrame;
    const animationFrame = new Promise((resolve) => {
      releaseFrame = resolve;
    });
    const postFrameSideEffect = vi.fn();

    const staleRender = (async () => {
      await animationFrame;
      if (!isCurrentRender(staleRenderToken, currentRenderToken)) return;
      postFrameSideEffect();
    })();

    currentRenderToken += 1;
    releaseFrame();
    await staleRender;

    expect(postFrameSideEffect).not.toHaveBeenCalled();
  });

  it("keeps the current renderer, subgraph, and status when a stale render rejects", async () => {
    let currentRenderToken = 1;
    const staleRenderToken = currentRenderToken;
    const currentRenderer = { clear: vi.fn() };
    const latestSubgraph = { id: "latest" };
    let currentSubgraph = latestSubgraph;
    let currentStatus = "latest render ready";
    let rejectStaleRender;
    const staleRenderRequest = new Promise((_, reject) => {
      rejectStaleRender = reject;
    });

    const staleRender = (async () => {
      try {
        await staleRenderRequest;
      } catch (error) {
        if (error?.name === "AbortError") return;
        if (!isCurrentRender(staleRenderToken, currentRenderToken)) return;
        currentRenderer.clear();
        currentSubgraph = null;
        currentStatus = `render failed: ${error.message}`;
      }
    })();

    currentRenderToken += 1;
    rejectStaleRender(new Error("stale render failed"));
    await staleRender;

    expect(currentRenderer.clear).not.toHaveBeenCalled();
    expect(currentSubgraph).toBe(latestSubgraph);
    expect(currentStatus).toBe("latest render ready");
  });
});
