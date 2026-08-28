import { describe, expect, it } from "vitest";

import { buildLadderpathSequenceDetailIndex } from "../src/app/ladderpath-json-details.js";

describe("ladderpath JSON sequence details", () => {
  it("indexes both ladderon and target sequences", () => {
    const index = buildLadderpathSequenceDetailIndex(JSON.stringify({
      ladderons: {
        47: [[1, 2], 7, "气火气火气火气", {}],
      },
      targets: {
        "-1": [[1, 1], 64, "土火气水", 1],
      },
    }));

    expect(index.supported).toBe(true);
    expect(index.entriesById.get("47")).toMatchObject({
      type: "sequence",
      nodeKind: "ladderon",
      sequence: "气火气火气火气",
      sequenceLength: 7,
    });
    expect(index.entriesById.get("-1")).toMatchObject({
      type: "sequence",
      nodeKind: "target",
      sequence: "土火气水",
      sequenceLength: 64,
    });
  });
});
