import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isTargetNode,
  parseDot,
  sanitizeParsedGraph,
  summarizeGraph,
} from "../src/core/graphviz-core.js";

describe("graph sanitation and target summaries", () => {
  it("preserves the legitimate -1 target in the 神兽 example", () => {
    const dotText = readFileSync(
      new URL("../src/assets/example_graphs/神兽lg.gv", import.meta.url),
      "utf8",
    );
    const parsed = sanitizeParsedGraph(parseDot(dotText));
    const targetIds = parsed.nodes
      .filter((node) => isTargetNode(node.attrs, node.id))
      .map((node) => node.id);

    expect(summarizeGraph(parsed)).toEqual({
      nodeCount: 159,
      edgeCount: 520,
      targetCount: 24,
    });
    expect(targetIds).toContain("-1");
    expect(parsed.edges.filter((edge) => edge.from === "1" && edge.to === "-1")).toHaveLength(2);
  });

  it("keeps every declared node while removing invisible layout edges", () => {
    const parsed = sanitizeParsedGraph(parseDot(`
      digraph {
        -1 [label="." color=white fillcolor=white rank=max style=filled]
        a [label="real"]
        a -> -1 [color="#ffffffff"]
      }
    `));

    expect(parsed.nodes.map((node) => node.id)).toEqual(["-1", "a"]);
    expect(parsed.edges).toEqual([]);
  });
});
