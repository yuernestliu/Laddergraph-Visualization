import { describe, expect, it } from "vitest";

import { createLoadGenerationTracker } from "../src/app/load-generation.js";

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("load generation tracker", () => {
  it("prevents a late default graph from replacing a newer local selection", async () => {
    const tracker = createLoadGenerationTracker();
    const defaultLoad = tracker.beginGraphAction("default");
    const defaultDot = deferred();
    let graph = "";

    const finishDefaultLoad = (async () => {
      const dot = await defaultDot.promise;
      if (tracker.isCurrentGraph(defaultLoad.graphToken)) graph = dot;
    })();

    const localLoad = tracker.beginGraphAction("local-file");
    if (tracker.isCurrentGraph(localLoad.graphToken)) graph = "local DOT";

    defaultDot.resolve("default DOT");
    await finishDefaultLoad;

    expect(graph).toBe("local DOT");
    expect(tracker.isCurrentNodeInfo(defaultLoad.nodeInfoToken)).toBe(false);
  });

  it("prevents a late automatic CSV from replacing a newer manual node-info file", async () => {
    const tracker = createLoadGenerationTracker();
    tracker.beginGraphAction("default");
    const automaticLoad = tracker.beginNodeInfoAction("automatic-csv");
    const automaticCsv = deferred();
    let nodeInfo = "";

    const finishAutomaticLoad = (async () => {
      const csv = await automaticCsv.promise;
      if (tracker.isCurrentNodeInfo(automaticLoad)) nodeInfo = csv;
    })();

    const manualLoad = tracker.beginNodeInfoAction("manual-file");
    if (tracker.isCurrentNodeInfo(manualLoad)) nodeInfo = "manual CSV";

    automaticCsv.resolve("automatic CSV");
    await finishAutomaticLoad;

    expect(nodeInfo).toBe("manual CSV");
  });

  it("marks default-owned node state stale after a newer manual selection", () => {
    const tracker = createLoadGenerationTracker();
    const defaultLoad = tracker.beginGraphAction("default");

    const manualLoad = tracker.beginNodeInfoAction("manual-file");

    expect(tracker.isCurrentGraph(defaultLoad.graphToken)).toBe(true);
    expect(tracker.isCurrentNodeInfo(defaultLoad.nodeInfoToken)).toBe(false);
    expect(tracker.isCurrentNodeInfo(manualLoad)).toBe(true);
  });

  it("invalidates same-name CSV work as soon as a new graph is selected", () => {
    const tracker = createLoadGenerationTracker();
    tracker.beginGraphAction("default");
    const sameNameCsv = tracker.beginNodeInfoAction("same-name-csv");

    tracker.beginGraphAction("local-file");

    expect(tracker.isCurrentNodeInfo(sameNameCsv)).toBe(false);
  });

  it("lets the default graph own its matching CSV and render exactly once", async () => {
    const tracker = createLoadGenerationTracker();
    const defaultLoad = tracker.beginGraphAction("default");
    const defaultDot = deferred();
    const defaultCsv = deferred();
    const state = { graph: "", nodeInfo: "", renderCount: 0 };

    const finishDefaultLoad = (async () => {
      const dot = await defaultDot.promise;
      if (!tracker.isCurrentGraph(defaultLoad.graphToken)) return;
      state.graph = dot;

      const csv = await defaultCsv.promise;
      if (tracker.isCurrentNodeInfo(defaultLoad.nodeInfoToken)) state.nodeInfo = csv;
      if (tracker.isCurrentGraph(defaultLoad.graphToken)) state.renderCount += 1;
    })();

    defaultDot.resolve("default DOT");
    defaultCsv.resolve("matching CSV");
    await finishDefaultLoad;

    expect(state).toEqual({
      graph: "default DOT",
      nodeInfo: "matching CSV",
      renderCount: 1,
    });
  });
});
