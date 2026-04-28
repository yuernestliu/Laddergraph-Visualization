const sampleDot = `digraph {
  rankdir=BT size="8,8"
  node [shape=box]
  -1 [label=ABCDBCDBCDCDEFEF]
  -2 [label=AAB]
  -3 [label=DBCDBCA]
  -4 [label=BCDCDAEF]
  -5 [label=CDEFEFABC]
  b0 [label=A color=grey shape=hexagon]
  b1 [label=B color=grey shape=hexagon]
  b2 [label=D color=grey shape=hexagon]
  b3 [label=C color=grey shape=hexagon]
  b4 [label=E color=grey shape=hexagon]
  b5 [label=F color=grey shape=hexagon]
  0 [label=DBCDBC color=grey style=filled]
  0 -> -1 [color=grey]
  0 -> -3 [color=grey]
  1 [label=CDEFEF color=grey style=filled]
  1 -> -1 [color=grey]
  1 -> -5 [color=grey]
  2 [label=DBC color=grey style=filled]
  2 -> 0 [color=grey]
  3 [label=ABC color=grey style=filled]
  3 -> -1 [color=grey]
  3 -> -5 [color=grey]
  4 [label=BC color=grey style=filled]
  4 -> 3 [color=grey]
  4 -> -4 [color=grey]
  4 -> 2 [color=grey]
  5 [label=EF color=grey style=filled]
  5 -> -4 [color=grey]
  5 -> 1 [color=grey]
  6 [label=CD color=grey style=filled]
  6 -> -4 [color=grey]
  6 -> 1 [color=grey]
  b2 -> 2 [color=grey]
  b0 -> 3 [color=grey]
  b1 -> 4 [color=grey]
  b3 -> 4 [color=grey]
  b4 -> 5 [color=grey]
  b5 -> 5 [color=grey]
  b3 -> 6 [color=grey]
  b2 -> 6 [color=grey]
  b2 -> -1 [color=grey]
  b0 -> -2 [color=grey]
  b1 -> -2 [color=grey]
  b0 -> -3 [color=grey]
  b2 -> -4 [color=grey]
  b0 -> -4 [color=grey]
}`;

const fileInput = document.getElementById("fileInput");
const renderBtn = document.getElementById("renderBtn");
const statusEl = document.getElementById("status");
const layoutSelect = document.getElementById("layoutSelect");
const applyLayoutBtn = document.getElementById("applyLayoutBtn");
const toggleNodeTextBtn = document.getElementById("toggleNodeTextBtn");
const nodeTextModeInfo = document.getElementById("nodeTextModeInfo");
const subUpInput = document.getElementById("subUp");
const subDownInput = document.getElementById("subDown");
const extractBtn = document.getElementById("extractBtn");
const subgraphInfo = document.getElementById("subgraphInfo");
const swapBtn = document.getElementById("swapBtn");
const subGraphTitle = document.getElementById("subGraphTitle");

const HIGHLIGHT_RED = "#e60023";
const INCOMING_GREEN = "#2f9e44";
const CENTER_NODE_COLOR = "#5a0010";

let network;
let swapped = false;
let selectedSubgraphNode = null;
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);
let parsedGraph = null;
let currentDotText = sampleDot;
let nodeTextMode = "label";
let originalNodeStyle = new Map();
let originalEdgeStyle = new Map();
let collapsedNodes = new Set();
let highlightedNodeId = null;

let subGraphs = [];
const MAX_SUBGRAPHS = 3;
let currentSubgraphLevel = 0;
let displaySubgraphIndex = -1;

let collapsedSubgraphs = new Map();

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#c92a2a" : "#6b7280";
}

function cleanId(raw) {
  const value = String(raw).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseAttributes(attrText) {
  const attrs = {};
  const regex = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,\]]+)/g;
  let match;
  while ((match = regex.exec(attrText)) !== null) {
    attrs[match[1]] = cleanId(match[2].trim());
  }
  return attrs;
}

function splitStatements(body) {
  const result = [];
  let current = "";
  let inString = false;
  let quoteChar = "";
  let bracketDepth = 0;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      current += ch;
      if (ch === quoteChar && body[i - 1] !== "\\") {
        inString = false;
        quoteChar = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quoteChar = ch;
      current += ch;
      continue;
    }
    if (ch === "[") {
      bracketDepth++;
      current += ch;
      continue;
    }
    if (ch === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += ch;
      continue;
    }
    if ((ch === ";" || ch === "\n") && bracketDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) result.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail) result.push(tail);
  return result;
}

function parseDot(dotText) {
  const withoutComments = dotText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const start = withoutComments.indexOf("{");
  const end = withoutComments.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("DOT 内容缺少有效的大括号结构。");
  }
  const body = withoutComments.slice(start + 1, end);
  const statements = splitStatements(body);
  const graphAttrs = {};
  const defaultNodeAttrs = {};
  const defaultEdgeAttrs = {};
  const nodeMap = new Map();
  const edgeList = [];

  for (const stmt of statements) {
    if (stmt === "{" || stmt === "}") continue;
    const edgeMatch = stmt.match(/^(.*?)\s*->\s*(.*)$/);
    if (edgeMatch) {
      const attrMatch = stmt.match(/\[(.*)\]\s*$/);
      const attrs = attrMatch ? parseAttributes(attrMatch[1]) : {};
      const edgeExpr = attrMatch ? stmt.slice(0, attrMatch.index).trim() : stmt.trim();
      const ids = edgeExpr.split(/->/).map((s) => cleanId(s.trim())).filter(Boolean);
      for (let i = 0; i < ids.length - 1; i++) {
        const from = ids[i];
        const to = ids[i + 1];
        if (!nodeMap.has(from)) nodeMap.set(from, { id: from });
        if (!nodeMap.has(to)) nodeMap.set(to, { id: to });
        edgeList.push({ from, to, attrs: { ...defaultEdgeAttrs, ...attrs } });
      }
      continue;
    }
    const nodeDefaultMatch = stmt.match(/^node\s*\[(.*)\]$/i);
    if (nodeDefaultMatch) {
      Object.assign(defaultNodeAttrs, parseAttributes(nodeDefaultMatch[1]));
      continue;
    }
    const edgeDefaultMatch = stmt.match(/^edge\s*\[(.*)\]$/i);
    if (edgeDefaultMatch) {
      Object.assign(defaultEdgeAttrs, parseAttributes(edgeDefaultMatch[1]));
      continue;
    }
    const graphAttrPairs = parseAttributes(stmt);
    if (Object.keys(graphAttrPairs).length > 0 && !stmt.includes("[") && !stmt.includes("]")) {
      Object.assign(graphAttrs, graphAttrPairs);
      continue;
    }
    const nodeMatch = stmt.match(/^(.+?)\s*\[(.*)\]$/);
    if (nodeMatch) {
      const id = cleanId(nodeMatch[1].trim());
      const attrs = { ...defaultNodeAttrs, ...parseAttributes(nodeMatch[2]) };
      const prev = nodeMap.get(id) || { id };
      nodeMap.set(id, { ...prev, attrs: { ...(prev.attrs || {}), ...attrs } });
      continue;
    }
    const loneId = cleanId(stmt);
    if (loneId && !nodeMap.has(loneId)) {
      nodeMap.set(loneId, { id: loneId, attrs: { ...defaultNodeAttrs } });
    }
  }
  return { graphAttrs, nodes: Array.from(nodeMap.values()), edges: edgeList };
}

function dotShapeToVis(dotShape) {
  const shape = (dotShape || "ellipse").toLowerCase();
  if (["box", "ellipse", "circle", "diamond", "hexagon", "triangle"].includes(shape)) {
    return shape;
  }
  return "ellipse";
}

function toVisData(parsed) {
  const visNodes = parsed.nodes.map((n) => {
    const attrs = n.attrs || {};
    const fill = (attrs.style || "").toLowerCase().includes("filled");
    const borderColor = attrs.color || "#7f8c8d";
    const fillColor = attrs.fillcolor || borderColor || "#ffffff";
    const dotLabel = attrs.label || n.id;
    const shape = dotShapeToVis(attrs.shape);
    const isHex = shape === "hexagon";
    return {
      id: n.id,
      label: dotLabel,
      dotLabel,
      isHex,
      shape,
      originalShape: shape,
      originalSize: isHex ? 24 : undefined,
      originalWidthConstraint: isHex ? { minimum: 34 } : undefined,
      originalHeightConstraint: isHex ? { minimum: 30 } : undefined,
      color: fill
        ? { background: fillColor, border: borderColor, highlight: { background: fillColor, border: "#111" } }
        : { border: borderColor, background: "#ffffff", highlight: { border: "#111", background: "#ffffff" } },
      font: { face: "Avenir Next, PingFang SC, Noto Sans SC, sans-serif", size: isHex ? 12 : 14, color: "#111111" },
      borderWidth: 1.5,
      ...(isHex ? { size: 24, widthConstraint: { minimum: 34 }, heightConstraint: { minimum: 30 }, shapeProperties: { borderDashes: false } } : {}),
    };
  });
  const visEdges = parsed.edges.map((e, i) => {
    const color = e.attrs.color || "#888";
    return {
      id: `e_${i}`,
      from: e.from,
      to: e.to,
      arrows: "to",
      color: { color, highlight: color, hover: color },
      width: Number(e.attrs.penwidth || 1.2),
      smooth: { type: "dynamic" },
    };
  });
  return { visNodes, visEdges };
}

function rankdirToDirection(rankdir) {
  const value = (rankdir || "TB").toUpperCase();
  if (value === "BT" || value === "DU") return "DU";
  if (value === "LR") return "LR";
  if (value === "RL") return "RL";
  return "UD";
}

function isHierarchicalLayoutMode(layoutMode) {
  return ["fromDot", "hierarchicalTB", "hierarchicalLR"].includes(layoutMode);
}

function buildLayoutOptions(layoutMode) {
  if (layoutMode === "ruleBased") return { layout: { improvedLayout: false }, physics: false };
  if (layoutMode === "force") return { layout: { improvedLayout: true }, physics: { enabled: true, stabilization: true } };
  if (layoutMode === "circle") return { layout: { improvedLayout: false }, physics: false };
  let direction = "UD";
  if (layoutMode === "fromDot") direction = rankdirToDirection(parsedGraph?.graphAttrs?.rankdir);
  else if (layoutMode === "hierarchicalLR") direction = "LR";
  return { layout: { hierarchical: { enabled: true, direction, sortMethod: "directed", levelSeparation: 120, nodeSpacing: 90, treeSpacing: 120 } }, physics: false };
}

function buildNetworkOptions(layoutMode) {
  return {
    autoResize: true,
    edges: { arrows: { to: { enabled: true } } },
    nodes: { margin: 8 },
    interaction: { dragNodes: true, dragView: true, zoomView: true, multiselect: false, selectConnectedEdges: false, hoverConnectedEdges: false },
    manipulation: false,
    ...buildLayoutOptions(layoutMode),
  };
}

function buildFreeDragOptions() {
  return {
    autoResize: true,
    edges: { arrows: { to: { enabled: true } } },
    nodes: { margin: 8 },
    interaction: { dragNodes: true, dragView: true, zoomView: true, multiselect: false, selectConnectedEdges: false, hoverConnectedEdges: false },
    manipulation: false,
    layout: { improvedLayout: false },
    physics: false,
  };
}

function applyCirclePositions(net, nodeDataSet) {
  const all = nodeDataSet.get();
  const n = all.length;
  if (!n) return;
  const radius = 260 + n * 3;
  const updates = all.map((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    return { id: node.id, x: Math.round(radius * Math.cos(angle)), y: Math.round(radius * Math.sin(angle)), fixed: false };
  });
  nodeDataSet.update(updates);
  net.fit({ animation: true });
}

function computeRuleBasedPositionUpdates(nodeDataSet, edgeDataSet) {
  const nodeIds = nodeDataSet.getIds();
  const edgeList = edgeDataSet.get();
  const incoming = new Map();
  const outgoing = new Map();
  const indegree = new Map();
  const level = new Map();

  for (const id of nodeIds) {
    incoming.set(id, []);
    outgoing.set(id, []);
    indegree.set(id, 0);
    level.set(id, 0);
  }
  for (const edge of edgeList) {
    if (!incoming.has(edge.to) || !outgoing.has(edge.from)) continue;
    incoming.get(edge.to).push(edge.from);
    outgoing.get(edge.from).push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
  }
  const queue = nodeIds.filter((id) => (indegree.get(id) || 0) === 0).sort((a, b) => String(a).localeCompare(String(b)));
  const processed = new Set();
  while (queue.length) {
    const u = queue.shift();
    if (processed.has(u)) continue;
    processed.add(u);
    const base = level.get(u) || 0;
    for (const v of outgoing.get(u) || []) {
      const candidate = base + 1;
      if (candidate > (level.get(v) || 0)) level.set(v, candidate);
      indegree.set(v, (indegree.get(v) || 0) - 1);
      if ((indegree.get(v) || 0) === 0) queue.push(v);
    }
  }
  if (processed.size < nodeIds.length) {
    for (let i = 0; i < nodeIds.length; i++) {
      let changed = false;
      for (const edge of edgeList) {
        if (!level.has(edge.from) || !level.has(edge.to)) continue;
        const candidate = (level.get(edge.from) || 0) + 1;
        if (candidate > (level.get(edge.to) || 0)) {
          level.set(edge.to, candidate);
          changed = true;
        }
      }
      if (!changed) break;
    }
  }
  const levelBuckets = new Map();
  let maxLevel = 0;
  for (const id of nodeIds) {
    const lv = Math.max(0, Number(level.get(id) || 0));
    if (!levelBuckets.has(lv)) levelBuckets.set(lv, []);
    levelBuckets.get(lv).push(id);
    if (lv > maxLevel) maxLevel = lv;
  }
  const xById = new Map();
  const yById = new Map();
  const xGap = 140;
  const yGap = 130;
  for (let lv = 0; lv <= maxLevel; lv++) {
    const bucket = levelBuckets.get(lv) || [];
    const scored = bucket.map((id) => {
      const preds = (incoming.get(id) || []).filter((p) => xById.has(p));
      if (!preds.length) return { id, score: Number.POSITIVE_INFINITY };
      const avg = preds.reduce((sum, p) => sum + xById.get(p), 0) / preds.length;
      return { id, score: avg };
    });
    scored.sort((a, b) => a.score === b.score ? String(a.id).localeCompare(String(b.id)) : a.score - b.score);
    const n = scored.length;
    for (let i = 0; i < n; i++) {
      xById.set(scored[i].id, (i - (n - 1) / 2) * xGap);
      yById.set(scored[i].id, (maxLevel - lv) * yGap);
    }
  }
  return nodeIds.map((id) => ({ id, x: xById.get(id) || 0, y: yById.get(id) || 0, fixed: false }));
}

function applyRuleBasedPositions(net, nodeDataSet, edgeDataSet) {
  nodeDataSet.update(computeRuleBasedPositionUpdates(nodeDataSet, edgeDataSet));
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function updateNodeTextModeInfo() {
  if (!nodeTextModeInfo || !toggleNodeTextBtn) return;
  nodeTextModeInfo.textContent = nodeTextMode === "label" ? "当前显示：Label" : "当前显示：节点 ID";
  toggleNodeTextBtn.textContent = nodeTextMode === "label" ? "切换为显示 ID" : "切换为显示 Label";
}

function applyNodeTextMode(nodeDataSet) {
  const updates = nodeDataSet.get().map((node) => ({
    id: node.id,
    label: nodeTextMode === "id" ? String(node.id) : String(node.dotLabel ?? node.id),
  }));
  nodeDataSet.update(updates);
  updateNodeTextModeInfo();
}

function cacheOriginalStyles(nodeDataSet, edgeDataSet) {
  originalNodeStyle = new Map();
  for (const n of nodeDataSet.get()) {
    originalNodeStyle.set(n.id, { color: cloneValue(n.color), borderWidth: n.borderWidth, font: cloneValue(n.font) });
  }
  originalEdgeStyle = new Map();
  for (const e of edgeDataSet.get()) {
    originalEdgeStyle.set(e.id, { color: cloneValue(e.color), width: e.width });
  }
}

function getChildNodes(nodeId, edgeDataSet) {
  const children = [];
  for (const edge of edgeDataSet.get()) {
    if (String(edge.from) === String(nodeId)) children.push(edge.to);
  }
  return children;
}

function getAllDescendants(nodeId, edgeDataSet) {
  const descendants = new Set();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    const children = getChildNodes(current, edgeDataSet);
    for (const child of children) {
      if (!descendants.has(child)) {
        descendants.add(child);
        queue.push(child);
      }
    }
  }
  return descendants;
}

function getCollapsedKey(nodeId, edgeDataSet) {
  return "node_" + nodeId + "_edges_" + edgeDataSet.get().length;
}

function expandNodeInGraph(nodeId, nodeDataSet, edgeDataSet) {
  const key = getCollapsedKey(nodeId, edgeDataSet);
  if (collapsedSubgraphs.has(key)) {
    const stored = collapsedSubgraphs.get(key);
    if (stored && stored.hiddenNodes) {
      for (const id of stored.hiddenNodes) {
        nodeDataSet.update({ id, hidden: false });
      }
    }
    if (stored && stored.hiddenEdges) {
      for (const edgeId of stored.hiddenEdges) {
        edgeDataSet.update({ id: edgeId, hidden: false });
      }
    }
    collapsedSubgraphs.delete(key);
  }
}

function collapseNodeInGraph(nodeId, nodeDataSet, edgeDataSet) {
  const descendants = getAllDescendants(nodeId, edgeDataSet);
  if (descendants.size === 0) return false;
  
  const hiddenNodes = new Set();
  const hiddenEdges = new Set();
  
  for (const id of descendants) {
    hiddenNodes.add(String(id));
    nodeDataSet.update({ id, hidden: true });
  }
  
  for (const edge of edgeDataSet.get()) {
    if (descendants.has(String(edge.to))) {
      hiddenEdges.add(edge.id);
      edgeDataSet.update({ id: edge.id, hidden: true });
    }
  }
  
  collapsedSubgraphs.set(getCollapsedKey(nodeId, edgeDataSet), { hiddenNodes, hiddenEdges });
  return true;
}

function isNodeCollapsed(nodeId, edgeDataSet) {
  return collapsedSubgraphs.has(getCollapsedKey(nodeId, edgeDataSet));
}

function highlightNode(nodeId, nodeDataSet, edgeDataSet) {
  if (highlightedNodeId) {
    const prevStyle = originalNodeStyle.get(highlightedNodeId);
    if (prevStyle) {
      nodeDataSet.update({
        id: highlightedNodeId,
        color: cloneValue(prevStyle.color),
        borderWidth: prevStyle.borderWidth
      });
    }
  }
  
  const style = originalNodeStyle.get(nodeId);
  if (style) {
    nodeDataSet.update({
      id: nodeId,
      color: { background: HIGHLIGHT_RED, border: HIGHLIGHT_RED, highlight: { background: HIGHLIGHT_RED, border: HIGHLIGHT_RED } },
      borderWidth: 3
    });
  }
  
  highlightedNodeId = nodeId;
}

function clearHighlight(nodeDataSet, edgeDataSet) {
  if (highlightedNodeId) {
    const prevStyle = originalNodeStyle.get(highlightedNodeId);
    if (prevStyle) {
      nodeDataSet.update({
        id: highlightedNodeId,
        color: cloneValue(prevStyle.color),
        borderWidth: prevStyle.borderWidth
      });
    }
  }
  highlightedNodeId = null;
}

function bindNetworkEvents(net, nodeDataSet, edgeDataSet) {
  net.on("click", ({ nodes: clickedNodes, edges: clickedEdges }) => {
    if (clickedNodes && clickedNodes.length > 0) {
      net.setSelection({ nodes: [clickedNodes[0]], edges: [] }, { unselectAll: true });
      const nodeId = clickedNodes[0];
      if (isNodeCollapsed(nodeId, edgeDataSet)) {
        expandNodeInGraph(nodeId, nodeDataSet, edgeDataSet);
        setStatus(`已展开节点: ${nodeId}`);
      } else {
        const hasDescendants = getAllDescendants(nodeId, edgeDataSet).size > 0;
        if (hasDescendants) {
          collapseNodeInGraph(nodeId, nodeDataSet, edgeDataSet);
          setStatus(`已收缩节点: ${nodeId}`);
        }
      }
      highlightNode(nodeId, nodeDataSet, edgeDataSet);
    } else {
      net.unselectAll();
      clearHighlight(nodeDataSet, edgeDataSet);
    }
  });

  net.on("select", ({ nodes: selectedNodes }) => {
    if (selectedNodes && selectedNodes.length > 0) {
      highlightNode(selectedNodes[0], nodeDataSet, edgeDataSet);
      const nodeId = selectedNodes[0];
      selectedSubgraphNode = nodeId;
      currentSubgraphLevel = (net === network ? 0 : ((net.subgraphIndex !== undefined) ? net.subgraphIndex : 0));
      updateExtractButton();
    }
  });
}

function createOrResetNetwork(layoutMode) {
  const container = document.getElementById("network");
  if (network) network.destroy();
  if (layoutMode === "ruleBased") {
    applyRuleBasedPositions(network, nodes, edges);
    network = new vis.Network(container, { nodes, edges }, buildFreeDragOptions());
    bindNetworkEvents(network, nodes, edges);
    network.fit({ animation: true });
    return;
  }
  if (isHierarchicalLayoutMode(layoutMode)) {
    network = new vis.Network(container, { nodes, edges }, buildNetworkOptions(layoutMode));
    network.once("afterDrawing", () => {
      const ids = nodes.getIds();
      const positions = network.getPositions(ids);
      const updates = ids.map((id) => ({ id, x: positions[id]?.x, y: positions[id]?.y, fixed: false }));
      nodes.update(updates);
      network.destroy();
      network = new vis.Network(container, { nodes, edges }, buildFreeDragOptions());
      bindNetworkEvents(network, nodes, edges);
      network.fit({ animation: true });
    });
    return;
  }
  network = new vis.Network(container, { nodes, edges }, buildNetworkOptions(layoutMode));
  bindNetworkEvents(network, nodes, edges);
  network.once("afterDrawing", () => {
    if (layoutMode === "circle") applyCirclePositions(network, nodes);
    else network.fit({ animation: true });
  });
}

function renderGraph() {
  try {
    collapsedNodes = new Set();
    collapsedSubgraphs = new Map();
    highlightedNodeId = null;
    parsedGraph = parseDot(currentDotText);
    const { visNodes, visEdges } = toVisData(parsedGraph);
    nodes = new vis.DataSet(visNodes);
    edges = new vis.DataSet(visEdges);
    applyNodeTextMode(nodes);
    cacheOriginalStyles(nodes, edges);
    createOrResetNetwork(layoutSelect.value);
    subGraphs = [];
    currentSubgraphLevel = 0;
    displaySubgraphIndex = -1;
    setStatus(`渲染成功：${visNodes.length} 个节点，${visEdges.length} 条边。`);
    updateSwapButton();
  } catch (err) {
    setStatus(`渲染失败：${err.message}`, true);
    console.error(err);
  }
}

function applyLayout() {
  if (!network) return;
  createOrResetNetwork(layoutSelect.value);
  setStatus(`已应用布局：${layoutSelect.options[layoutSelect.selectedIndex].text}`);
}

function getUpstreamNodes(centerId, maxLevels, edgeDataSet) {
  const result = new Set([centerId]);
  const queue = [{ id: centerId, level: 0 }];
  const visited = new Map([[centerId, 0]]);
  while (queue.length > 0) {
    const { id, level } = queue.shift();
    if (level >= maxLevels) continue;
    const nextLevel = level + 1;
    for (const edge of edgeDataSet.get()) {
      if (String(edge.to) === String(id) && !visited.has(String(edge.from))) {
        const fromId = String(edge.from);
        visited.set(fromId, nextLevel);
        result.add(fromId);
        queue.push({ id: fromId, level: nextLevel });
      }
    }
  }
  return result;
}

function getDownstreamNodes(centerId, maxLevels, edgeDataSet) {
  const result = new Set([centerId]);
  const queue = [{ id: centerId, level: 0 }];
  const visited = new Map([[centerId, 0]]);
  while (queue.length > 0) {
    const { id, level } = queue.shift();
    if (level >= maxLevels) continue;
    const nextLevel = level + 1;
    for (const edge of edgeDataSet.get()) {
      if (String(edge.from) === String(id) && !visited.has(String(edge.to))) {
        const toId = String(edge.to);
        visited.set(toId, nextLevel);
        result.add(toId);
        queue.push({ id: toId, level: nextLevel });
      }
    }
  }
  return result;
}

function updateExtractButton() {
  if (!extractBtn || !selectedSubgraphNode) {
    if (extractBtn) {
      extractBtn.disabled = true;
      extractBtn.style.opacity = "0.5";
    }
    if (subgraphInfo) subgraphInfo.textContent = "点击节点后提取";
    return;
  }
  
  let edgeDataSet = edges;
  let nodeText = "主图";
  
  if (nodes.get(selectedSubgraphNode)) {
    edgeDataSet = edges;
    nodeText = "主图";
  } else {
    for (let i = 0; i < subGraphs.length; i++) {
      if (subGraphs[i] && subGraphs[i].nodes && subGraphs[i].nodes.get(selectedSubgraphNode)) {
        edgeDataSet = subGraphs[i].edges;
        nodeText = "子图" + (i + 1);
        break;
      }
    }
  }
  
  const maxUp = getMaxUpstreamLevel(selectedSubgraphNode, edgeDataSet);
  const maxDown = getMaxDownstreamLevel(selectedSubgraphNode, edgeDataSet);
  subUpInput.value = maxUp;
  subDownInput.value = maxDown;
  if (subgraphInfo) subgraphInfo.textContent = `已选：${selectedSubgraphNode}（上游${maxUp}层，下游${maxDown}层）${nodeText !== "主图" ? "-"+nodeText : ""}`;
  extractBtn.disabled = false;
  extractBtn.style.opacity = "1";
}

function extractSubgraph(centerId, level) {
  const currentEdge = level === 0 ? edges : subGraphs[level - 1].edges;
  const currentNodes = level === 0 ? nodes : subGraphs[level - 1].nodes;
  const upLevel = parseInt(subUpInput.value) || 0;
  const downLevel = parseInt(subDownInput.value) || 0;
  const upNodes = getUpstreamNodes(centerId, upLevel, currentEdge);
  const downNodes = getDownstreamNodes(centerId, downLevel, currentEdge);
  const selectedNodes = new Set([...upNodes, ...downNodes]);
  const subgraphNodes = [];
  for (const id of selectedNodes) {
    const node = currentNodes.get(id);
    if (node) subgraphNodes.push({ ...node });
  }
  const subgraphEdges = [];
  for (const edge of currentEdge.get()) {
    if (selectedNodes.has(String(edge.from)) && selectedNodes.has(String(edge.to))) {
      subgraphEdges.push({ ...edge });
    }
  }
  const nodeCount = subgraphNodes.length;
  const edgeCount = subgraphEdges.length;
  if (subgraphInfo) subgraphInfo.textContent = `子图：${nodeCount}节点，${edgeCount}边`;

  const subContainer = document.getElementById("subgraphNetwork");
  const subNodesData = new vis.DataSet(subgraphNodes);
  const subEdgesData = new vis.DataSet(subgraphEdges);

  if (subGraphs[level]) {
    subGraphs[level].network.destroy();
  }
  subGraphs[level] = { nodes: subNodesData, edges: subEdgesData, network: null };
  const subNetwork = new vis.Network(subContainer, { nodes: subNodesData, edges: subEdgesData }, buildFreeDragOptions());
  subNetwork.subgraphIndex = level;
  subGraphs[level].network = subNetwork;
  subGraphs[level].centerId = centerId;
  subGraphs[level].level = level;

  bindNetworkEvents(subNetwork, subNodesData, subEdgesData);

  currentSubgraphLevel = level;

  setStatus(`已提取子图 ${level + 1}：${centerId}相关${nodeCount}节点`);
  updateSwapButton();
}

function showCustomContextMenu(x, y, forceNodeId, level = 0) {
  let nodeId = forceNodeId;
  
  if (!nodeId) {
    const net = level === 0 ? network : subGraphs[level - 1]?.network;
    if (net) {
      const sel = net.getSelection();
      if (sel.nodes && sel.nodes.length > 0) {
        nodeId = sel.nodes[0];
      }
    }
  }
  
  if (!nodeId) return;
  
  if (x === 0 && y === 0) {
    const net = level === 0 ? network : subGraphs[level - 1]?.network;
    if (net) {
      const pos = net.getPositions([nodeId]);
      if (pos[nodeId]) {
        const canvas = net.canvas.frame.canvas;
        const bounds = net.getBoundingBox();
        x = canvas.width / 2 + pos[nodeId].x - bounds.left;
        y = canvas.height / 2 + pos[nodeId].y - bounds.top;
      }
    }
  }
  
  selectedSubgraphNode = nodeId;
  updateExtractButton();
  
  const currentEdge = level === 0 ? edges : subGraphs[level - 1].edges;
  const currentNodes = level === 0 ? nodes : subGraphs[level - 1].nodes;
  
  const maxUp = getMaxUpstreamLevel(nodeId, currentEdge);
  const maxDown = getMaxDownstreamLevel(nodeId, currentEdge);
  subUpInput.value = maxUp;
  subDownInput.value = maxDown;
  
  if (subgraphInfo) subgraphInfo.textContent = `选择：${nodeId}（上游${maxUp}层，下游${maxDown}层）- 子图${level + 1}`;
  
  const menu = document.createElement("div");
  menu.id = "contextMenu";
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:#fff;border:1px solid #ccc;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:10000;min-width:120px;padding:4px 0;`;
  
  const item = document.createElement("div");
  item.textContent = `提取子图 ${level + 1}`;
  item.style.cssText = "padding:8px 16px;cursor:pointer;font-size:13px;color:#333;";
  item.onmouseenter = () => item.style.background = "#f0f0f0";
  item.onmouseleave = () => item.style.background = "transparent";
  item.onclick = () => {
    const m = document.getElementById("contextMenu");
    if (m) m.remove();
    extractSubgraph(nodeId, level);
  };
  menu.appendChild(item);
  
  document.body.appendChild(menu);
  
  const closeMenu = (e) => {
    const m = document.getElementById("contextMenu");
    if (m && !m.contains(e.target)) {
      m.remove();
      document.removeEventListener("click", closeMenu);
    }
  };
  setTimeout(() => document.addEventListener("click", closeMenu), 100);
}

function getMaxUpstreamLevel(centerId, edgeDataSet) {
  const visited = new Map([[centerId, 0]]);
  let maxLevel = 0;
  const queue = [{ id: centerId, level: 0 }];
  while (queue.length > 0) {
    const { id, level } = queue.shift();
    for (const edge of edgeDataSet.get()) {
      if (String(edge.to) === String(id) && !visited.has(String(edge.from))) {
        const fromId = String(edge.from);
        visited.set(fromId, level + 1);
        maxLevel = Math.max(maxLevel, level + 1);
        queue.push({ id: fromId, level: level + 1 });
      }
    }
  }
  return maxLevel;
}

function getMaxDownstreamLevel(centerId, edgeDataSet) {
  const visited = new Map([[centerId, 0]]);
  let maxLevel = 0;
  const queue = [{ id: centerId, level: 0 }];
  while (queue.length > 0) {
    const { id, level } = queue.shift();
    for (const edge of edgeDataSet.get()) {
      if (String(edge.from) === String(id) && !visited.has(String(edge.to))) {
        const toId = String(edge.to);
        visited.set(toId, level + 1);
        maxLevel = Math.max(maxLevel, level + 1);
        queue.push({ id: toId, level: level + 1 });
      }
    }
  }
  return maxLevel;
}

function updateSwapButton() {
  const availableSubgraphs = subGraphs.filter(sg => sg && sg.nodes && sg.nodes.length > 0).length;
  if (availableSubgraphs > 0) {
    swapBtn.disabled = false;
    swapBtn.style.opacity = "1";
    
    let currentLabel, targetLabel;
    if (swapped) {
      currentLabel = "子图1";
      targetLabel = "主图";
    } else {
      currentLabel = "主图";
      targetLabel = "子图1";
    }
    swapBtn.textContent = `切换 ${currentLabel}/${targetLabel}`;
    
    if (subGraphTitle) {
      if (swapped) {
        subGraphTitle.textContent = "主图预览";
      } else {
        subGraphTitle.textContent = "子图 1 预览";
      }
    }
  } else {
    swapBtn.disabled = true;
    swapBtn.style.opacity = "0.5";
    swapBtn.textContent = "切换主图/子图";
    if (subGraphTitle) subGraphTitle.textContent = "子图预览";
  }
}

function swapNetworks() {
  if (!subGraphs[0] || !subGraphs[0].network) {
    setStatus("请先提取子图后再切换", true);
    return;
  }
  
  swapped = !swapped;
  
  if (swapped) {
    displaySubgraphIndex = 0;
    const mainContainer = document.getElementById("network");
    const subContainer = document.getElementById("subgraphNetwork");
    
    if (network) {
      network.destroy();
      network = null;
    }
    
    if (subGraphs[0].network) {
      subGraphs[0].network.destroy();
      subGraphs[0].network = null;
    }
    
    const newMainNetwork = new vis.Network(mainContainer, { nodes: subGraphs[0].nodes, edges: subGraphs[0].edges }, buildFreeDragOptions());
    newMainNetwork.subgraphIndex = -1;
    network = newMainNetwork;
    bindNetworkEvents(network, subGraphs[0].nodes, subGraphs[0].edges);
    
    const newSubNetwork = new vis.Network(subContainer, { nodes: nodes, edges: edges }, buildFreeDragOptions());
    newSubNetwork.subgraphIndex = 0;
    subGraphs[0].network = newSubNetwork;
    bindNetworkEvents(newSubNetwork, nodes, edges);
    
  } else {
    displaySubgraphIndex = -1;
    const mainContainer = document.getElementById("network");
    const subContainer = document.getElementById("subgraphNetwork");
    
    if (network) {
      network.destroy();
      network = null;
    }
    
    const oldSubNet = subGraphs[0].network;
    if (oldSubNet) {
      oldSubNet.destroy();
      subGraphs[0].network = null;
    }
    
    const newMainNetwork = new vis.Network(mainContainer, { nodes: nodes, edges: edges }, buildFreeDragOptions());
    network = newMainNetwork;
    bindNetworkEvents(network, nodes, edges);
    
    const newSubNetwork = new vis.Network(subContainer, { nodes: subGraphs[0].nodes, edges: subGraphs[0].edges }, buildFreeDragOptions());
    newSubNetwork.subgraphIndex = 0;
    subGraphs[0].network = newSubNetwork;
    bindNetworkEvents(newSubNetwork, subGraphs[0].nodes, subGraphs[0].edges);
  }
  
  if (network) network.fit({ animation: true });
  if (subGraphs[0] && subGraphs[0].network) subGraphs[0].network.fit({ animation: true });
  
  updateSwapButton();
  setStatus(swapped ? "已切换：子图在中间" : "已切换：主图在中间");
}

function doExtractSubgraph() {
  if (selectedSubgraphNode) {
    const level = currentSubgraphLevel;
    extractSubgraph(selectedSubgraphNode, level);
  }
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    currentDotText = await file.text();
    setStatus(`已加载文件：${file.name}`);
    renderGraph();
  } catch (err) {
    setStatus(`读取文件失败：${err.message}`, true);
  }
});

renderBtn.addEventListener("click", renderGraph);
applyLayoutBtn.addEventListener("click", applyLayout);
toggleNodeTextBtn.addEventListener("click", () => {
  nodeTextMode = nodeTextMode === "label" ? "id" : "label";
  applyNodeTextMode(nodes);
});

if (extractBtn) {
  extractBtn.addEventListener("click", doExtractSubgraph);
  updateExtractButton();
}
if (swapBtn) swapBtn.addEventListener("click", swapNetworks);

updateNodeTextModeInfo();
renderGraph();