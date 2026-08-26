import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildDisplayComponentState } from "../src/app/display-components.js";
import {
  applyVisibleSubgraphFilters,
  buildNodeLayerMap,
  parseDot,
  sanitizeParsedGraph,
} from "../src/core/graphviz-core.js";

describe("display component target statistics", () => {
  it("counts targets per tab and separates omitted singleton targets from other isolated nodes", () => {
    const parsed = {
      graphAttrs: {},
      nodes: [
        { id: "root-a", attrs: {} },
        { id: "-1", attrs: {} },
        { id: "-2", attrs: {} },
        { id: "root-b", attrs: {} },
        { id: "-4", attrs: {} },
        { id: "-3", attrs: {} },
        { id: "ordinary-island", attrs: {} },
      ],
      edges: [
        { from: "root-a", to: "-1", attrs: {} },
        { from: "root-a", to: "-2", attrs: {} },
        { from: "root-b", to: "-4", attrs: {} },
      ],
    };

    const state = buildDisplayComponentState(parsed, { minComponentSize: 2 });

    expect(state.displayComponents.map((component) => component.stats.targetCount)).toEqual([2, 1]);
    expect(state.displayComponents.map((component) => component.label)).toEqual([
      "1 · 3 节点 · target 2",
      "2 · 2 节点 · target 1",
    ]);
    expect(state.isolatedCount).toBe(2);
    expect(state.omittedSingleTargetIds).toEqual(["-3"]);
  });

  it("matches the 神兽 shallow-layer tab and omitted-target breakdown", () => {
    const dotText = readFileSync(
      new URL("../src/assets/example_graphs/神兽lg.gv", import.meta.url),
      "utf8",
    );
    const parsed = sanitizeParsedGraph(parseDot(dotText));
    const layerMeta = buildNodeLayerMap(parsed);

    const depthSevenState = buildDisplayComponentState(
      applyVisibleSubgraphFilters(parsed, 7, layerMeta, 0),
      { minComponentSize: 2 },
    );
    expect(
      depthSevenState.displayComponents.map((component) => component.stats.targetCount),
    ).toEqual([8, 3, 3, 2, 1, 1]);
    expect(depthSevenState.omittedSingleTargetIds).toEqual([
      "-4",
      "-6",
      "-8",
      "-15",
      "-16",
      "-18",
    ]);

    const depthEightState = buildDisplayComponentState(
      applyVisibleSubgraphFilters(parsed, 8, layerMeta, 0),
      { minComponentSize: 2 },
    );
    expect(depthEightState.omittedSingleTargetIds).toEqual([
      "-1",
      "-2",
      "-11",
      "-17",
      "-19",
      "-20",
      "-22",
      "-23",
      "-24",
    ]);
  });
});
