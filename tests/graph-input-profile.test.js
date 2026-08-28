import { describe, expect, it } from "vitest";

import {
  GRAPH_INPUT_KINDS,
  buildSequenceNodeDetail,
  detectGraphInputKind,
  extractSequenceLengthSuffix,
  formatNodeIdForDisplay,
} from "../src/core/graph-input-profile.js";
import { parseDot, serializeGraphToDot } from "../src/core/graphviz-core.js";

describe("graph input display profiles", () => {
  it("detects sequence input and appends its bracketed length in ID mode", () => {
    const parsed = parseDot(`
      digraph {
        node [shape=box]
        -1 [label="-1[64]"]
        47 [label="气火气火气火气[7] (3)"]
        b0 [label="土 (43)" shape=hexagon]
      }
    `);

    const inputKind = detectGraphInputKind(parsed);
    expect(inputKind).toBe(GRAPH_INPUT_KINDS.SEQUENCE);
    expect(formatNodeIdForDisplay(parsed.nodes[0], GRAPH_INPUT_KINDS.SEQUENCE)).toBe("-1[64]");
    expect(formatNodeIdForDisplay(parsed.nodes[1], GRAPH_INPUT_KINDS.SEQUENCE)).toBe("47[7]");
    expect(formatNodeIdForDisplay(parsed.nodes[2], GRAPH_INPUT_KINDS.SEQUENCE)).toBe("b0");
    expect(extractSequenceLengthSuffix("序列[1,024] (2)")).toBe("[1,024]");
    expect(buildSequenceNodeDetail(parsed.nodes[1], inputKind)).toMatchObject({
      type: "sequence",
      id: "47",
      sequence: "气火气火气火气",
      sequenceLength: 7,
    });
    expect(buildSequenceNodeDetail(parsed.nodes[0], inputKind)).toBeNull();

    const serialized = serializeGraphToDot(parsed, {
      graphInputKind: inputKind,
      layoutMode: "hierarchicalTB",
      nodeTextMode: "id",
      nodeSizeMode: "fixed",
      labelFontSize: 10,
    });
    const renderGraph = parseDot(serialized.dot);
    expect(renderGraph.nodes.find((node) => node.id === "47")?.attrs?.label).toBe("47[7]");
  });

  it("keeps collection input on the existing plain-ID display behavior", () => {
    const parsed = parseDot(`
      digraph {
        0 [label="0.1\\n0[1405]." shape=ellipse]
        20 [label="20[1812]." shape=ellipse]
      }
    `);

    expect(detectGraphInputKind(parsed)).toBe(GRAPH_INPUT_KINDS.COLLECTION);
    expect(formatNodeIdForDisplay(parsed.nodes[0], GRAPH_INPUT_KINDS.COLLECTION)).toBe("0");
    expect(formatNodeIdForDisplay(parsed.nodes[1], GRAPH_INPUT_KINDS.COLLECTION)).toBe("20");
  });
});
