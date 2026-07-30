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

  for (let trimmed = 0; trimmed <= layerMeta.maxDepth; trimmed += 1) {
    const candidate = applyVisibleSubgraphFilters(
      baseSubgraph,
      trimmed,
      layerMeta,
      componentFilterThreshold,
    );
    const stats = summarizeGraph(candidate);
    if (stats.nodeCount <= nodeThreshold && stats.edgeCount <= edgeThreshold) {
      return trimmed;
    }
  }

  return layerMeta.maxDepth;
}
