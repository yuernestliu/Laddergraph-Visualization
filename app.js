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
  0 [label=DBCDBC color=grey style=filled]
  0 -> -1 [color=grey]
  0 -> -3 [color=grey]
  1 [label=CDEFEF color=grey style=filled]
  1 [label=CDEFEF color=grey style=filled]
  1 -> -1 [color=grey]
  1 -> -5 [color=grey]
  2 [label=DBC color=grey style=filled]
  2 -> 0 [color=grey]
  2 -> 0 [color=grey]
  3 [label=ABC color=grey style=filled]
  3 [label=ABC color=grey style=filled]
  3 -> -1 [color=grey]
  3 -> -5 [color=grey]
  4 [label=BC color=grey style=filled]
  4 [label=BC color=grey style=filled]
  4 [label=BC color=grey style=filled]
  4 -> 3 [color=grey]
  4 -> -4 [color=grey]
  4 -> 2 [color=grey]
  5 [label=EF color=grey style=filled]
  5 [label=EF color=grey style=filled]
  5 -> -4 [color=grey]
  5 -> 1 [color=grey]
  5 -> 1 [color=grey]
  6 [label=CD color=grey style=filled]
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
const saveImageBtn = document.getElementById("saveImageBtn");
const toggle3DBtn = document.getElementById("toggle3DBtn");
const mode3DInfo = document.getElementById("3dModeInfo");
const nodeTextModeInfo = document.getElementById("nodeTextModeInfo");

const HIGHLIGHT_RED = "#e60023";
const INCOMING_GREEN = "#2f9e44";
const CENTER_NODE_COLOR = "#5a0010";

let network;
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);
let parsedGraph = null;
let currentDotText = sampleDot;
let nodeTextMode = "label";
let is3DMode = false;
let originalNodeStyle = new Map();
let originalEdgeStyle = new Map();
let highlightedNodeIds = new Set();
let highlightedEdgeIds = new Set();
let highlightedEdgeColor = new Map();
let collapsedNodes = new Set();

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#c92a2a" : "#6b7280";
}

function cleanId(raw) {
  const value = String(raw).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
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
  const withoutComments = dotText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  const start = withoutComments.indexOf("{");
  const end = withoutComments.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("DOT 内容缺少有效的大括号结构。\n请确保格式类似：digraph { ... }");
  }

  const body = withoutComments.slice(start + 1, end);
  const statements = splitStatements(body);

  const graphAttrs = {};
  const defaultNodeAttrs = {};
  const defaultEdgeAttrs = {};
  const nodeMap = new Map();
  const edgeList = [];

  for (const stmt of statements) {
    if (stmt === "{" || stmt === "}") {
      continue;
    }

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

  return {
    graphAttrs,
    nodes: Array.from(nodeMap.values()),
    edges: edgeList,
  };
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
        ? {
            background: fillColor,
            border: borderColor,
            highlight: { background: fillColor, border: "#111" },
          }
        : { border: borderColor, background: "#ffffff", highlight: { border: "#111", background: "#ffffff" } },
      font: {
        face: "Avenir Next, PingFang SC, Noto Sans SC, sans-serif",
        size: isHex ? 12 : 14,
        color: "#111111",
      },
      borderWidth: 1.5,
      ...(isHex
        ? {
            size: 24,
            widthConstraint: { minimum: 34 },
            heightConstraint: { minimum: 30 },
            shapeProperties: { borderDashes: false },
          }
        : {}),
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
  if (layoutMode === "ruleBased") {
    return {
      layout: { improvedLayout: false },
      physics: false,
    };
  }

  if (layoutMode === "force") {
    return {
      layout: { improvedLayout: true },
      physics: { enabled: true, stabilization: true },
    };
  }

  if (layoutMode === "circle") {
    return {
      layout: { improvedLayout: false },
      physics: false,
    };
  }

  let direction = "UD";
  if (layoutMode === "fromDot") {
    direction = rankdirToDirection(parsedGraph?.graphAttrs?.rankdir);
  } else if (layoutMode === "hierarchicalLR") {
    direction = "LR";
  }

  return {
    layout: {
      hierarchical: {
        enabled: true,
        direction,
        sortMethod: "directed",
        levelSeparation: 120,
        nodeSpacing: 90,
        treeSpacing: 120,
      },
    },
    physics: false,
  };
}

function buildNetworkOptions(layoutMode) {
  return {
    autoResize: true,
    edges: { arrows: { to: { enabled: true } } },
    nodes: { margin: 8 },
    interaction: {
      dragNodes: true,
      dragView: true,
      zoomView: true,
      multiselect: false,
      selectConnectedEdges: false,
      hoverConnectedEdges: false,
    },
    manipulation: false,
    ...buildLayoutOptions(layoutMode),
  };
}

function buildFreeDragOptions() {
  return {
    autoResize: true,
    edges: { arrows: { to: { enabled: true } } },
    nodes: { margin: 8 },
    interaction: {
      dragNodes: true,
      dragView: true,
      zoomView: true,
      multiselect: false,
      selectConnectedEdges: false,
      hoverConnectedEdges: false,
    },
    manipulation: false,
    layout: { improvedLayout: false },
    physics: false,
  };
}

function applyCirclePositions() {
  const all = nodes.get();
  const n = all.length;
  if (!n) return;

  const radius = 260 + n * 3;
  const updates = all.map((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    return {
      id: node.id,
      x: Math.round(radius * Math.cos(angle)),
      y: Math.round(radius * Math.sin(angle)),
      fixed: false,
    };
  });

  nodes.update(updates);
  network.fit({ animation: true });
}

function computeRuleBasedPositionUpdates() {
  const nodeIds = nodes.getIds();
  const edgeList = edges.get();

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

  const queue = nodeIds
    .filter((id) => (indegree.get(id) || 0) === 0)
    .sort((a, b) => String(a).localeCompare(String(b)));

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

  // Fallback for non-DAG parts: relax levels repeatedly.
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
      if (!preds.length) {
        return { id, score: Number.POSITIVE_INFINITY };
      }
      const avg = preds.reduce((sum, p) => sum + xById.get(p), 0) / preds.length;
      return { id, score: avg };
    });

    scored.sort((a, b) => {
      if (a.score === b.score) {
        return String(a.id).localeCompare(String(b.id));
      }
      return a.score - b.score;
    });

    const n = scored.length;
    for (let i = 0; i < n; i++) {
      const id = scored[i].id;
      const x = (i - (n - 1) / 2) * xGap;
      const y = (maxLevel - lv) * yGap;
      xById.set(id, x);
      yById.set(id, y);
    }
  }

  return nodeIds.map((id) => ({
    id,
    x: xById.get(id) || 0,
    y: yById.get(id) || 0,
    fixed: false,
  }));
}

function applyRuleBasedPositions() {
  nodes.update(computeRuleBasedPositionUpdates());
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function updateNodeTextModeInfo() {
  if (!nodeTextModeInfo || !toggleNodeTextBtn) return;
  if (nodeTextMode === "label") {
    nodeTextModeInfo.textContent = "当前显示：Label";
    toggleNodeTextBtn.textContent = "切换为显示 ID";
  } else {
    nodeTextModeInfo.textContent = "当前显示：节点 ID";
    toggleNodeTextBtn.textContent = "切换为显示 Label";
  }
}

function applyNodeTextMode() {
  const updates = nodes.get().map((node) => ({
    id: node.id,
    label: nodeTextMode === "id" ? String(node.id) : String(node.dotLabel ?? node.id),
  }));
  nodes.update(updates);
  updateNodeTextModeInfo();
}

function cacheOriginalStyles() {
  originalNodeStyle = new Map();
  for (const n of nodes.get()) {
    originalNodeStyle.set(n.id, {
      color: cloneValue(n.color),
      borderWidth: n.borderWidth,
      font: cloneValue(n.font),
    });
  }

  originalEdgeStyle = new Map();
  for (const e of edges.get()) {
    originalEdgeStyle.set(e.id, {
      color: cloneValue(e.color),
      width: e.width,
    });
  }

  highlightedNodeIds = new Set();
  highlightedEdgeIds = new Set();
  highlightedEdgeColor = new Map();
}

function restoreNode(id) {
  const baseline = originalNodeStyle.get(id);
  if (!baseline) return;
  const font = cloneValue(baseline.font) || {};
  if (!font.color) font.color = "#111111";
  nodes.update({
    id,
    color: cloneValue(baseline.color),
    borderWidth: baseline.borderWidth,
    font,
  });
}

function restoreEdge(id) {
  const baseline = originalEdgeStyle.get(id);
  if (!baseline) return;
  edges.update({
    id,
    color: cloneValue(baseline.color),
    width: baseline.width,
  });
}

function hexToRgb(hex) {
  const raw = String(hex || "").trim().replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw;
  const safe = full.padEnd(6, "0").slice(0, 6);
  return {
    r: Number.parseInt(safe.slice(0, 2), 16),
    g: Number.parseInt(safe.slice(2, 4), 16),
    b: Number.parseInt(safe.slice(4, 6), 16),
  };
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function readableTextColor(bgHex) {
  const L = relativeLuminance(bgHex);
  const contrastWhite = (1.0 + 0.05) / (L + 0.05);
  const contrastBlack = (L + 0.05) / (0.0 + 0.05);
  return contrastBlack >= contrastWhite ? "#111111" : "#ffffff";
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixWithWhite(baseHex, ratio) {
  const t = Math.max(0, Math.min(1, ratio));
  const c = hexToRgb(baseHex);
  return rgbToHex(c.r + (255 - c.r) * t, c.g + (255 - c.g) * t, c.b + (255 - c.b) * t);
}

function layeredGradientColor(baseHex, distance, maxDistance) {
  if (distance <= 1 || maxDistance <= 1) return baseHex;
  const t = (distance - 1) / (maxDistance - 1);
  const mixRatio = 0.18 + 0.6 * t;
  return mixWithWhite(baseHex, mixRatio);
}

function clearTransientHighlight() {
  for (const id of nodes.getIds()) restoreNode(id);
  for (const id of edges.getIds()) restoreEdge(id);
  highlightedNodeIds = new Set();
  highlightedEdgeIds = new Set();
  highlightedEdgeColor = new Map();
}

function getChildNodes(nodeId) {
  const allEdges = edges.get();
  const children = [];
  for (const edge of allEdges) {
    if (String(edge.from) === String(nodeId)) {
      children.push(edge.to);
    }
  }
  return children;
}

function getAllDescendants(nodeId) {
  const descendants = new Set();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    const children = getChildNodes(current);
    for (const child of children) {
      if (!descendants.has(child)) {
        descendants.add(child);
        queue.push(child);
      }
    }
  }
  return descendants;
}

function collapseNode(nodeId) {
  const descendants = getAllDescendants(nodeId);
  if (descendants.size === 0) return false;
  
  for (const id of descendants) {
    nodes.update({ id: id, hidden: true });
    collapsedNodes.add(String(id));
  }
  
  const childList = getChildNodes(nodeId);
  for (const child of childList) {
    edges.get().forEach(edge => {
      if (String(edge.from) === String(child) ){
        edges.update({ id: edge.id, hidden: true });
      }
      if (String(edge.to) === String(child)) {
        edges.update({ id: edge.id, hidden: true });
      }
    });
  }
  
  if (is3DMode) {
    network.setOptions({ physics: { enabled: true } });
    network.once("stabilizationIterationsDone", () => {
      network.setOptions({ physics: { enabled: false } });
    });
  }
  
  return true;
}

function expandNode(nodeId) {
  const descendants = getAllDescendants(nodeId);
  if (descendants.size === 0) return false;
  
  for (const id of descendants) {
    if (collapsedNodes.has(String(id))) {
      nodes.update({ id: id, hidden: false });
      collapsedNodes.delete(String(id));
    }
  }
  
  edges.get().forEach(edge => {
    if (!nodes.get(edge.from)?.hidden && !nodes.get(edge.to)?.hidden) {
      edges.update({ id: edge.id, hidden: false });
    }
  });
  
  if (is3DMode) {
    network.setOptions({ physics: { enabled: true } });
    network.once("stabilizationIterationsDone", () => {
      network.setOptions({ physics: { enabled: false } });
    });
  }
  
  return true;
}

function computeDirectionalReach(centerId) {
  const allEdges = edges.get();
  const outgoingByNode = new Map();
  const incomingByNode = new Map();

  for (const nodeId of nodes.getIds()) {
    outgoingByNode.set(nodeId, []);
    incomingByNode.set(nodeId, []);
  }

  for (const edge of allEdges) {
    if (!outgoingByNode.has(edge.from)) outgoingByNode.set(edge.from, []);
    if (!incomingByNode.has(edge.to)) incomingByNode.set(edge.to, []);
    outgoingByNode.get(edge.from).push(edge);
    incomingByNode.get(edge.to).push(edge);
  }

  const upNodeDist = new Map([[centerId, 0]]);
  const upEdgeDist = new Map();
  const upQueue = [centerId];
  while (upQueue.length) {
    const u = upQueue.shift();
    const du = upNodeDist.get(u) || 0;
    for (const edge of outgoingByNode.get(u) || []) {
      const step = du + 1;
      const prevEdge = upEdgeDist.get(edge.id);
      if (prevEdge == null || step < prevEdge) upEdgeDist.set(edge.id, step);
      if (!upNodeDist.has(edge.to)) {
        upNodeDist.set(edge.to, step);
        upQueue.push(edge.to);
      }
    }
  }

  const downNodeDist = new Map([[centerId, 0]]);
  const downEdgeDist = new Map();
  const downQueue = [centerId];
  while (downQueue.length) {
    const u = downQueue.shift();
    const du = downNodeDist.get(u) || 0;
    for (const edge of incomingByNode.get(u) || []) {
      const step = du + 1;
      const prevEdge = downEdgeDist.get(edge.id);
      if (prevEdge == null || step < prevEdge) downEdgeDist.set(edge.id, step);
      if (!downNodeDist.has(edge.from)) {
        downNodeDist.set(edge.from, step);
        downQueue.push(edge.from);
      }
    }
  }

  return { upNodeDist, upEdgeDist, downNodeDist, downEdgeDist };
}

function updateTransientHighlight(selectedNodeIds) {
  const centerId = (selectedNodeIds || [])[0];
  clearTransientHighlight();
  if (!centerId) return;

  const { upNodeDist, upEdgeDist, downNodeDist, downEdgeDist } = computeDirectionalReach(centerId);
  const maxUpNodeDist = Math.max(...upNodeDist.values());
  const maxDownNodeDist = Math.max(...downNodeDist.values());
  const maxUpEdgeDist = Math.max(0, ...upEdgeDist.values());
  const maxDownEdgeDist = Math.max(0, ...downEdgeDist.values());

  const nodeUpdates = [];
  const edgeUpdates = [];
  const highlightFontFor = (id, bgColor) => ({
    ...(cloneValue(originalNodeStyle.get(id)?.font) || {}),
    color: readableTextColor(bgColor),
  });

  nodeUpdates.push({
    id: centerId,
    color: {
      border: "#000000",
      background: CENTER_NODE_COLOR,
      highlight: { border: "#000000", background: CENTER_NODE_COLOR },
      hover: { border: "#000000", background: CENTER_NODE_COLOR },
    },
    borderWidth: 3.4,
    font: highlightFontFor(centerId, CENTER_NODE_COLOR),
  });
  highlightedNodeIds.add(centerId);

  for (const [id, dist] of upNodeDist.entries()) {
    if (id === centerId || dist <= 0) continue;
    const color = layeredGradientColor(HIGHLIGHT_RED, dist, maxUpNodeDist);
    nodeUpdates.push({
      id,
      color: {
        border: "#111111",
        background: color,
        highlight: { border: "#000000", background: color },
        hover: { border: "#000000", background: color },
      },
      borderWidth: 3,
      font: highlightFontFor(id, color),
    });
    highlightedNodeIds.add(id);
  }

  for (const [id, dist] of downNodeDist.entries()) {
    if (id === centerId || dist <= 0 || highlightedNodeIds.has(id)) continue;
    const color = layeredGradientColor(INCOMING_GREEN, dist, maxDownNodeDist);
    nodeUpdates.push({
      id,
      color: {
        border: "#111111",
        background: color,
        highlight: { border: "#000000", background: color },
        hover: { border: "#000000", background: color },
      },
      borderWidth: 3,
      font: highlightFontFor(id, color),
    });
    highlightedNodeIds.add(id);
  }

  for (const [id, dist] of upEdgeDist.entries()) {
    const color = layeredGradientColor(HIGHLIGHT_RED, dist, maxUpEdgeDist);
    edgeUpdates.push({
      id,
      color: { color, highlight: color, hover: color },
      width: 3.2,
    });
    highlightedEdgeIds.add(id);
    highlightedEdgeColor.set(id, color);
  }

  for (const [id, dist] of downEdgeDist.entries()) {
    if (highlightedEdgeIds.has(id)) continue;
    const color = layeredGradientColor(INCOMING_GREEN, dist, maxDownEdgeDist);
    edgeUpdates.push({
      id,
      color: { color, highlight: color, hover: color },
      width: 3.2,
    });
    highlightedEdgeIds.add(id);
    highlightedEdgeColor.set(id, color);
  }

  nodes.update(nodeUpdates);
  edges.update(edgeUpdates);
}

function bindNetworkEvents() {
  const syncHighlightFromSelection = () => {
    const selection = network.getSelection();
    updateTransientHighlight(selection.nodes);
  };

  network.on("click", ({ nodes: clickedNodes }) => {
    if (clickedNodes.length) {
      network.setSelection({ nodes: [clickedNodes[0]], edges: [] }, { unselectAll: true });
    } else {
      network.unselectAll();
    }
    syncHighlightFromSelection();
  });

  network.on("select", syncHighlightFromSelection);
  network.on("deselectNode", syncHighlightFromSelection);
  network.on("deselectEdge", syncHighlightFromSelection);
  
  network.on("doubleClick", ({ nodes: clickedNodes }) => {
    if (!clickedNodes || clickedNodes.length === 0) return;
    
    const nodeId = clickedNodes[0];
    const descendants = getAllDescendants(nodeId);
    const hasCollapsedChild = Array.from(descendants).some(id => collapsedNodes.has(String(id)));
    
    if (hasCollapsedChild) {
      expandNode(nodeId);
      setStatus(`已展开节点: ${nodeId}`);
    } else {
      if (descendants.size > 0) {
        collapseNode(nodeId);
        setStatus(`已收缩节点: ${nodeId} (含 ${descendants.size} 个子节点)`);
      }
    }
  });
}

function createOrResetNetwork(layoutMode) {
  const container = document.getElementById("network");
  if (network) network.destroy();

  if (layoutMode === "ruleBased") {
    applyRuleBasedPositions();
    network = new vis.Network(container, { nodes, edges }, buildFreeDragOptions());
    bindNetworkEvents();
    network.fit({ animation: true });
    return;
  }

  if (isHierarchicalLayoutMode(layoutMode)) {
    network = new vis.Network(container, { nodes, edges }, buildNetworkOptions(layoutMode));
    network.once("afterDrawing", () => {
      const ids = nodes.getIds();
      const positions = network.getPositions(ids);
      const updates = ids.map((id) => ({
        id,
        x: positions[id]?.x,
        y: positions[id]?.y,
        fixed: false,
      }));
      nodes.update(updates);

      network.destroy();
      network = new vis.Network(container, { nodes, edges }, buildFreeDragOptions());
      bindNetworkEvents();
      network.fit({ animation: true });
    });
    return;
  }

  network = new vis.Network(container, { nodes, edges }, buildNetworkOptions(layoutMode));
  bindNetworkEvents();
  network.once("afterDrawing", () => {
    if (layoutMode === "circle") {
      applyCirclePositions();
    } else {
      network.fit({ animation: true });
    }
  });
}

function renderGraph() {
  try {
    collapsedNodes = new Set();
    parsedGraph = parseDot(currentDotText);
    const { visNodes, visEdges } = toVisData(parsedGraph);

    nodes = new vis.DataSet(visNodes);
    edges = new vis.DataSet(visEdges);
    applyNodeTextMode();
    cacheOriginalStyles();
    createOrResetNetwork(layoutSelect.value);

    setStatus(`渲染成功：${visNodes.length} 个节点，${visEdges.length} 条边。`);
  } catch (err) {
    setStatus(`渲染失败：${err.message}`, true);
    console.error(err);
  }
}

function applyLayout() {
  if (!network) return;
  updateTransientHighlight([]);
  createOrResetNetwork(layoutSelect.value);
  setStatus(`已应用布局：${layoutSelect.options[layoutSelect.selectedIndex].text}`);
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
  applyNodeTextMode();
});

saveImageBtn.addEventListener("click", () => {
  if (!network) {
    setStatus("请先渲染图形后再保存", true);
    return;
  }
  
  const canvas = network.canvas.frame.canvas;
  const link = document.createElement("a");
  link.download = "ladder-graph-" + Date.now() + ".png";
  link.href = canvas.toDataURL("image/png");
  link.click();
  
  setStatus("图片已保存");
});

toggle3DBtn.addEventListener("click", () => {
  if (!network) {
    setStatus("请先渲染图形后再切换", true);
    return;
  }

  is3DMode = !is3DMode;

  if (is3DMode) {
    const allNodes = nodes.get();
    const nodeUpdates = allNodes.map(node => {
      return {
        id: node.id,
        shape: "dot",
        size: 30,
        font: {
          color: "#ffffff",
          background: "rgba(0,0,0,0.7)",
          strokeWidth: 2,
          strokeColor: "#000000",
          face: "Avenir Next, PingFang SC, Noto Sans SC, sans-serif",
          size: 14
        },
        color: {
          background: node.color?.background || "#8497b0",
          border: node.color?.border || "#5a0010",
          highlight: { background: "#e60023", border: "#5a0010" }
        },
        shadow: {
          enabled: true,
          color: "rgba(0,0,0,0.4)",
          size: 10,
          x: 4,
          y: 4
        }
      };
    });
    nodes.update(nodeUpdates);

    network.setOptions({
      physics: {
        enabled: true,
        solver: "forceAtlas2Based",
        forceAtlas2Based: {
          gravitationalConstant: -50,
          centralGravity: 0.01,
          springLength: 150,
          springConstant: 0.08,
          damping: 0.4
        },
        stabilization: { iterations: 200 }
      },
      interaction: {
        dragNodes: true,
        dragView: true,
        zoomView: true,
        hover: true
      }
    });

    network.once("stabilizationIterationsDone", () => {
      network.setOptions({ physics: { enabled: false } });
    });

  } else {
    const allNodes = nodes.get();
    const nodeUpdates = allNodes.map(node => {
      const original = originalNodeStyle.get(node.id) || {};
      return {
        id: node.id,
        shape: node.originalShape || node.shape || "ellipse",
        size: node.originalSize,
        widthConstraint: node.originalWidthConstraint,
        heightConstraint: node.originalHeightConstraint,
        font: original.font || { face: "Avenir Next, PingFang SC, Noto Sans SC, sans-serif", size: 14, color: "#111111" },
        color: original.color || node.color,
        borderWidth: original.borderWidth || 1.5,
        shadow: { enabled: false }
      };
    });
    nodes.update(nodeUpdates);

    network.setOptions({
      physics: false,
      layout: { improvedLayout: false },
      interaction: {
        dragNodes: true,
        dragView: true,
        zoomView: true,
        multiselect: false,
        selectConnectedEdges: false,
        hoverConnectedEdges: false
      }
    });

    applyRuleBasedPositions();
  }

  network.fit({ animation: true });

  if (mode3DInfo) {
    mode3DInfo.textContent = is3DMode ? "当前模式：3D 球形" : "当前模式：2D 平铺";
  }
  toggle3DBtn.textContent = is3DMode ? "切换为 2D 视图" : "转换为 3D 球形";

  setStatus(is3DMode ? "已切换为 3D 球形视图（可拖拽旋转）" : "已切换为 2D 平铺视图");
});

updateNodeTextModeInfo();
renderGraph();