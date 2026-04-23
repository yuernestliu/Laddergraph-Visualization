export const DEFAULT_DOT_PATH = "./G-default.gv";
export const LARGE_GRAPH_NODE_THRESHOLD = 350;
export const LARGE_GRAPH_EDGE_THRESHOLD = 700;
export const FONT_FAMILY = "Avenir Next,PingFang SC,Noto Sans SC,sans-serif";

const HIDDEN_NODE_IDS = new Set(["-1"]);

const SIZE_MODE_CONFIG = {
  fixed: {
    label: "固定",
    diameter: () => 0.98,
  },
  sqrt: {
    label: "sqrt(S)",
    diameter: (value) => Math.max(0.52, Math.min(3.6, 0.14 * Math.sqrt(Math.max(0, value)))),
  },
  cbrt: {
    label: "S^(1/3)",
    diameter: (value) => Math.max(0.52, Math.min(3.0, 0.34 * Math.cbrt(Math.max(0, value)))),
  },
  log: {
    label: "log(S+1)",
    diameter: (value) => Math.max(0.52, Math.min(2.8, 0.92 * Math.log10(Math.max(0, value) + 1))),
  },
  linear: {
    label: "S",
    diameter: (value) => Math.max(0.52, Math.min(6.4, 0.012 * Math.max(0, value))),
  },
};

export const NODE_SIZE_MODE_OPTIONS = [
  { value: "fixed", label: "固定" },
  { value: "sqrt", label: "sqrt(S)" },
  { value: "cbrt", label: "S^(1/3)" },
  { value: "log", label: "log(S+1)" },
  { value: "linear", label: "S" },
];

function getSizeModeConfig(mode) {
  return SIZE_MODE_CONFIG[mode] || SIZE_MODE_CONFIG.sqrt;
}

export function formatNodeSizeModeLabel(mode) {
  return getSizeModeConfig(mode).label;
}

export function summarizeGraph(parsed) {
  return {
    nodeCount: parsed.nodes.length,
    edgeCount: parsed.edges.length,
  };
}

export function isLargeGraph(stats) {
  return (
    stats.nodeCount >= LARGE_GRAPH_NODE_THRESHOLD ||
    stats.edgeCount >= LARGE_GRAPH_EDGE_THRESHOLD
  );
}

export function getEffectiveRenderProfile(stats, requestedMode) {
  if (requestedMode === "full") return "full";
  if (requestedMode === "overview") return "overview";
  return isLargeGraph(stats) ? "overview" : "full";
}

export function getEffectiveLayoutMode(layoutMode, renderProfile) {
  if (renderProfile === "overview" && layoutMode === "force") {
    return "ruleBased";
  }
  return layoutMode;
}

export function normalizeDisplayLabel(rawLabel) {
  return String(rawLabel ?? "").replace(/\\n/g, "\n");
}

export function splitDisplayLabel(rawLabel) {
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

export function normalizeColor(rawColor) {
  return String(rawColor || "").trim().replace(/^"(.*)"$/, "$1").toLowerCase();
}

export function isTransparentColor(rawColor) {
  const value = normalizeColor(rawColor);
  return value === "#ffffffff" || value === "#ffffff00" || value === "transparent";
}

export function isWhiteColor(rawColor) {
  const value = normalizeColor(rawColor);
  return value === "white" || value === "#fff" || value === "#ffffff" || value === "#ffffffff";
}

function getShapeName(attrs = {}) {
  return String(attrs.shape || "ellipse").trim().toLowerCase();
}

function isGreyNodeColor(rawColor) {
  const value = normalizeColor(rawColor);
  return value === "grey" || value === "gray";
}

function isGreyEllipseNode(attrs = {}) {
  return isGreyNodeColor(attrs.color) && ["ellipse", "circle", "oval"].includes(getShapeName(attrs));
}

export function isTargetNodeId(nodeId) {
  return /^-\d+$/.test(String(nodeId).trim());
}

export function isTargetNode(attrs = {}, nodeId = "") {
  return (
    isTargetNodeId(nodeId) ||
    (isWhiteColor(attrs.fillcolor) && ["ellipse", "circle", "oval"].includes(getShapeName(attrs)))
  );
}

export function isScalableLadderNode(attrs = {}, nodeId = "") {
  return !isTargetNode(attrs, nodeId) && isGreyEllipseNode(attrs);
}

export function isExternalLabelEllipseNode(attrs = {}, nodeId = "") {
  return (
    isTargetNode(attrs, nodeId) &&
    isWhiteColor(attrs.fillcolor)
  );
}

function isHiddenNode(node) {
  return HIDDEN_NODE_IDS.has(String(node.id));
}

export function sanitizeParsedGraph(parsed) {
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

export function buildGraphTabs(parsed) {
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

export function getSubgraphForTab(parsed, tab) {
  if (!tab) return parsed;
  return {
    graphAttrs: parsed.graphAttrs,
    nodes: parsed.nodes.filter((node) => tab.nodeSet.has(node.id)),
    edges: parsed.edges.filter((edge) => tab.nodeSet.has(edge.from) && tab.nodeSet.has(edge.to)),
  };
}

export function buildNodeLayerMap(parsed) {
  const nodeIds = parsed.nodes.map((node) => node.id);
  const outgoing = new Map(nodeIds.map((nodeId) => [nodeId, []]));
  const indegree = new Map(nodeIds.map((nodeId) => [nodeId, 0]));
  const levelByNodeId = new Map(nodeIds.map((nodeId) => [nodeId, 0]));

  for (const edge of parsed.edges) {
    if (!outgoing.has(edge.from) || !indegree.has(edge.to)) continue;
    outgoing.get(edge.from).push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
  }

  const queue = nodeIds.filter((nodeId) => (indegree.get(nodeId) || 0) === 0);
  const remainingIndegree = new Map(indegree);
  const processedNodeIds = new Set();
  let cursor = 0;
  let processedCount = 0;

  // Level = longest upstream path length from any source node.
  while (cursor < queue.length) {
    const nodeId = queue[cursor++];
    processedCount += 1;
    processedNodeIds.add(nodeId);
    const baseLevel = levelByNodeId.get(nodeId) || 0;

    for (const targetId of outgoing.get(nodeId) || []) {
      levelByNodeId.set(targetId, Math.max(levelByNodeId.get(targetId) || 0, baseLevel + 1));
      const nextIndegree = (remainingIndegree.get(targetId) || 0) - 1;
      remainingIndegree.set(targetId, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(targetId);
      }
    }
  }

  if (processedCount < nodeIds.length) {
    for (const nodeId of nodeIds) {
      if (!processedNodeIds.has(nodeId)) {
        levelByNodeId.set(nodeId, Math.max(0, levelByNodeId.get(nodeId) || 0));
      }
    }
  }

  let maxDepth = 0;
  for (const depth of levelByNodeId.values()) {
    maxDepth = Math.max(maxDepth, depth);
  }

  return {
    levelByNodeId,
    maxDepth,
  };
}

export function filterSubgraphByLayerDepth(parsed, trimmedLayerCount, layerMeta = null) {
  const effectiveLayerMeta = layerMeta || buildNodeLayerMap(parsed);
  const clampedTrimmedLayerCount = Math.max(
    0,
    Math.min(
      effectiveLayerMeta.maxDepth,
      Number.isFinite(trimmedLayerCount) ? trimmedLayerCount : 0,
    ),
  );
  const visibleNodes = parsed.nodes.filter(
    (node) => (effectiveLayerMeta.levelByNodeId.get(node.id) || 0) >= clampedTrimmedLayerCount,
  );
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

  return {
    graphAttrs: parsed.graphAttrs,
    nodes: visibleNodes,
    edges: parsed.edges.filter(
      (edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to),
    ),
  };
}

export function cleanId(raw) {
  const value = String(raw).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseAttributes(attrText) {
  const attrs = {};
  const regex = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,\]]+)/g;
  let match;
  while ((match = regex.exec(attrText)) !== null) {
    attrs[match[1]] = cleanId(match[2].trim());
  }
  return attrs;
}

export function splitStatements(body) {
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
      bracketDepth += 1;
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

export function parseDot(dotText) {
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
      const ids = edgeExpr.split(/->/).map((segment) => cleanId(segment.trim())).filter(Boolean);

      for (let i = 0; i < ids.length - 1; i += 1) {
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

function stripLayoutAttrs(attrs = {}) {
  const next = { ...attrs };
  delete next.pos;
  delete next.lp;
  delete next.xlp;
  delete next.bb;
  delete next.tail_lp;
  delete next.head_lp;
  return next;
}

function escapeDotString(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

function quoteDotValue(value) {
  return `"${escapeDotString(value)}"`;
}

function quoteDotId(value) {
  return `"${escapeDotString(value)}"`;
}

function serializeAttrs(attrs = {}) {
  const entries = Object.entries(attrs).filter(([, value]) => value != null && value !== "");
  if (!entries.length) return "";
  const body = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${quoteDotValue(value)}`)
    .join(", ");
  return ` [${body}]`;
}

function ensureFilledStyle(styleValue) {
  const parts = String(styleValue || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.includes("filled")) {
    parts.unshift("filled");
  }
  return parts.join(",");
}

function getLayoutSpec(layoutMode, renderProfile) {
  const compact = renderProfile === "overview";
  switch (layoutMode) {
    case "hierarchicalLR":
      return {
        engine: "dot",
        graphAttrs: {
          rankdir: "LR",
          splines: compact ? "polyline" : "spline",
          nodesep: compact ? "0.16" : "0.28",
          ranksep: compact ? "0.35" : "0.72",
          outputorder: "edgesfirst",
          pad: compact ? "0.08" : "0.2",
        },
      };
    case "ruleBased":
      return {
        engine: "dot",
        graphAttrs: {
          rankdir: "BT",
          ordering: "out",
          splines: compact ? "line" : "polyline",
          nodesep: compact ? "0.12" : "0.22",
          ranksep: compact ? "0.28" : "0.54",
          outputorder: "edgesfirst",
          pad: compact ? "0.08" : "0.16",
        },
      };
    case "force":
      return {
        engine: "neato",
        graphAttrs: {
          overlap: "prism0",
          splines: "true",
          sep: compact ? "+6" : "+12",
          outputorder: "edgesfirst",
          pad: compact ? "0.08" : "0.18",
        },
      };
    case "hierarchicalTB":
    default:
      return {
        engine: "dot",
        graphAttrs: {
          rankdir: "BT",
          splines: compact ? "polyline" : "spline",
          nodesep: compact ? "0.16" : "0.3",
          ranksep: compact ? "0.34" : "0.78",
          outputorder: "edgesfirst",
          pad: compact ? "0.08" : "0.2",
        },
      };
  }
}

export function extractNodeMetricFromLabel(rawLabel) {
  const normalized = normalizeDisplayLabel(rawLabel);
  const matches = Array.from(normalized.matchAll(/\(([0-9][0-9,]*(?:\.\d+)?)\)/g));
  if (!matches.length) return null;
  const rawValue = matches[matches.length - 1][1].replace(/,/g, "");
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildNodeSizeContext(nodes, renderProfile, nodeSizeMode) {
  const compact = renderProfile === "overview";
  const defaultWidth = compact ? 0.58 : 0.98;
  const height = compact ? 0.24 : 0.4;
  const metricByNodeId = new Map();
  const diameter = getSizeModeConfig(nodeSizeMode).diameter;

  if (nodeSizeMode === "fixed") {
    return {
      mode: nodeSizeMode,
      defaultWidth,
      height,
      metricByNodeId,
      diameter,
    };
  }

  for (const node of nodes) {
    if (!isScalableLadderNode(node.attrs || {}, node.id)) continue;
    const metric = extractNodeMetricFromLabel(node.attrs?.label);
    if (!Number.isFinite(metric)) continue;
    metricByNodeId.set(node.id, metric);
  }

  return {
    mode: nodeSizeMode,
    defaultWidth,
    height,
    metricByNodeId,
    diameter,
  };
}

function getNodeEllipseWidth(node, sizeContext) {
  const metric = sizeContext.metricByNodeId.get(node.id);
  if (!Number.isFinite(metric) || sizeContext.mode === "fixed") {
    return sizeContext.defaultWidth;
  }

  const diameter = sizeContext.diameter(metric);
  if (!Number.isFinite(diameter)) {
    return sizeContext.defaultWidth;
  }
  return Math.max(sizeContext.height + 0.14, diameter);
}

function buildRenderableNodeAttrs(node, options, sizeContext) {
  const { renderProfile, nodeTextMode } = options;
  const compact = renderProfile === "overview";
  const attrs = stripLayoutAttrs(node.attrs || {});
  const dotLabel = normalizeDisplayLabel(attrs.label || node.id);
  const targetNode = isTargetNode(attrs, node.id);
  const splitLabelNode = isExternalLabelEllipseNode(attrs, node.id);
  const scalableGreyEllipse = isScalableLadderNode(attrs, node.id);

  attrs.fontname = attrs.fontname || FONT_FAMILY;

  if (targetNode) {
    attrs.shape = "circle";
    attrs.style = ensureFilledStyle(attrs.style);
    attrs.fillcolor = attrs.fillcolor || "#ffffff";
    attrs.color = attrs.color || "#b7b7b7";
    attrs.fixedsize = "true";
    attrs.width = compact ? "0.20" : "0.30";
    attrs.height = compact ? "0.20" : "0.30";
    attrs.margin = "0.01,0.01";
    attrs.fontsize = "1";
    attrs.label = " ";
    delete attrs.xlabel;
    return attrs;
  }

  if (splitLabelNode) {
    attrs.shape = "ellipse";
    attrs.style = ensureFilledStyle(attrs.style);
    attrs.fillcolor = attrs.fillcolor || "#ffffff";
    attrs.color = attrs.color || "#9aa1a8";
    attrs.fixedsize = "true";
    attrs.width = `${getNodeEllipseWidth(node, sizeContext).toFixed(3)}`;
    attrs.height = `${sizeContext.height.toFixed(3)}`;
    attrs.margin = "0.01,0.01";
    attrs.fontsize = "1";
    attrs.label = compact ? " " : " ";
    delete attrs.xlabel;
    return attrs;
  }

  if (scalableGreyEllipse) {
    attrs.shape = "ellipse";
    attrs.style = ensureFilledStyle(attrs.style);
    attrs.fixedsize = "true";
    const width = getNodeEllipseWidth(node, sizeContext);
    const height = compact
      ? Math.max(0.18, (0.28 / 0.98) * width)
      : Math.max(0.26, (0.52 / 0.98) * width);
    attrs.width = `${width.toFixed(3)}`;
    attrs.height = `${height.toFixed(3)}`;
    attrs.fontsize = "1";
    attrs.label = " ";
    delete attrs.xlabel;
    return attrs;
  }

  if (compact) {
    attrs.label = "";
    attrs.fontsize = attrs.fontsize || "9";
    return attrs;
  }

  attrs.label = nodeTextMode === "id" ? String(node.id) : dotLabel;
  attrs.fontsize = attrs.fontsize || "12";
  return attrs;
}

function buildRenderableEdgeAttrs(edge, renderProfile) {
  const attrs = stripLayoutAttrs(edge.attrs || {});
  const compact = renderProfile === "overview";

  attrs.fontname = attrs.fontname || FONT_FAMILY;
  if (compact) {
    delete attrs.label;
    attrs.penwidth = String(Math.max(0.8, Number(attrs.penwidth || 1)));
  }

  return attrs;
}

export function serializeGraphToDot(parsed, options) {
  const { renderProfile, layoutMode, nodeTextMode, nodeSizeMode } = options;
  const layoutSpec = getLayoutSpec(layoutMode, renderProfile);
  const compact = renderProfile === "overview";
  const sizeContext = buildNodeSizeContext(parsed.nodes, renderProfile, nodeSizeMode);

  const graphAttrs = {
    bgcolor: "transparent",
    overlap: "false",
    ...stripLayoutAttrs(parsed.graphAttrs || {}),
    ...layoutSpec.graphAttrs,
  };

  if (compact) {
    graphAttrs.concentrate = "true";
  }

  const lines = ["digraph Laddergraph {"];

  for (const [key, value] of Object.entries(graphAttrs)) {
    if (value == null || value === "") continue;
    lines.push(`  ${key}=${quoteDotValue(value)};`);
  }

  lines.push(
    `  node [fontname=${quoteDotValue(FONT_FAMILY)}, margin=${quoteDotValue(
      compact ? "0.04,0.02" : "0.12,0.06",
    )}];`,
  );
  lines.push(`  edge [fontname=${quoteDotValue(FONT_FAMILY)}];`);

  for (const node of parsed.nodes) {
    lines.push(
      `  ${quoteDotId(node.id)}${serializeAttrs(
        buildRenderableNodeAttrs(node, { renderProfile, nodeTextMode }, sizeContext),
      )};`,
    );
  }

  for (const edge of parsed.edges) {
    lines.push(
      `  ${quoteDotId(edge.from)} -> ${quoteDotId(edge.to)}${serializeAttrs(
        buildRenderableEdgeAttrs(edge, renderProfile),
      )};`,
    );
  }

  lines.push("}");
  return {
    dot: lines.join("\n"),
    engine: layoutSpec.engine,
  };
}

export function hexToRgb(hex) {
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
  const toLinear = (value) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function readableTextColor(bgHex) {
  const luminance = relativeLuminance(bgHex);
  const contrastWhite = (1 + 0.05) / (luminance + 0.05);
  const contrastBlack = (luminance + 0.05) / 0.05;
  return contrastBlack >= contrastWhite ? "#111111" : "#ffffff";
}

function rgbToHex(r, g, b) {
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixWithWhite(baseHex, ratio) {
  const t = Math.max(0, Math.min(1, ratio));
  const color = hexToRgb(baseHex);
  return rgbToHex(
    color.r + (255 - color.r) * t,
    color.g + (255 - color.g) * t,
    color.b + (255 - color.b) * t,
  );
}

export function layeredGradientColor(baseHex, distance, maxDistance) {
  if (distance <= 1 || maxDistance <= 1) return baseHex;
  const ratio = (distance - 1) / (maxDistance - 1);
  const mixRatio = 0.18 + 0.6 * ratio;
  return mixWithWhite(baseHex, mixRatio);
}
