function cloneNode(node) {
  return {
    ...node,
    attrs: { ...(node.attrs || {}) },
  };
}

function cloneEdge(edge) {
  return {
    ...edge,
    attrs: { ...(edge.attrs || {}) },
  };
}

function getDirectNeighborIds(parsed, nodeIds) {
  const selected = new Set(Array.from(nodeIds, String));
  const neighbors = new Set(selected);

  for (const edge of parsed.edges || []) {
    if (selected.has(String(edge.from))) neighbors.add(String(edge.to));
    if (selected.has(String(edge.to))) neighbors.add(String(edge.from));
  }

  return neighbors;
}

function decorateFocusedNode(node) {
  node.attrs.style = "filled";
  node.attrs.fillcolor = node.attrs.fillcolor || "#fff9db";
  node.attrs.color = "#f08c00";
  node.attrs.penwidth = "2.4";
  return node;
}

function decorateCollapsedNode(node) {
  node.attrs.shape = "box";
  node.attrs.style = "rounded,filled";
  node.attrs.fillcolor = "#e7f5ff";
  node.attrs.color = "#1971c2";
  node.attrs.penwidth = "2.2";
  node.attrs.label = `折叠\\n${node.id}`;
  return node;
}

export function projectRefineGraph(parsed, state) {
  if (!parsed || !state || state.isEmpty()) return parsed;

  const hiddenNodeIds = new Set(Array.from(state.hiddenNodeIds || [], String));
  const focusedNodeIds = new Set(Array.from(state.focusedNodeIds || [], String));
  const collapsedNodeIds = new Set(Array.from(state.collapsedNodeIds || [], String));
  const focusOnlyNodeIds =
    state.focusOnly && focusedNodeIds.size ? getDirectNeighborIds(parsed, focusedNodeIds) : null;

  const visibleNodes = [];
  for (const sourceNode of parsed.nodes || []) {
    const nodeId = String(sourceNode.id);
    if (hiddenNodeIds.has(nodeId)) continue;
    if (focusOnlyNodeIds && !focusOnlyNodeIds.has(nodeId)) continue;

    let node = cloneNode(sourceNode);
    if (collapsedNodeIds.has(nodeId)) {
      node = decorateCollapsedNode(node);
    } else if (focusedNodeIds.has(nodeId)) {
      node = decorateFocusedNode(node);
    }
    visibleNodes.push(node);
  }

  const visibleNodeIds = new Set(visibleNodes.map((node) => String(node.id)));
  const visibleEdges = (parsed.edges || [])
    .filter((edge) => visibleNodeIds.has(String(edge.from)) && visibleNodeIds.has(String(edge.to)))
    .map(cloneEdge);

  return {
    graphAttrs: parsed.graphAttrs,
    nodes: visibleNodes,
    edges: visibleEdges,
  };
}
