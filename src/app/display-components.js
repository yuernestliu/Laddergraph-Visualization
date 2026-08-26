import { isTargetNode } from "../core/graphviz-core.js";

export const DEFAULT_MIN_COMPONENT_SIZE = 2;
export const MAX_INLINE_COMPONENT_TABS = 20;

function clampToInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampMinComponentSize(value, maxSize = DEFAULT_MIN_COMPONENT_SIZE) {
  const upper = Math.max(DEFAULT_MIN_COMPONENT_SIZE, clampToInteger(maxSize, DEFAULT_MIN_COMPONENT_SIZE));
  return Math.max(
    DEFAULT_MIN_COMPONENT_SIZE,
    Math.min(upper, clampToInteger(value, DEFAULT_MIN_COMPONENT_SIZE)),
  );
}

function hashParts(parts) {
  let hash = 2166136261;
  const sortedParts = Array.from(parts, String).sort((a, b) => a.localeCompare(b));

  for (const part of sortedParts) {
    for (let i = 0; i < part.length; i += 1) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 31;
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function makeComponentId(nodeIds, edgeIds) {
  return `component-${nodeIds.length}-${edgeIds.length}-${hashParts([...nodeIds, ...edgeIds])}`;
}

function createComponentDescriptor(parsed, nodeIds, targetNodeIdSet) {
  const uniqueNodeIds = Array.from(new Set(nodeIds));
  const nodeSet = new Set(uniqueNodeIds);
  const targetNodeIds = uniqueNodeIds.filter((nodeId) => targetNodeIdSet.has(nodeId));
  const edgeIds = [];
  let edgeCount = 0;

  for (const edge of parsed.edges) {
    if (nodeSet.has(edge.from) && nodeSet.has(edge.to)) {
      edgeCount += 1;
      edgeIds.push(`${edge.from}->${edge.to}`);
    }
  }

  return {
    id: makeComponentId(uniqueNodeIds, edgeIds),
    nodeIds: uniqueNodeIds,
    nodeSet,
    targetNodeIds,
    stats: {
      nodeCount: uniqueNodeIds.length,
      edgeCount,
      targetCount: targetNodeIds.length,
    },
  };
}

export function buildConnectedComponents(parsed) {
  if (!parsed) return [];

  const adjacency = new Map(parsed.nodes.map((node) => [node.id, new Set()]));
  const targetNodeIdSet = new Set(
    parsed.nodes
      .filter((node) => isTargetNode(node.attrs, node.id))
      .map((node) => node.id),
  );
  for (const edge of parsed.edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue;
    adjacency.get(edge.from).add(edge.to);
    adjacency.get(edge.to).add(edge.from);
  }

  const visited = new Set();
  const components = [];

  for (const node of parsed.nodes) {
    if (visited.has(node.id)) continue;

    const queue = [node.id];
    const nodeIds = [];
    visited.add(node.id);

    while (queue.length) {
      const nodeId = queue.shift();
      nodeIds.push(nodeId);

      for (const neighborId of adjacency.get(nodeId) || []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    components.push(createComponentDescriptor(parsed, nodeIds, targetNodeIdSet));
  }

  return components.sort((a, b) => {
    if (b.stats.nodeCount !== a.stats.nodeCount) {
      return b.stats.nodeCount - a.stats.nodeCount;
    }
    if (b.stats.edgeCount !== a.stats.edgeCount) {
      return b.stats.edgeCount - a.stats.edgeCount;
    }
    return a.id.localeCompare(b.id);
  });
}

function withDisplayLabels(component, index) {
  const ordinal = index + 1;
  const shortLabel =
    `${ordinal} · ${component.stats.nodeCount} 节点 · target ${component.stats.targetCount}`;
  return {
    ...component,
    ordinal,
    label: shortLabel,
    optionLabel: `${shortLabel} / ${component.stats.edgeCount} 边`,
  };
}

export function buildDisplayComponentState(parsed, options = {}) {
  const allComponents = buildConnectedComponents(parsed);
  const eligibleComponents = allComponents.filter(
    (component) => component.stats.nodeCount >= DEFAULT_MIN_COMPONENT_SIZE,
  );
  const isolatedCount = allComponents.length - eligibleComponents.length;
  const minComponentSizeMax = eligibleComponents.reduce(
    (maxSize, component) => Math.max(maxSize, component.stats.nodeCount),
    DEFAULT_MIN_COMPONENT_SIZE,
  );
  const minComponentSize = clampMinComponentSize(
    options.minComponentSize,
    minComponentSizeMax,
  );
  const displayComponents = eligibleComponents
    .filter((component) => component.stats.nodeCount >= minComponentSize)
    .map(withDisplayLabels);
  const singleTargetNodeIdSet = new Set(
    allComponents
      .filter(
        (component) =>
          component.stats.nodeCount === 1 && component.stats.targetCount === 1,
      )
      .flatMap((component) => component.targetNodeIds),
  );
  const omittedSingleTargetIds = parsed.nodes
    .map((node) => node.id)
    .filter((nodeId) => singleTargetNodeIdSet.has(nodeId));

  return {
    allComponents,
    eligibleComponents,
    displayComponents,
    isolatedCount,
    omittedSingleTargetIds,
    minComponentSize,
    minComponentSizeMax,
  };
}

export function getSubgraphForDisplayComponent(parsed, component) {
  if (!parsed || !component) return parsed;
  return {
    graphAttrs: parsed.graphAttrs,
    nodes: parsed.nodes.filter((node) => component.nodeSet.has(node.id)),
    edges: parsed.edges.filter(
      (edge) => component.nodeSet.has(edge.from) && component.nodeSet.has(edge.to),
    ),
  };
}
