const DEFAULT_DOT_PATH = "./G-default.gv";
const LARGE_GRAPH_NODE_THRESHOLD = 350;
const LARGE_GRAPH_EDGE_THRESHOLD = 700;
const HIDDEN_NODE_IDS = new Set(["-1"]);

const fileInput = document.getElementById("fileInput");
const renderBtn = document.getElementById("renderBtn");
const statusEl = document.getElementById("status");
const layoutSelect = document.getElementById("layoutSelect");
const applyLayoutBtn = document.getElementById("applyLayoutBtn");
const graphTabsEl = document.getElementById("graphTabs");
const graphTabsInfo = document.getElementById("graphTabsInfo");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const fitViewBtn = document.getElementById("fitViewBtn");
const renderModeSelect = document.getElementById("renderModeSelect");
const renderModeInfo = document.getElementById("renderModeInfo");
const toggleNodeTextBtn = document.getElementById("toggleNodeTextBtn");
const nodeTextModeInfo = document.getElementById("nodeTextModeInfo");

const HIGHLIGHT_RED = "#e60023";
const INCOMING_GREEN = "#2f9e44";
const CENTER_NODE_COLOR = "#5a0010";

let network;
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);
let sourceParsedGraph = null;
let parsedGraph = null;
let currentDotText = "";
let currentGraphStats = null;
let currentGraphTabs = [];
let activeGraphTabId = null;
let currentRenderProfile = "full";
let currentEffectiveLayoutMode = "hierarchicalTB";
let graphTabViewState = new Map();
let nodeTextMode = "label";
let originalNodeStyle = new Map();
let originalEdgeStyle = new Map();
let highlightedNodeIds = new Set();
let highlightedEdgeIds = new Set();
let highlightedEdgeColor = new Map();

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#c92a2a" : "#6b7280";
}

function clearGraph() {
  if (network) {
    network.destroy();
    network = null;
  }
  sourceParsedGraph = null;
  nodes = new vis.DataSet([]);
  edges = new vis.DataSet([]);
  parsedGraph = null;
  currentGraphStats = null;
  currentGraphTabs = [];
  activeGraphTabId = null;
  graphTabViewState = new Map();
}

function summarizeGraph(parsed) {
  return {
    nodeCount: parsed.nodes.length,
    edgeCount: parsed.edges.length,
  };
}

function isLargeGraph(stats) {
  return (
    stats.nodeCount >= LARGE_GRAPH_NODE_THRESHOLD ||
    stats.edgeCount >= LARGE_GRAPH_EDGE_THRESHOLD
  );
}

function getRequestedRenderMode() {
  return renderModeSelect?.value || "auto";
}

function getEffectiveRenderProfile(stats) {
  const requestedMode = getRequestedRenderMode();
  if (requestedMode === "full") return "full";
  if (requestedMode === "overview") return "overview";
  return isLargeGraph(stats) ? "overview" : "full";
}

function getEffectiveLayoutMode(layoutMode, renderProfile) {
  if (renderProfile === "overview" && layoutMode === "force") {
    return "ruleBased";
  }
  return layoutMode;
}

function isOverviewProfile(renderProfile = currentRenderProfile) {
  return renderProfile === "overview";
}

function normalizeDisplayLabel(rawLabel) {
  return String(rawLabel ?? "").replace(/\\n/g, "\n");
}

function splitDisplayLabel(rawLabel) {
  const normalized = normalizeDisplayLabel(rawLabel);
  const parts = normalized
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return { top: "", inner: "" };
  }

  if (parts.length === 1) {
    return { top: "", inner: parts[0] };
  }

  return {
    top: parts[0],
    inner: parts.slice(1).join(" "),
  };
}

function buildNodeTitle(nodeId, dotLabel) {
  const safeLabel = normalizeDisplayLabel(dotLabel ?? nodeId).replace(/\n/g, "<br />");
  return `${safeLabel}<br />ID: ${String(nodeId)}`;
}

function normalizeColor(rawColor) {
  return String(rawColor || "").trim().replace(/^"(.*)"$/, "$1").toLowerCase();
}

function isTransparentColor(rawColor) {
  const value = normalizeColor(rawColor);
  return value === "#ffffffff" || value === "#ffffff00" || value === "transparent";
}

function isWhiteColor(rawColor) {
  const value = normalizeColor(rawColor);
  return value === "white" || value === "#fff" || value === "#ffffff" || value === "#ffffffff";
}

function isWhiteNodeAttrs(attrs) {
  return isWhiteColor(attrs.fillcolor) || isWhiteColor(attrs.color);
}

function isHiddenNode(node) {
  return HIDDEN_NODE_IDS.has(String(node.id));
}

function sanitizeParsedGraph(parsed) {
  const visibleNodes = parsed.nodes.filter((node) => !isHiddenNode(node));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = parsed.edges.filter((edge) => {
    if (!visibleNodeIds.has(edge.from) || !visibleNodeIds.has(edge.to)) return false;
    if (isTransparentColor(edge.attrs?.color)) return false;
    return true;
  });

  return {
    graphAttrs: parsed.graphAttrs,
    nodes: visibleNodes,
    edges: visibleEdges,
  };
}

function createTabDescriptor(parsed, id, label, kind, nodeIds) {
  const uniqueNodeIds = Array.from(new Set(nodeIds));
  const nodeSet = new Set(uniqueNodeIds);
  let edgeCount = 0;

  for (const edge of parsed.edges) {
    if (nodeSet.has(edge.from) && nodeSet.has(edge.to)) {
      edgeCount += 1;
    }
  }

  return {
    id,
    label,
    kind,
    nodeIds: uniqueNodeIds,
    nodeSet,
    stats: {
      nodeCount: uniqueNodeIds.length,
      edgeCount,
    },
  };
}

function buildGraphTabs(parsed) {
  const adjacency = new Map(parsed.nodes.map((node) => [node.id, new Set()]));

  for (const edge of parsed.edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue;
    adjacency.get(edge.from).add(edge.to);
    adjacency.get(edge.to).add(edge.from);
  }

  const isolatedIds = [];
  const visited = new Set();

  for (const node of parsed.nodes) {
    const neighbors = adjacency.get(node.id);
    if (!neighbors || neighbors.size === 0) {
      isolatedIds.push(node.id);
      visited.add(node.id);
    }
  }

  const components = [];
  for (const node of parsed.nodes) {
    const startId = node.id;
    if (visited.has(startId)) continue;

    const queue = [startId];
    const componentNodeIds = [];
    visited.add(startId);

    while (queue.length) {
      const nodeId = queue.shift();
      componentNodeIds.push(nodeId);

      for (const neighborId of adjacency.get(nodeId) || []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    components.push(componentNodeIds);
  }

  components.sort((a, b) => b.length - a.length);

  if (components.length === 1 && isolatedIds.length === 0) {
    return [
      createTabDescriptor(
        parsed,
        "all",
        "全图",
        "component",
        parsed.nodes.map((node) => node.id),
      ),
    ];
  }

  const tabs = components.map((nodeIds, index) =>
    createTabDescriptor(
      parsed,
      `component-${index + 1}`,
      components.length === 1 ? "主图" : `连通图 ${index + 1} (${nodeIds.length})`,
      "component",
      nodeIds,
    ),
  );

  if (isolatedIds.length) {
    tabs.push(
      createTabDescriptor(
        parsed,
        "isolated",
        `孤立点 (${isolatedIds.length})`,
        "isolated",
        isolatedIds,
      ),
    );
  }

  return tabs;
}

function getActiveGraphTab() {
  return currentGraphTabs.find((tab) => tab.id === activeGraphTabId) || null;
}

function ensureActiveGraphTab() {
  if (currentGraphTabs.some((tab) => tab.id === activeGraphTabId)) {
    return;
  }
  activeGraphTabId = currentGraphTabs[0]?.id || null;
}

function getSubgraphForTab(parsed, tab) {
  if (!tab) return parsed;
  return {
    graphAttrs: parsed.graphAttrs,
    nodes: parsed.nodes.filter((node) => tab.nodeSet.has(node.id)),
    edges: parsed.edges.filter((edge) => tab.nodeSet.has(edge.from) && tab.nodeSet.has(edge.to)),
  };
}

function captureCurrentTabViewState() {
  const activeTab = getActiveGraphTab();
  if (!network || !activeTab) return;

  graphTabViewState.set(activeTab.id, {
    layoutMode: currentEffectiveLayoutMode,
    positions: network.getPositions(nodes.getIds()),
    selectedNodeIds: network.getSelectedNodes(),
    viewPosition: network.getViewPosition(),
    scale: network.getScale(),
  });
}

function restoreActiveTabViewState() {
  const activeTab = getActiveGraphTab();
  if (!network || !activeTab) return false;

  const savedState = graphTabViewState.get(activeTab.id);
  if (!savedState || savedState.layoutMode !== currentEffectiveLayoutMode) {
    return false;
  }

  const positionUpdates = Object.entries(savedState.positions || {}).map(([id, pos]) => ({
    id,
    x: pos.x,
    y: pos.y,
    fixed: false,
  }));
  if (positionUpdates.length) {
    nodes.update(positionUpdates);
  }

  if (savedState.viewPosition && typeof savedState.scale === "number") {
    network.moveTo({
      position: savedState.viewPosition,
      scale: savedState.scale,
      animation: false,
    });
  }

  const selectedNodeIds = (savedState.selectedNodeIds || []).filter((id) => nodes.get(id));
  if (selectedNodeIds.length) {
    network.setSelection({ nodes: selectedNodeIds, edges: [] }, { unselectAll: true });
  } else {
    network.unselectAll();
  }
  updateTransientHighlight(selectedNodeIds);

  return true;
}

function renderGraphTabs() {
  if (!graphTabsEl || !graphTabsInfo) return;

  graphTabsEl.innerHTML = "";

  if (!currentGraphTabs.length) {
    graphTabsEl.hidden = true;
    graphTabsInfo.textContent = "当前显示：未加载图";
    return;
  }

  ensureActiveGraphTab();
  const activeTab = getActiveGraphTab();
  if (!activeTab) {
    graphTabsEl.hidden = true;
    graphTabsInfo.textContent = "当前显示：未加载图";
    return;
  }

  graphTabsInfo.textContent =
    currentGraphTabs.length > 1
      ? `当前显示：${activeTab.label}；共 ${currentGraphTabs.length} 个标签`
      : `当前显示：全图（${activeTab.stats.nodeCount} 节点 / ${activeTab.stats.edgeCount} 边）`;

  if (currentGraphTabs.length === 1) {
    graphTabsEl.hidden = true;
    return;
  }

  graphTabsEl.hidden = false;

  for (const tab of currentGraphTabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${tab.id === activeGraphTabId ? " active" : ""}`;
    button.textContent = tab.label;
    button.addEventListener("click", () => {
      if (tab.id === activeGraphTabId) return;
      captureCurrentTabViewState();
      activeGraphTabId = tab.id;
      renderActiveGraph(`已切换到${tab.label}`);
    });
    graphTabsEl.append(button);
  }
}

function updateRenderModeInfo() {
  if (!renderModeInfo) return;

  const requestedMode = getRequestedRenderMode();
  const requestedLabel =
    requestedMode === "auto"
      ? "自动"
      : requestedMode === "overview"
        ? "概览模式"
        : "完整模式";

  if (!currentGraphStats) {
    renderModeInfo.textContent =
      `${requestedLabel}；超过 ${LARGE_GRAPH_NODE_THRESHOLD} 个节点或 ${LARGE_GRAPH_EDGE_THRESHOLD} 条边时会自动切到概览模式。`;
    return;
  }

  const sizeLabel = `${currentGraphStats.nodeCount} 节点 / ${currentGraphStats.edgeCount} 边`;
  if (isOverviewProfile()) {
    const autoPrefix = requestedMode === "auto" ? "自动 -> " : "";
    const layoutNote =
      currentEffectiveLayoutMode !== layoutSelect.value
        ? "；已把力导向安全降级为默认分层"
        : "";
    renderModeInfo.textContent =
      `当前策略：${autoPrefix}概览模式（${sizeLabel}；隐藏标签、直线边、无动画${layoutNote}）`;
    return;
  }

  renderModeInfo.textContent = `当前策略：${requestedLabel}（${sizeLabel}）`;
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

function toVisData(parsed, renderProfile) {
  const hideLabels = isOverviewProfile(renderProfile);
  const visNodes = parsed.nodes.map((n) => {
    const attrs = n.attrs || {};
    const fill = (attrs.style || "").toLowerCase().includes("filled");
    const isWhiteNode = isWhiteNodeAttrs(attrs);
    const borderColor = isWhiteNode ? "#b7b7b7" : attrs.color || "#7f8c8d";
    const fillColor = isWhiteNode ? "#ffffff" : attrs.fillcolor || borderColor || "#ffffff";
    const dotLabel = normalizeDisplayLabel(attrs.label || n.id);
    const whiteLabelParts = splitDisplayLabel(dotLabel);
    const shape = isWhiteNode ? "dot" : dotShapeToVis(attrs.shape);
    const isHex = shape === "hexagon";

    return {
      id: n.id,
      label: isWhiteNode || hideLabels ? "" : dotLabel,
      title: buildNodeTitle(n.id, dotLabel),
      dotLabel,
      whiteLabelTop: isWhiteNode ? whiteLabelParts.top : "",
      whiteLabelInner: isWhiteNode ? whiteLabelParts.inner : "",
      isWhiteNode,
      isHex,
      shape,
      color: fill
        ? {
            background: fillColor,
            border: borderColor,
            highlight: { background: fillColor, border: "#111" },
          }
        : { border: borderColor, background: "#ffffff", highlight: { border: "#111", background: "#ffffff" } },
      font: {
        face: "Avenir Next, PingFang SC, Noto Sans SC, sans-serif",
        size: isHex ? 12 : hideLabels ? 12 : 14,
        color: "#111111",
        vadjust: 0,
      },
      borderWidth: hideLabels ? 1 : 1.5,
      ...(isWhiteNode
        ? {
            size: hideLabels ? 8 : 24,
            widthConstraint: false,
            heightConstraint: false,
          }
        : {}),
      ...(isHex
        ? {
            size: hideLabels ? 16 : 24,
            widthConstraint: { minimum: hideLabels ? 18 : 34 },
            heightConstraint: { minimum: hideLabels ? 18 : 30 },
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
      arrows: hideLabels ? { to: { enabled: false } } : "to",
      color: { color, highlight: color, hover: color },
      width: hideLabels ? 1 : Number(e.attrs.penwidth || 1.2),
      smooth: hideLabels ? false : { type: "dynamic" },
    };
  });

  return { visNodes, visEdges };
}

function isHierarchicalLayoutMode(layoutMode) {
  return ["hierarchicalTB", "hierarchicalLR"].includes(layoutMode);
}

function buildLayoutOptions(layoutMode, renderProfile) {
  const compact = isOverviewProfile(renderProfile);
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

  let direction = "DU";
  if (layoutMode === "hierarchicalLR") {
    direction = "LR";
  }

  return {
    layout: {
      hierarchical: {
        enabled: true,
        direction,
        sortMethod: "directed",
        levelSeparation: compact ? 72 : 120,
        nodeSpacing: compact ? 36 : 90,
        treeSpacing: compact ? 48 : 120,
      },
    },
    physics: false,
  };
}

function buildNetworkOptions(layoutMode, renderProfile) {
  const compact = isOverviewProfile(renderProfile);
  return {
    autoResize: true,
    edges: { arrows: { to: { enabled: !compact } } },
    nodes: { margin: compact ? 3 : 8 },
    interaction: {
      dragNodes: true,
      dragView: true,
      zoomView: false,
      multiselect: false,
      selectConnectedEdges: false,
      hoverConnectedEdges: false,
      hideEdgesOnDrag: compact,
      hideEdgesOnZoom: compact,
      tooltipDelay: compact ? 80 : 300,
    },
    manipulation: false,
    ...buildLayoutOptions(layoutMode, renderProfile),
  };
}

function buildFreeDragOptions(renderProfile) {
  const compact = isOverviewProfile(renderProfile);
  return {
    autoResize: true,
    edges: { arrows: { to: { enabled: !compact } } },
    nodes: { margin: compact ? 3 : 8 },
    interaction: {
      dragNodes: true,
      dragView: true,
      zoomView: false,
      multiselect: false,
      selectConnectedEdges: false,
      hoverConnectedEdges: false,
      hideEdgesOnDrag: compact,
      hideEdgesOnZoom: compact,
      tooltipDelay: compact ? 80 : 300,
    },
    manipulation: false,
    layout: { improvedLayout: false },
    physics: false,
  };
}

function fitNetworkToView() {
  if (!network) return;
  network.fit({ animation: !isOverviewProfile() });
}

function zoomNetwork(scaleFactor) {
  if (!network) return;
  const currentScale = network.getScale();
  const currentPosition = network.getViewPosition();
  const nextScale = Math.max(0.08, Math.min(4, currentScale * scaleFactor));

  network.moveTo({
    position: currentPosition,
    scale: nextScale,
    animation: !isOverviewProfile(),
  });
}

function applyCirclePositions() {
  const all = nodes.get();
  const n = all.length;
  if (!n) return;

  const radius = isOverviewProfile() ? 140 + n * 1.2 : 260 + n * 3;
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
  fitNetworkToView();
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
  const compact = isOverviewProfile();
  const xGap = compact ? 48 : 140;
  const yGap = compact ? 58 : 130;

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
  if (isOverviewProfile()) {
    nodeTextModeInfo.textContent = "当前显示：概览模式已隐藏节点文本，悬停可看详情";
    toggleNodeTextBtn.textContent = "概览模式已隐藏文本";
    toggleNodeTextBtn.disabled = true;
    return;
  }

  toggleNodeTextBtn.disabled = false;
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
    label: isOverviewProfile() || node.isWhiteNode
      ? ""
      : nodeTextMode === "id"
        ? String(node.id)
        : String(node.dotLabel ?? node.id),
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

function drawTextWithOutline(ctx, text, x, y, options = {}) {
  if (!text) return;
  const {
    font = '12px "Avenir Next", "PingFang SC", "Noto Sans SC", sans-serif',
    fillStyle = "#111111",
    strokeStyle = "rgba(255,255,255,0.92)",
    lineWidth = 3,
    textBaseline = "middle",
  } = options;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = textBaseline;
  ctx.lineJoin = "round";
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillStyle;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawWhiteNodeLabels(ctx) {
  if (!network || isOverviewProfile()) return;

  const whiteNodes = nodes.get({
    filter: (node) => node.isWhiteNode,
  });
  if (!whiteNodes.length) return;

  const positions = network.getPositions(whiteNodes.map((node) => node.id));

  for (const node of whiteNodes) {
    const position = positions[node.id];
    if (!position) continue;

    const background = node.color?.background || "#ffffff";
    const innerText =
      nodeTextMode === "id" ? String(node.id) : String(node.whiteLabelInner || node.dotLabel || node.id);
    const topText = nodeTextMode === "id" ? "" : String(node.whiteLabelTop || "");

    drawTextWithOutline(ctx, innerText, position.x, position.y, {
      font: '11px "Avenir Next", "PingFang SC", "Noto Sans SC", sans-serif',
      fillStyle: readableTextColor(background),
      strokeStyle: background,
      lineWidth: 4,
    });

    if (topText) {
      drawTextWithOutline(ctx, topText, position.x, position.y - 20, {
        font: '12px "Avenir Next", "PingFang SC", "Noto Sans SC", sans-serif',
        fillStyle: "#111111",
        strokeStyle: "rgba(255,255,255,0.92)",
        lineWidth: 3,
        textBaseline: "bottom",
      });
    }
  }
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
  network.on("afterDrawing", drawWhiteNodeLabels);
}

function createOrResetNetwork(layoutMode) {
  const container = document.getElementById("network");
  if (network) network.destroy();

  if (layoutMode === "ruleBased") {
    applyRuleBasedPositions();
    network = new vis.Network(
      container,
      { nodes, edges },
      buildFreeDragOptions(currentRenderProfile),
    );
    bindNetworkEvents();
    if (!restoreActiveTabViewState()) {
      fitNetworkToView();
    }
    return;
  }

  if (isHierarchicalLayoutMode(layoutMode)) {
    network = new vis.Network(
      container,
      { nodes, edges },
      buildNetworkOptions(layoutMode, currentRenderProfile),
    );
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
      network = new vis.Network(
        container,
        { nodes, edges },
        buildFreeDragOptions(currentRenderProfile),
      );
      bindNetworkEvents();
      if (!restoreActiveTabViewState()) {
        fitNetworkToView();
      }
    });
    return;
  }

  network = new vis.Network(
    container,
    { nodes, edges },
    buildNetworkOptions(layoutMode, currentRenderProfile),
  );
  bindNetworkEvents();
  network.once("afterDrawing", () => {
    if (!restoreActiveTabViewState()) {
      if (layoutMode === "circle") {
        applyCirclePositions();
      } else {
        fitNetworkToView();
      }
    }
  });
}

function renderActiveGraph(statusPrefix = "") {
  ensureActiveGraphTab();
  const activeTab = getActiveGraphTab();
  if (!sourceParsedGraph || !activeTab) {
    clearGraph();
    updateRenderModeInfo();
    renderGraphTabs();
    setStatus("当前没有可渲染的子图。", true);
    return;
  }

  try {
    parsedGraph = getSubgraphForTab(sourceParsedGraph, activeTab);
    currentGraphStats = activeTab.stats;
    currentRenderProfile = getEffectiveRenderProfile(currentGraphStats);
    currentEffectiveLayoutMode = getEffectiveLayoutMode(
      layoutSelect.value,
      currentRenderProfile,
    );

    const { visNodes, visEdges } = toVisData(parsedGraph, currentRenderProfile);

    nodes = new vis.DataSet(visNodes);
    edges = new vis.DataSet(visEdges);
    applyNodeTextMode();
    cacheOriginalStyles();
    createOrResetNetwork(currentEffectiveLayoutMode);
    updateRenderModeInfo();
    renderGraphTabs();

    const tabNote = currentGraphTabs.length > 1 ? `${activeTab.label}；` : "";
    const modeNote = isOverviewProfile() ? "概览模式" : "完整模式";
    const layoutNote =
      isOverviewProfile() && currentEffectiveLayoutMode !== layoutSelect.value
        ? "；力导向已自动降级"
        : "";

    const successMessage = statusPrefix
      ? `${statusPrefix}；${tabNote}${visNodes.length} 节点 / ${visEdges.length} 边；${modeNote}${layoutNote}`
      : `${tabNote}${visNodes.length} 节点 / ${visEdges.length} 边；${modeNote}${layoutNote}`;
    setStatus(successMessage);
  } catch (err) {
    const errorMessage = statusPrefix
      ? `${statusPrefix}；渲染失败：${err.message}`
      : `渲染失败：${err.message}`;
    setStatus(errorMessage, true);
    console.error(err);
  }
}

function renderGraph(statusPrefix = "") {
  try {
    sourceParsedGraph = sanitizeParsedGraph(parseDot(currentDotText));
    currentGraphTabs = buildGraphTabs(sourceParsedGraph);
    activeGraphTabId = currentGraphTabs[0]?.id || null;
    renderActiveGraph(statusPrefix);
  } catch (err) {
    clearGraph();
    updateRenderModeInfo();
    renderGraphTabs();
    const errorMessage = statusPrefix
      ? `${statusPrefix}；渲染失败：${err.message}`
      : `渲染失败：${err.message}`;
    setStatus(errorMessage, true);
    console.error(err);
  }
}

function applyLayout() {
  if (!network) return;
  captureCurrentTabViewState();
  updateTransientHighlight([]);
  currentEffectiveLayoutMode = getEffectiveLayoutMode(
    layoutSelect.value,
    currentRenderProfile,
  );
  createOrResetNetwork(currentEffectiveLayoutMode);
  updateRenderModeInfo();
  renderGraphTabs();

  const layoutNote =
    currentEffectiveLayoutMode !== layoutSelect.value
      ? "；概览模式下已安全降级为默认分层"
      : "";
  setStatus(
    `已应用布局：${layoutSelect.options[layoutSelect.selectedIndex].text}${layoutNote}`,
  );
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    currentDotText = await file.text();
    renderGraph(`已加载文件：${file.name}`);
  } catch (err) {
    setStatus(`读取文件失败：${err.message}`, true);
  }
});

async function loadDefaultGraph() {
  try {
    const response = await fetch(DEFAULT_DOT_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    currentDotText = await response.text();
    renderGraph(`已加载默认图：${DEFAULT_DOT_PATH}`);
  } catch (err) {
    currentDotText = "";
    clearGraph();
    updateRenderModeInfo();
    renderGraphTabs();
    setStatus(`默认图加载失败：${err.message}`, true);
    console.warn("Failed to load default graph:", err);
  }
}

renderBtn.addEventListener("click", () => renderGraph());
applyLayoutBtn.addEventListener("click", applyLayout);
zoomInBtn.addEventListener("click", () => zoomNetwork(1.2));
zoomOutBtn.addEventListener("click", () => zoomNetwork(1 / 1.2));
fitViewBtn.addEventListener("click", fitNetworkToView);
renderModeSelect.addEventListener("change", () => {
  if (!sourceParsedGraph) {
    updateRenderModeInfo();
    renderGraphTabs();
    return;
  }
  captureCurrentTabViewState();
  renderActiveGraph("已切换渲染策略");
});
toggleNodeTextBtn.addEventListener("click", () => {
  nodeTextMode = nodeTextMode === "label" ? "id" : "label";
  applyNodeTextMode();
});

updateNodeTextModeInfo();
updateRenderModeInfo();
loadDefaultGraph();
