// 全局彻底禁止右键菜单，无论是否选中节点
// 必须放在所有代码最顶部
// 防止任何场景下弹出浏览器菜单

document.addEventListener('contextmenu', function(e) {
  e.preventDefault();
}, true);

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

document.addEventListener('DOMContentLoaded', function() {
  // 下面所有获取 DOM 和事件绑定全放这里
  const fileInput = document.getElementById("fileInput");
  const renderBtn = document.getElementById("renderBtn");
  const statusEl = document.getElementById("status");
  const layoutSelect = document.getElementById("layoutSelect");
  const applyLayoutBtn = document.getElementById("applyLayoutBtn");
  const expandAllCollapsedBtn = document.getElementById("expandAllCollapsedBtn");
  const toggleNodeTextBtn = document.getElementById("toggleNodeTextBtn");
  const nodeTextModeInfo = document.getElementById("nodeTextModeInfo");
  const restorePanel = document.getElementById("restorePanel");
  const restoreParentInfo = document.getElementById("restoreParentInfo");
  const restoreChildSelect = document.getElementById("restoreChildSelect");
  const restoreConfirmBtn = document.getElementById("restoreConfirmBtn");
  const restoreCancelBtn = document.getElementById("restoreCancelBtn");

  // 其余原有代码全部保留缩进到这里


const HIGHLIGHT_RED = "#e60023";
const INCOMING_GREEN = "#2f9e44";
const CENTER_NODE_COLOR = "#5a0010";

let network;
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);
let parsedGraph = null;
let currentDotText = sampleDot;
let nodeTextMode = "label";
let originalNodeStyle = new Map();
let originalEdgeStyle = new Map();
let highlightedNodeIds = new Set();
let highlightedEdgeIds = new Set();
let highlightedEdgeColor = new Map();
let originalIncomingByNode = new Map();
let originalOutgoingByNode = new Map();
let originalInEdgeIdsByNode = new Map();
let originalOutEdgeIdsByNode = new Map();
let collapsedNodeIds = new Set();
let shortcutEdgeIdsByNode = new Map();
let hiddenShortcutIncidentEdgeIdsByNode = new Map();
let collapsedBadgeCountByNode = new Map();
let collapsedChildrenByParent = new Map();
let collapsedParentsByNode = new Map();
let restorePanelParentId = null;
let clickTimer = null;
let dblClickFired = false;

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

function rebuildCollapsedBadgeCountByNode() {
  collapsedBadgeCountByNode = new Map();

  for (const collapsedId of collapsedNodeIds) {
    const parents = Array.from(new Set(collapsedParentsByNode.get(collapsedId) || []));
    for (const parentId of parents) {
      collapsedBadgeCountByNode.set(
        parentId,
        (collapsedBadgeCountByNode.get(parentId) || 0) + getCollapsedWeight(collapsedId)
      );
    }
  }
}

function registerCollapsedChildToParents(nodeId, parents) {
  const uniqueParents = Array.from(new Set(parents || []));
  collapsedParentsByNode.set(nodeId, new Set(uniqueParents));

  for (const parentId of uniqueParents) {
    if (!collapsedChildrenByParent.has(parentId)) {
      collapsedChildrenByParent.set(parentId, new Set());
    }
    collapsedChildrenByParent.get(parentId).add(nodeId);
  }
}

function unregisterCollapsedChildFromParents(nodeId) {
  const parents = Array.from(new Set(collapsedParentsByNode.get(nodeId) || []));
  for (const parentId of parents) {
    const set = collapsedChildrenByParent.get(parentId);
    if (!set) continue;
    set.delete(nodeId);
    if (!set.size) collapsedChildrenByParent.delete(parentId);
  }
  collapsedParentsByNode.delete(nodeId);
}

function applyNodeTextMode() {
  const updates = nodes.get().map((node) => ({
    id: node.id,
    label: (() => {
      const base =
        nodeTextMode === "id" ? String(node.id) : String(node.dotLabel ?? node.id);
      const collapsedCount = collapsedBadgeCountByNode.get(node.id) || 0;
      return collapsedCount > 0 ? `${base}\n[c:${collapsedCount}]` : base;
    })(),
  }));
  nodes.update(updates);
  updateNodeTextModeInfo();
}

function refreshCollapsedBadges() {
  rebuildCollapsedBadgeCountByNode();
  if (restorePanelParentId) {
    showRestorePanel(restorePanelParentId);
  }
  applyNodeTextMode();
}

function getVisibleParents(nodeId) {
  return edges
    .get({ filter: (e) => !e.hidden && e.to === nodeId })
    .map((e) => e.from)
    .filter((id) => !nodes.get(id)?.hidden);
}

function getVisibleChildren(nodeId) {
  return edges
    .get({ filter: (e) => !e.hidden && e.from === nodeId })
    .map((e) => e.to)
    .filter((id) => !nodes.get(id)?.hidden);
}

function syncCollapsedGraphState() {
  rebuildCollapsedBadgeCountByNode();
}

function getCollapsedWeight(nodeId) {
  if (!collapsedNodeIds.has(nodeId)) return 0;
  return 1 + getCollapsedDescendantCount(nodeId);
}

function getCollapsedDescendantCount(nodeId, visited = new Set()) {
  if (visited.has(nodeId)) return 0;
  visited.add(nodeId);

  const children = Array.from(collapsedChildrenByParent.get(nodeId) || []);
  let total = 0;
  for (const childId of children) {
    total += 1 + getCollapsedDescendantCount(childId, visited);
  }
  return total;
}

function getCollapsedBadgeText(nodeId) {
  const count = collapsedBadgeCountByNode.get(nodeId) || 0;
  return count > 0 ? `[c:${count}]` : "";
}

function promptRestoreCollapsedChild(parentId) {
  showRestorePanel(parentId);
}

function hideRestorePanel() {
  if (!restorePanel) return;
  restorePanel.style.display = "none";
  restorePanelParentId = null;
  if (restoreChildSelect) restoreChildSelect.innerHTML = "";
}

function showRestorePanel(parentId) {
  const collapsedChildren = Array.from(collapsedChildrenByParent.get(parentId) || []).filter(
    (id) => collapsedNodeIds.has(id)
  );

  if (!collapsedChildren.length) {
    hideRestorePanel();
    setStatus(`父节点 ${parentId} 下没有可恢复的收缩节点`);
    return;
  }

  restorePanelParentId = parentId;

  if (restoreParentInfo) {
    restoreParentInfo.textContent = `父节点：${parentId}（可恢复 ${collapsedChildren.length} 个）`;
  }

  if (restoreChildSelect) {
    restoreChildSelect.innerHTML = "";
    for (const childId of collapsedChildren) {
      const option = document.createElement("option");
      option.value = childId;
      const childNode = nodes.get(childId);
      const childLabel = String(childNode?.dotLabel ?? childNode?.label ?? childId);
      option.textContent = `${collapsedChildren.indexOf(childId) + 1}. ${childLabel} (ID: ${childId})`;
      restoreChildSelect.appendChild(option);
    }
    restoreChildSelect.selectedIndex = 0;
  }

  if (restorePanel) restorePanel.style.display = "block";
}

function confirmRestoreFromPanel() {
  if (!restorePanelParentId || !restoreChildSelect) return;
  const childId = restoreChildSelect.value;
  if (!childId) return;

  const list = Array.from(collapsedChildrenByParent.get(restorePanelParentId) || []);
  if (!list.includes(childId) || !collapsedNodeIds.has(childId)) {
    setStatus(`节点 ${childId} 不在父节点 ${restorePanelParentId} 的可恢复列表中`, true);
    return;
  }

  clearTransientHighlight();
  expandNodeDirect(childId);
  setStatus(`已从父节点 ${restorePanelParentId} 恢复节点：${childId}（当前收缩 ${collapsedNodeIds.size} 个）`);

  // 刷新面板：同父节点可能还有其它收缩子节点
  if ((collapsedChildrenByParent.get(restorePanelParentId) || new Set()).size) {
    showRestorePanel(restorePanelParentId);
  } else {
    hideRestorePanel();
  }
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

function rebuildOriginalAdjacency() {
  originalIncomingByNode = new Map();
  originalOutgoingByNode = new Map();
  originalInEdgeIdsByNode = new Map();
  originalOutEdgeIdsByNode = new Map();

  for (const nodeId of nodes.getIds()) {
    originalIncomingByNode.set(nodeId, []);
    originalOutgoingByNode.set(nodeId, []);
    originalInEdgeIdsByNode.set(nodeId, []);
    originalOutEdgeIdsByNode.set(nodeId, []);
  }

  for (const edge of edges.get()) {
    if (!originalOutgoingByNode.has(edge.from)) {
      originalOutgoingByNode.set(edge.from, []);
      originalOutEdgeIdsByNode.set(edge.from, []);
    }
    if (!originalIncomingByNode.has(edge.to)) {
      originalIncomingByNode.set(edge.to, []);
      originalInEdgeIdsByNode.set(edge.to, []);
    }

    originalOutgoingByNode.get(edge.from).push(edge.to);
    originalIncomingByNode.get(edge.to).push(edge.from);
    originalOutEdgeIdsByNode.get(edge.from).push(edge.id);
    originalInEdgeIdsByNode.get(edge.to).push(edge.id);
  }
}

function collapseNodeDirect(nodeId) {
  if (collapsedNodeIds.has(nodeId)) return;

  const parents = Array.from(new Set(getVisibleParents(nodeId)));
  const children = Array.from(new Set(getVisibleChildren(nodeId)));

  // 隐藏节点本体
  nodes.update({ id: nodeId, hidden: true });

  // 隐藏原始关联边
  const incidentEdgeIds = [
    ...(originalInEdgeIdsByNode.get(nodeId) || []),
    ...(originalOutEdgeIdsByNode.get(nodeId) || []),
  ];
  if (incidentEdgeIds.length) {
    edges.update(incidentEdgeIds.map((id) => ({ id, hidden: true })));
  }

  // 额外隐藏当前可见的 shortcut 关联边（用于递归收缩后可正确恢复）
  const visibleShortcutIncidentIds = edges
    .get({
      filter: (e) =>
        !e.hidden &&
        String(e.id).startsWith("shortcut__") &&
        (e.from === nodeId || e.to === nodeId),
    })
    .map((e) => e.id);

  if (visibleShortcutIncidentIds.length) {
    edges.update(visibleShortcutIncidentIds.map((id) => ({ id, hidden: true })));
  }

  // 新增父->子跳边
  const existingBaseVisiblePairs = new Set(
    edges
      .get()
      .filter((e) => !e.hidden)
      .map((e) => `${e.from}->${e.to}`)
  );

  const shortcuts = [];
  for (const p of parents) {
    for (const c of children) {
      const pair = `${p}->${c}`;
      // 如果原图本来就有父->子的直接边，就不重复加跳边。
      // 但如果只是其他收缩节点生成的 shortcut，不在这里拦截，避免展开时丢连接。
      if (existingBaseVisiblePairs.has(pair)) continue;
      const id = `shortcut__${p}__${nodeId}__${c}`;
      shortcuts.push({
        id,
        from: p,
        to: c,
        arrows: "to",
        color: { color: "#888", highlight: "#888", hover: "#888" },
        width: 1.2,
        smooth: { type: "dynamic" },
      });
    }
  }

  if (shortcuts.length) {
    edges.add(shortcuts);
  }

  collapsedNodeIds.add(nodeId);
  shortcutEdgeIdsByNode.set(nodeId, shortcuts.map((e) => e.id));
  hiddenShortcutIncidentEdgeIdsByNode.set(nodeId, visibleShortcutIncidentIds);
  registerCollapsedChildToParents(nodeId, parents);
  refreshCollapsedBadges();
  cacheOriginalStyles();
  network.redraw();
}

function expandNodeDirect(nodeId) {
  if (!collapsedNodeIds.has(nodeId)) return;

  // 删除跳边
  const shortcutIds = shortcutEdgeIdsByNode.get(nodeId) || [];
  if (shortcutIds.length) {
    edges.remove(shortcutIds);
  }

  // 恢复节点及其原始边
  nodes.update({ id: nodeId, hidden: false });

  const originalIncidentEdgeIds = [
    ...(originalInEdgeIdsByNode.get(nodeId) || []),
    ...(originalOutEdgeIdsByNode.get(nodeId) || []),
  ];

  const hiddenShortcutIncidentIds = hiddenShortcutIncidentEdgeIdsByNode.get(nodeId) || [];
  const toTryRestore = [...new Set([...originalIncidentEdgeIds, ...hiddenShortcutIncidentIds])];
  if (toTryRestore.length) {
    const updates = [];
    for (const id of toTryRestore) {
      const edge = edges.get(id);
      if (!edge) continue;
      const fromHidden = !!nodes.get(edge.from)?.hidden;
      const toHidden = !!nodes.get(edge.to)?.hidden;
      updates.push({ id, hidden: fromHidden || toHidden });
    }
    if (updates.length) edges.update(updates);
  }

  collapsedNodeIds.delete(nodeId);
  shortcutEdgeIdsByNode.delete(nodeId);
  hiddenShortcutIncidentEdgeIdsByNode.delete(nodeId);
  unregisterCollapsedChildFromParents(nodeId);
  syncCollapsedGraphState();
  applyNodeTextMode();
  cacheOriginalStyles();
  network.redraw();
}

function toggleCollapseNode(nodeId) {
  clearTransientHighlight();
  if (collapsedNodeIds.has(nodeId)) {
    expandNodeDirect(nodeId);
    setStatus(`已展开节点：${nodeId}（当前收缩 ${collapsedNodeIds.size} 个）`);
  } else {
    collapseNodeDirect(nodeId);
    setStatus(`已收缩节点：${nodeId}（当前收缩 ${collapsedNodeIds.size} 个）`);
  }
}

function expandAllCollapsedNodes() {
  const toExpand = Array.from(collapsedNodeIds);
  for (const id of toExpand) {
    expandNodeDirect(id);
  }
  collapsedChildrenByParent = new Map();
  collapsedParentsByNode = new Map();
  hiddenShortcutIncidentEdgeIdsByNode = new Map();
  syncCollapsedGraphState();
  applyNodeTextMode();
  clearTransientHighlight();
  hideRestorePanel();
  setStatus("已展开全部收缩节点");
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
    if (edge.hidden) continue;
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

  function handleNodeSingleClick(clickedNodes, event) {
    const altKey = !!event?.srcEvent?.altKey;
    if (altKey && clickedNodes.length) {
      promptRestoreCollapsedChild(clickedNodes[0]);
      return;
    }
    if (clickedNodes.length) {
      network.setSelection({ nodes: [clickedNodes[0]], edges: [] }, { unselectAll: true });
    } else {
      network.unselectAll();
    }
    syncHighlightFromSelection();
}

network.on("click", ({ nodes: clickedNodes, event }) => {
  if (clickTimer) clearTimeout(clickTimer);
  clickTimer = setTimeout(() => {
    if (dblClickFired) {
      dblClickFired = false;
      return;
    }
    handleNodeSingleClick(clickedNodes, event);
  }, 220);
});


  network.on("doubleClick", ({ nodes: clickedNodes }) => {
    dblClickFired = true;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    if (!clickedNodes.length) return;
    toggleCollapseNode(clickedNodes[0]);
  });

  network.on("select", syncHighlightFromSelection);
  network.on("deselectNode", syncHighlightFromSelection);
  network.on("deselectEdge", syncHighlightFromSelection);

  // 右键弹出自定义菜单
network.on("oncontext", function(params) {
    const menu = document.getElementById("customContextMenu");
    if (!menu) return;
    // 通过当前pointer位置判断命中节点，无视选中状态
    let nodeId = null;
    if (params && params.pointer && params.pointer.DOM && network) {
      nodeId = network.getNodeAt(params.pointer.DOM);
    }
    window.lastContextMenuNodeId = nodeId;
    if (nodeId) {
            // --- 以节点中心为菜单锚点 ---
      let x, y;
      if (network && nodeId) {
        // 获取节点中心 network 空间坐标
        const pos = network.getPositions([nodeId])[nodeId];
        if (pos) {
          // 转换为 DOM 坐标
          const domPt = network.canvasToDOM(pos);
          x = domPt.x;
          y = domPt.y;
        }
      }
      // 防御兜底，无network等情况回退
      if (typeof x !== 'number' || typeof y !== 'number') {
        if (params.event && typeof params.event.clientX === "number" && typeof params.event.clientY === "number") {
          x = params.event.clientX;
          y = params.event.clientY;
        } else {
          const rect = document.getElementById("network").getBoundingClientRect();
          x = rect.left + params.pointer.DOM.x;
          y = rect.top + params.pointer.DOM.y;
        }
      }
      menu.style.left = (x + 510) + "px"; // 左移10单位，细致调整
      // 先让菜单隐藏以准确测量高度
    menu.style.display = "block";
    // 选中菜单项高亮滚动入视区
    setTimeout(function() {
      const currentSel = menu.querySelector('li.selected');
      if (currentSel) currentSel.scrollIntoView({ block: 'center', behavior: 'auto' });
    }, 0);
      showCustomContextMenu(nodeId, menu);
      // 让菜单渲染后再获取高度进行微调
      setTimeout(function() {
        // 取上一个上移量和本次下移量的平均值，菜单处于鼠标点略偏上的自然区间
        const ul = menu.querySelector('ul');
        let offsetY = 0;
        if (ul) {
          const firstRow = ul.querySelector('li');
          if (firstRow) {
            const headH = menu.querySelector('div')?.offsetHeight || 28;
            const rowH = firstRow.offsetHeight || 22;
            offsetY = Math.floor(headH + rowH*0.2);
          }
        }
        const fallbackOffsetY = 28;
        const up = y - (offsetY || fallbackOffsetY);
        const down = y + 8;
        menu.style.top = Math.round((up + down)/2) + "px";
      }, 0);
    } else {
      menu.style.display = "none";
    }
  });

// 菜单项右键切换隐藏/显示
  document.getElementById("customContextMenu").addEventListener('contextmenu', function(e) {
    const item = e.target.closest('li[data-node-id]');
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const nodeId = item.getAttribute('data-node-id');
    if (!nodeId) return;
    // 切换隐藏/显示
    const node = nodes.get(nodeId);
    if (!node) return;
    if (node.hidden) {
      // 变为显示，只显示不自动选中/高亮
      nodes.update({ id: nodeId, hidden: false });
    } else {
      // 变为隐藏
      nodes.update({ id: nodeId, hidden: true });
    }
    // 刷新菜单内容
    const menu = document.getElementById("customContextMenu");
    if (menu && window.lastContextMenuNodeId)
      showCustomContextMenu(window.lastContextMenuNodeId, menu);
  }, true);
// 菜单项点击交互（父/子元）
document.getElementById("customContextMenu").addEventListener('click', function(e) {
  const item = e.target.closest('li[data-node-id]');
  if (!item || item.classList.contains('hidden')) return;
  const nodeId = item.getAttribute('data-node-id');
  const type = item.classList.contains('parent-item') ? 'parent' : 'child';
  console.log(`[菜单] 点击${type === 'parent' ? '母元' : '子元'}节点`, nodeId);
  
  // 选中此节点（即高亮/聚焦）
  if (typeof network === 'object' && network && typeof handleNodeSingleClick === 'function') {
    handleNodeSingleClick([nodeId], { srcEvent: e }); // 直接触发主图点击全套逻辑
    // 刷新菜单高亮（联动同步当前选中）
    // 菜单不自动关闭，让用户可观察高亮变化
    const menu = document.getElementById("customContextMenu");
    if (menu && window.lastContextMenuNodeId)
      showCustomContextMenu(window.lastContextMenuNodeId, menu);
    return;
  }
  // 扩展点：可继续高亮、属性面板、跳转等
  // 关闭菜单（已不再自动关闭）
});
// 点击空白区域自动隐藏菜单
document.addEventListener('mousedown', function(e) {
  const menu = document.getElementById("customContextMenu");
  if (menu && menu.style.display !== "none" && !menu.contains(e.target)) {
    menu.style.display = 'none';
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
    parsedGraph = parseDot(currentDotText);
    const { visNodes, visEdges } = toVisData(parsedGraph);

    nodes = new vis.DataSet(visNodes);
    edges = new vis.DataSet(visEdges);
    collapsedNodeIds = new Set();
    shortcutEdgeIdsByNode = new Map();
    hiddenShortcutIncidentEdgeIdsByNode = new Map();
    collapsedBadgeCountByNode = new Map();
    collapsedChildrenByParent = new Map();
    collapsedParentsByNode = new Map();
    hideRestorePanel();
    rebuildOriginalAdjacency();
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

document.addEventListener('contextmenu', function(e) {
  e.preventDefault();
}, true);

  } catch (err) {
    setStatus(`读取文件失败：${err.message}`, true);
  }
});

renderBtn.addEventListener("click", renderGraph);
applyLayoutBtn.addEventListener("click", applyLayout);
expandAllCollapsedBtn?.addEventListener("click", expandAllCollapsedNodes);
restoreConfirmBtn?.addEventListener("click", confirmRestoreFromPanel);
restoreCancelBtn?.addEventListener("click", hideRestorePanel);
toggleNodeTextBtn.addEventListener("click", () => {
  nodeTextMode = nodeTextMode === "label" ? "id" : "label";
  applyNodeTextMode();
  // 若菜单开着，强制刷新菜单内容
  const menu = document.getElementById("customContextMenu");
  if (menu && menu.style.display !== "none") {
    // 触发最近一次 oncontext 事件逻辑：重复渲染最新菜单（自动取上一次命中的 nodeId）
    // 实现思路：可记录上一次弹菜单的 nodeId，全局变量 lastContextMenuNodeId
    if (window.lastContextMenuNodeId) {
      showCustomContextMenu(window.lastContextMenuNodeId, menu);
    }
  }
});

// 封装右键弹菜单（便于主动刷新）
function showCustomContextMenu(nodeId, menu) {
  if (!menu) return;
  if (nodeId) {
    // 获取母元（父节点）和子元（子节点），内容部分与 oncontext 中完全一致
    // 获取所有父节点，不管是否隐藏
    const parentIds = edges.get({ filter: (e) => e.to === nodeId }).map(e => e.from);
    // 获取所有子节点，不管是否隐藏
    const childIds = edges.get({ filter: (e) => e.from === nodeId }).map(e => e.to);
    const showLabel = nodeTextMode !== "id";
    const parentList = parentIds.length ? parentIds.map(pid => {
      const node = nodes.get(pid);
      const isHidden = node && node.hidden;
      const label = node ? (showLabel ? (node.dotLabel ?? node.label ?? pid) : pid) : pid;
      const isSelected = network && network.getSelection && network.getSelection().nodes.includes(pid);
      return `<li data-node-id='${pid}' class='parent-item${isHidden ? ' hidden' : ''}${isSelected ? ' selected' : ''}' title='${isHidden ? '已隐藏' : ''}'>${label}${isHidden ? '（已隐藏）' : ''}</li>`;
    }).join('') : '<li style="color:#aaa">（无）</li>';
    const childList = childIds.length ? childIds.map(cid => {
      const node = nodes.get(cid);
      const isHidden = node && node.hidden;
      const label = node ? (showLabel ? (node.dotLabel ?? node.label ?? cid) : cid) : cid;
      const isSelected = network && network.getSelection && network.getSelection().nodes.includes(cid);
      return `<li data-node-id='${cid}' class='child-item${isHidden ? ' hidden' : ''}${isSelected ? ' selected' : ''}' title='${isHidden ? '已隐藏' : ''}'>${label}${isHidden ? '（已隐藏）' : ''}</li>`;
    }).join('') : '<li style="color:#aaa">（无）</li>';
    menu.innerHTML =
      `<div style='padding:8px 0 0 0;'>
         <div style="padding:0 16px 4px 16px;font-weight:bold;font-size:13px;">母元</div>
         <ul style="margin:0 0 8px 0;padding:0 16px;list-style:none;">${parentList}</ul>
         <div style="padding:0 16px 4px 16px;font-weight:bold;font-size:13px;">子元</div>
         <ul style="margin:0;padding:0 16px 8px 16px;list-style:none;">${childList}</ul>
       </div>`;
    menu.style.display = "block";
  } else {
    menu.style.display = "none";
  }
}

updateNodeTextModeInfo();
renderGraph();
}); // <-- 结束 DOMContentLoaded 回调

