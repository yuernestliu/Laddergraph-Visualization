function freezeToken(token) {
  return Object.freeze(token);
}

/**
 * Coordinates asynchronous graph and node-info loads with latest-action-wins
 * semantics. A node-info token is also tied to the graph that owned it, so a
 * later graph selection always makes outstanding CSV/JSON work stale.
 */
export function createLoadGenerationTracker() {
  let graphGeneration = 0;
  let nodeInfoGeneration = 0;

  function createNodeInfoToken(owner) {
    return freezeToken({
      scope: "node-info",
      generation: nodeInfoGeneration,
      graphGeneration,
      owner,
    });
  }

  return Object.freeze({
    beginGraphAction(owner = "graph") {
      graphGeneration += 1;
      nodeInfoGeneration += 1;

      return Object.freeze({
        graphToken: freezeToken({
          scope: "graph",
          generation: graphGeneration,
          owner,
        }),
        nodeInfoToken: createNodeInfoToken(owner),
      });
    },

    beginNodeInfoAction(owner = "node-info") {
      nodeInfoGeneration += 1;
      return createNodeInfoToken(owner);
    },

    isCurrentGraph(token) {
      return token?.scope === "graph" && token.generation === graphGeneration;
    },

    isCurrentNodeInfo(token) {
      return token?.scope === "node-info"
        && token.generation === nodeInfoGeneration
        && token.graphGeneration === graphGeneration;
    },
  });
}
