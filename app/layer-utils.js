import { applyVisibleSubgraphFilters, summarizeGraph } from "../graphviz-core.js";

export function clampLayerDepth(value, maxDepth) {
  return Math.max(0, Math.min(maxDepth, Number.isFinite(value) ? Math.trunc(value) : 0));
}

export function getTrimmedLayerCount(depth, maxDepth) {
  return clampLayerDepth(depth, maxDepth);
}

export function getLayerDepthLabel(depth, maxDepth) {
  const trimmed = getTrimmedLayerCount(depth, maxDepth);
  if (trimmed <= 0) {
    return "全部";
  }
  return `-${trimmed}层`;
}

export function getSuggestedLayerDepth(
  baseSubgraph,
  layerMeta,
  componentFilterThreshold,
  nodeThreshold,
  edgeThreshold,
) {
  if (!baseSubgraph || !layerMeta) return 0;

  const fits = (trimmed) => {
    const candidate = applyVisibleSubgraphFilters(
      baseSubgraph,
      trimmed,
      layerMeta,
      componentFilterThreshold,
    );
    const stats = summarizeGraph(candidate);
    return stats.nodeCount <= nodeThreshold && stats.edgeCount <= edgeThreshold;
  };

  // Trimming more layers can only remove nodes and edges, never add them, so `fits`
  // is monotone in `trimmed` and the smallest fitting depth can be binary searched.
  // Each probe is a full graph scan, so this matters a lot on 10k+ node graphs.
  let low = 0;
  let high = layerMeta.maxDepth;
  let suggested = layerMeta.maxDepth;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) {
      suggested = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  return suggested;
}
