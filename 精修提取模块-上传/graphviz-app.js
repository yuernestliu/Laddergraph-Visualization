import {
  DEFAULT_DOT_PATH,
  LARGE_GRAPH_EDGE_THRESHOLD,
  LARGE_GRAPH_NODE_THRESHOLD,
  NODE_SIZE_MODE_OPTIONS,
  applyVisibleSubgraphFilters,
  buildNodeLayerMap,
  formatNodeSizeModeLabel,
  getEffectiveLayoutMode,
  getEffectiveRenderProfile,
  parseDot,
  sanitizeParsedGraph,
  serializeGraphToDot,
  summarizeGraph,
} from "./graphviz-core.js";
import { GraphvizSvgRenderer } from "./graphviz-svg-renderer.js";
import {
  DEFAULT_MIN_COMPONENT_SIZE,
  MAX_INLINE_COMPONENT_TABS,
  buildDisplayComponentState,
  clampMinComponentSize,
  getSubgraphForDisplayComponent,
} from "./app/display-components.js";
import { buildNodeDetailIndex, getNodeDetail } from "./app/csv-node-details.js";
import { createEditModeController } from "./app/edit-mode.js";
import { GraphTabStateStore } from "./app/graph-tab-state-store.js";
import { clampLayerDepth, getLayerDepthLabel, getSuggestedLayerDepth, getTrimmedLayerCount } from "./app/layer-utils.js";
import { createRefineModeController } from "./app/refine-mode/refine-controller.js";
import {
  renderGraphTabs as renderGraphTabsUi,
  setStatus as setStatusUi,
  updateLayerDepthControls as updateLayerDepthControlsUi,
  updateMinComponentSizeControl,
  updateNodeDetailPanel,
  updateNodeSizeModeInfo as updateNodeSizeModeInfoUi,
  updateNodeTextModeInfo as updateNodeTextModeInfoUi,
  updateRenderModeInfo as updateRenderModeInfoUi,
} from "./app/ui.js";

const RENDER_API_PATH = "/api/render";
const DEFAULT_NODE_SIZE_MODE = "sqrt";
const AUTO_LAYER_NODE_THRESHOLD = 180;
const AUTO_LAYER_EDGE_THRESHOLD = 320;
const NODE_TEXT_MODES = ["label", "id", "none"];

const fileInput = document.getElementById("fileInput");
const renderBtn = document.getElementById("renderBtn");
const appRoot = document.getElementById("appRoot");
const statusEl = document.getElementById("status");
const layoutSelect = document.getElementById("layoutSelect");
const applyLayoutBtn = document.getElementById("applyLayoutBtn");
const graphTabsEl = document.getElementById("graphTabs");
const graphComponentSelect = document.getElementById("graphComponentSelect");
const graphTabsInfo = document.getElementById("graphTabsInfo");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const fitViewBtn = document.getElementById("fitViewBtn");
const renderModeSelect = document.getElementById("renderModeSelect");
const renderModeInfo = document.getElementById("renderModeInfo");
const toggleNodeTextBtn = document.getElementById("toggleNodeTextBtn");
const nodeTextModeInfo = document.getElementById("nodeTextModeInfo");
const nodeSizeModeSelect = document.getElementById("nodeSizeModeSelect");
const nodeSizeModeInfo = document.getElementById("nodeSizeModeInfo");
const editModeBtn = document.getElementById("editModeBtn");
const refineModeBtn = document.getElementById("refineModeBtn");
const minComponentSizeInput = document.getElementById("minComponentSizeInput");
const minComponentSizeDownBtn = document.getElementById("minComponentSizeDownBtn");
const minComponentSizeUpBtn = document.getElementById("minComponentSizeUpBtn");
const minComponentSizeInfo = document.getElementById("minComponentSizeInfo");
const minComponentSizeQuickBtns = Array.from(document.querySelectorAll("[data-min-component-size]"));
const layerDepthDownBtn = document.getElementById("layerDepthDownBtn");
const layerDepthUpBtn = document.getElementById("layerDepthUpBtn");
const layerDepthAutoBtn = document.getElementById("layerDepthAutoBtn");
const layerDepthAllBtn = document.getElementById("layerDepthAllBtn");
const layerDepthInfo = document.getElementById("layerDepthInfo");
const nodeDetailTitle = document.getElementById("nodeDetailTitle");
const nodeDetailMeta = document.getElementById("nodeDetailMeta");
const nodeDetailBody = document.getElementById("nodeDetailBody");
const networkShell = document.getElementById("networkShell");
const networkEl = document.getElementById("network");

let refineModeController = null;
const renderer = new GraphvizSvgRenderer(networkEl, {
  onSelectionChange: (nodeId) => {
    if (refineModeController?.handleNodeSelection(nodeId)) {
      updateExtractionVisuals();
      return;
    }
    updateSelectedNodeDetail(nodeId);
    refineModeController?.setSelectedNode(nodeId);
  },
});
const tabStateStore = new GraphTabStateStore();
export const editModeController = createEditModeController({
  rootEl: networkShell,
  toggleButton: editModeBtn,
  disabledRoot: appRoot,
  onChange: ({ enabled }) => {
    if (enabled) refineModeController?.setEnabled(false);
  },
});
editModeController.mount();

refineModeController = createRefineModeController({
  rootEl: networkShell,
  toggleButton: refineModeBtn,
  disabledRoot: appRoot,
  onChange: ({ enabled }) => {
    if (enabled) editModeController.setEnabled(false);
  },
  onProjectionChange: ({ reason }) => handleRefineProjectionChange(reason),
  onExtractionAction: (action) => handleExtractionAction(action),
  onExtractionChange: (payload) => handleExtractionChange(payload),
});
refineModeController.mount();

if (nodeSizeModeSelect) {
  nodeSizeModeSelect.value = DEFAULT_NODE_SIZE_MODE;
}

if (minComponentSizeInput) {
  minComponentSizeInput.value = String(DEFAULT_MIN_COMPONENT_SIZE);
}

let sourceParsedGraph = null;
let currentDotText = "";
let currentGraphStats = null;
let currentDisplayComponentState = null;
let currentDisplayGraph = null;
let currentGraphTabs = [];
let activeGraphTabId = null;
let currentRenderProfile = "full";
let currentEffectiveLayoutMode = "hierarchicalTB";
let nodeTextMode = "label";
let nodeSizeMode = DEFAULT_NODE_SIZE_MODE;
let minComponentSize = DEFAULT_MIN_COMPONENT_SIZE;
let minComponentSizeMax = DEFAULT_MIN_COMPONENT_SIZE;
let layerDepthIsAuto = true;
let currentSubgraph = null;
let currentTabBaseSubgraph = null;
let currentLayerMeta = null;
let currentLayerDepth = 0;
let currentLayerMaxDepth = 0;
let currentAutoLayerDepth = 0;
let currentRenderedLayerDepth = 0;
let currentRenderedSubgraph = null;
let currentRenderToken = 0;
let currentRenderAbortController = null;
let currentNodeDetailIndex = null;
let currentNodeDetailSource = "";
let currentNodeDetailStatus = "点击图中的节点查看 CSV 详情。";
let selectedNodeId = null;
let extractionTabs = [];

function setStatus(message, isError = false) {
  setStatusUi(statusEl, message, isError);
}

function getRequestedLayoutMode() {
  return layoutSelect?.value || "hierarchicalTB";
}

function getRequestedRenderMode() {
  return renderModeSelect?.value || "full";
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

function getCurrentViewKey() {
  return buildViewKey(currentLayerDepth);
}

function buildViewKey(layerDepth = currentLayerDepth) {
  return [
    currentEffectiveLayoutMode,
    currentRenderProfile,
    nodeTextMode,
    nodeSizeMode,
    getRefineProjectionSignature(),
    layerDepth <= 0 ? "depth:all" : `depth:-${layerDepth}`,
  ].join("|");
}

function buildRenderKey(renderedDepth = currentRenderedLayerDepth) {
  return [
    currentEffectiveLayoutMode,
    currentRenderProfile,
    nodeTextMode,
    nodeSizeMode,
    getRefineProjectionSignature(),
    renderedDepth <= 0 ? "render:all" : `render:-${renderedDepth}`,
  ].join("|");
}

function getNextNodeTextMode(mode) {
  const currentIndex = NODE_TEXT_MODES.indexOf(mode);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  return NODE_TEXT_MODES[(safeIndex + 1) % NODE_TEXT_MODES.length];
}

function clearGraph() {
  sourceParsedGraph = null;
  currentGraphStats = null;
  currentDisplayComponentState = null;
  currentDisplayGraph = null;
  currentGraphTabs = [];
  activeGraphTabId = null;
  currentRenderProfile = "full";
  currentEffectiveLayoutMode = "hierarchicalTB";
  currentSubgraph = null;
  currentTabBaseSubgraph = null;
  currentLayerMeta = null;
  currentLayerDepth = 0;
  currentLayerMaxDepth = 0;
  currentAutoLayerDepth = 0;
  currentRenderedLayerDepth = 0;
  currentRenderedSubgraph = null;
  minComponentSize = DEFAULT_MIN_COMPONENT_SIZE;
  minComponentSizeMax = DEFAULT_MIN_COMPONENT_SIZE;
  layerDepthIsAuto = true;
  currentNodeDetailIndex = null;
  currentNodeDetailSource = "";
  currentNodeDetailStatus = "点击图中的节点查看 CSV 详情。";
  selectedNodeId = null;
  extractionTabs = [];
  tabStateStore.reset();
  refineModeController?.clear();
  renderer.clear();
  updateMinComponentSizeInfo();
  updateSelectedNodeDetail(null);
  updateExtractionToolbarState();
}

function updateRenderModeInfo() {
  updateRenderModeInfoUi(renderModeInfo, {
    currentGraphStats,
    currentRenderProfile,
    requestedRenderMode: getRequestedRenderMode(),
    currentEffectiveLayoutMode,
    requestedLayoutMode: getRequestedLayoutMode(),
    largeGraphNodeThreshold: LARGE_GRAPH_NODE_THRESHOLD,
    largeGraphEdgeThreshold: LARGE_GRAPH_EDGE_THRESHOLD,
  });
}

function updateNodeTextModeInfo() {
  updateNodeTextModeInfoUi(nodeTextModeInfo, toggleNodeTextBtn, {
    currentRenderProfile,
    nodeTextMode,
  });
}

function updateNodeSizeModeInfo() {
  updateNodeSizeModeInfoUi(nodeSizeModeInfo, nodeSizeMode, formatNodeSizeModeLabel);
}

function updateMinComponentSizeInfo() {
  updateMinComponentSizeControl(
    {
      minComponentSizeInput,
      minComponentSizeDownBtn,
      minComponentSizeUpBtn,
      minComponentSizeInfo,
      minComponentSizeQuickBtns,
    },
    {
      enabled: Boolean(sourceParsedGraph),
      minComponentSize,
      minComponentSizeMin: DEFAULT_MIN_COMPONENT_SIZE,
      minComponentSizeMax,
      displayComponentCount: currentGraphTabs.length,
      eligibleComponentCount: currentDisplayComponentState?.eligibleComponents?.length || 0,
      isolatedCount: currentDisplayComponentState?.isolatedCount || 0,
    },
  );
}

function updateSelectedNodeDetail(nodeId = selectedNodeId) {
  selectedNodeId = nodeId || null;
  const detail = selectedNodeId ? getNodeDetail(currentNodeDetailIndex, selectedNodeId) : null;
  const hasDetailCsv = Boolean(currentNodeDetailIndex);

  updateNodeDetailPanel(
    {
      nodeDetailTitle,
      nodeDetailMeta,
      nodeDetailBody,
    },
    {
      nodeId: selectedNodeId,
      detail,
      csvStatus: currentNodeDetailStatus,
      emptyMessage: currentNodeDetailStatus || "点击图中的节点查看 CSV 详情。",
      missingMessage: hasDetailCsv
        ? `CSV 中没有找到 ID ${selectedNodeId}。`
        : currentNodeDetailStatus,
    },
  );
}

function closeExtractionTab(tab) {
  extractionTabs = extractionTabs.filter((t) => t.id !== tab.id);
  currentGraphTabs = currentGraphTabs.filter((t) => t.id !== tab.id);
  if (activeGraphTabId === tab.id) {
    ensureActiveGraphTab();
    if (getActiveGraphTab()) {
      renderActiveGraph();
    } else {
      renderer.clear();
      renderGraphTabs();
    }
  } else {
    renderGraphTabs();
  }
}

function expandMiniNode(nodeId) {
  if (!sourceParsedGraph || !currentRenderedSubgraph) return;
  const activeTab = getActiveGraphTab();
  if (!activeTab?.extractionMeta) return;
  const meta = activeTab.extractionMeta;

  const extractedSet = new Set(Array.from(meta.extractedIds, (id) => String(id)));
  if (extractedSet.has(String(nodeId))) return; // already extracted

  // Save current state for undo
  meta.undoStack.push({
    extractedIds: Array.from(extractedSet, (id) => String(id)),
    graph: { nodes: meta.graph.nodes, edges: meta.graph.edges },
  });
  meta.redoStack = [];

  // Add clicked mini node to extracted set
  extractedSet.add(String(nodeId));

  // Find its direct neighbors in the working graph
  const workingEdges = meta.workingEdges || currentRenderedSubgraph.edges;
  for (const edge of workingEdges) {
    if (String(edge.from) === String(nodeId)) extractedSet.add(String(edge.to));
    if (String(edge.to) === String(nodeId)) extractedSet.add(String(edge.from));
  }

  renderExtractionState(activeTab, meta, extractedSet);
}

function renderExtractionState(activeTab, meta, extractedIds) {
  const extractedSet = new Set(Array.from(extractedIds, (id) => String(id)));
  const workingNodes = meta.workingNodes || currentRenderedSubgraph.nodes;
  const workingEdges = meta.workingEdges || currentRenderedSubgraph.edges;
  const miniGraph = buildExtractedViewGraph(workingNodes, workingEdges, extractedIds);
  meta.graph = miniGraph;
  meta.extractedIds = Array.from(extractedIds, (id) => String(id));
  currentRenderedSubgraph = miniGraph;
  currentTabBaseSubgraph = miniGraph;
  currentSubgraph = miniGraph;

  const { dot, engine } = serializeGraphToDot(miniGraph, {
    renderProfile: currentRenderProfile,
    layoutMode: currentEffectiveLayoutMode,
    nodeTextMode,
    nodeSizeMode,
    sizeSourceNodes: miniGraph.nodes,
  });

  (async () => {
    renderer.setLoading(true);
    try {
      const svgMarkup = await requestSvgRender(dot, engine);
      tabStateStore.setRenderCache(activeTab.id, buildRenderKey(currentRenderedLayerDepth), { svgMarkup });
      renderer.render({ svgMarkup, parsed: miniGraph, overview: false, nodeTextMode });

      const miniIds = miniGraph.nodes.map((n) => String(n.id)).filter((id) => !extractedSet.has(id));
      if (miniIds.length) {
        renderer.applyMiniNodes(miniIds, 0.18);
        renderer.shortenMiniEdges(miniIds, extractedSet);
      }
      const hideEdgeIds = new Set(
        miniGraph.edges
          .filter((edge) => !extractedSet.has(String(edge.from)) && !extractedSet.has(String(edge.to)))
          .map((edge) => `${String(edge.from)}->${String(edge.to)}`),
      );
      if (hideEdgeIds.size) renderer.hideEdges(hideEdgeIds);
      renderer.onMiniNodeClick = (id) => expandMiniNode(id);
      renderer.fitToView();
      setStatus("");
      refineModeController?.updateExtractionToolbar(meta);
    } catch (error) {
      setStatus(`渲染失败：${error.message}`, true);
      console.error(error);
    } finally {
      renderer.setLoading(false);
    }
  })();
}

function undoExpand() {
  const activeTab = getActiveGraphTab();
  if (!activeTab?.extractionMeta?.undoStack?.length) return;
  const meta = activeTab.extractionMeta;
  meta.redoStack.push({
    extractedIds: Array.from(meta.extractedIds, (id) => String(id)),
    graph: { nodes: meta.graph.nodes, edges: meta.graph.edges },
  });
  const prev = meta.undoStack.pop();
  renderExtractionState(activeTab, meta, prev.extractedIds);
}

function redoExpand() {
  const activeTab = getActiveGraphTab();
  if (!activeTab?.extractionMeta?.redoStack?.length) return;
  const meta = activeTab.extractionMeta;
  meta.undoStack.push({
    extractedIds: Array.from(meta.extractedIds, (id) => String(id)),
    graph: { nodes: meta.graph.nodes, edges: meta.graph.edges },
  });
  const next = meta.redoStack.pop();
  renderExtractionState(activeTab, meta, next.extractedIds);
}

function getUpstreamNodes(centerId, levels, graph) {
  const result = new Set([String(centerId)]);
  const queue = [{ id: String(centerId), level: 0 }];
  const visited = new Map([[String(centerId), 0]]);
  while (queue.length) {
    const { id, level } = queue.shift();
    if (level >= levels) continue;
    for (const edge of graph.edges) {
      if (String(edge.to) === id && !visited.has(String(edge.from))) {
        const fromId = String(edge.from);
        visited.set(fromId, level + 1);
        result.add(fromId);
        queue.push({ id: fromId, level: level + 1 });
      }
    }
  }
  return result;
}

function getDownstreamNodes(centerId, levels, graph) {
  const result = new Set([String(centerId)]);
  const queue = [{ id: String(centerId), level: 0 }];
  const visited = new Map([[String(centerId), 0]]);
  while (queue.length) {
    const { id, level } = queue.shift();
    if (level >= levels) continue;
    for (const edge of graph.edges) {
      if (String(edge.from) === id && !visited.has(String(edge.to))) {
        const toId = String(edge.to);
        visited.set(toId, level + 1);
        result.add(toId);
        queue.push({ id: toId, level: level + 1 });
      }
    }
  }
  return result;
}

function buildExtractedViewGraph(visibleNodes, visibleEdges, extractedIds, miniIds) {
  const extractedSet = new Set(Array.from(extractedIds, (id) => String(id)));
  const miniSet = miniIds
    ? new Set(Array.from(miniIds, (id) => String(id)))
    : new Set(visibleNodes.map((node) => String(node.id)).filter((id) => !extractedSet.has(id)));
  const nodes = visibleNodes.map((node) => {
    const id = String(node.id);
    const attrs = { ...(node.attrs || {}) };
    if (miniSet.has(id)) {
      attrs.shape = "circle";
      attrs.style = "filled";
      attrs.fixedsize = "true";
      attrs.width = "0.12";
      attrs.height = "0.12";
      attrs.margin = "0.01,0.01";
      attrs.fontsize = "1";
      attrs.label = " ";
      attrs.fillcolor = "#d0d0d0";
      attrs.color = "#b7b7b7";
    }
    return { ...node, attrs };
  });

  const edges = visibleEdges
    .filter(
      (edge) => extractedSet.has(String(edge.from)) || extractedSet.has(String(edge.to)),
    )
    .map((edge) => {
      const fromMini = miniSet.has(String(edge.from));
      const toMini = miniSet.has(String(edge.to));
      if (fromMini || toMini) {
        return { ...edge, attrs: { ...(edge.attrs || {}), arrowhead: "none" } };
      }
      return edge;
    });

  // Remove isolated mini nodes (not connected to any edge)
  const nodesInEdges = new Set();
  for (const edge of edges) {
    nodesInEdges.add(String(edge.from));
    nodesInEdges.add(String(edge.to));
  }
  const filteredNodes = nodes.filter(
    (n) => extractedSet.has(String(n.id)) || nodesInEdges.has(String(n.id)),
  );

  return {
    graphAttrs: sourceParsedGraph?.graphAttrs || currentRenderedSubgraph?.graphAttrs || {},
    nodes: filteredNodes,
    edges,
  };
}

function getGraphBaseName(sourceName) {
  const filename = String(sourceName || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || "";
  return filename.replace(/\.(gv|dot|txt)$/i, "");
}

function getCsvCandidatesForGraph(sourceName) {
  const baseName = getGraphBaseName(sourceName);
  if (!baseName) return [];

  const candidates = [];
  const sourcePath = String(sourceName || "");
  const directory = sourcePath.includes("/")
    ? sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1)
    : "";

  if (directory) {
    candidates.push(`${directory}${baseName}.csv`);
  }
  candidates.push(`./graphs/${baseName}.csv`);
  candidates.push(`./${baseName}.csv`);

  return Array.from(new Set(candidates));
}

async function loadNodeDetailsForGraph(sourceName) {
  currentNodeDetailIndex = null;
  currentNodeDetailSource = "";
  currentNodeDetailStatus = "正在查找同名 CSV...";
  updateSelectedNodeDetail(null);

  for (const candidate of getCsvCandidatesForGraph(sourceName)) {
    try {
      const response = await fetch(encodeURI(candidate), { cache: "no-store" });
      if (!response.ok) continue;

      const csvText = await response.text();
      currentNodeDetailIndex = buildNodeDetailIndex(csvText);
      currentNodeDetailSource = candidate;
      currentNodeDetailStatus =
        `已加载 ${candidate}；${currentNodeDetailIndex.entriesById.size} 条详情。`;
      updateSelectedNodeDetail(selectedNodeId);
      return;
    } catch (error) {
      console.warn(`Failed to load CSV details from ${candidate}:`, error);
    }
  }

  currentNodeDetailStatus = "没有找到同名 CSV。";
  updateSelectedNodeDetail(selectedNodeId);
}

function getMinComponentThreshold() {
  return Math.max(0, minComponentSize - 1);
}

function normalizeMinComponentSize(value) {
  const parsed = Number.parseInt(value, 10);
  return Math.max(DEFAULT_MIN_COMPONENT_SIZE, Number.isFinite(parsed) ? parsed : DEFAULT_MIN_COMPONENT_SIZE);
}

function normalizeExtractionLevel(value) {
  const parsed = Number.parseInt(value, 10);
  return Math.max(0, Number.isFinite(parsed) ? parsed : 0);
}

function refreshLayerState({ resetDepth = false } = {}) {
  if (!sourceParsedGraph) {
    currentLayerMeta = null;
    currentLayerDepth = 0;
    currentLayerMaxDepth = 0;
    currentAutoLayerDepth = 0;
    return;
  }

  currentLayerMeta = buildNodeLayerMap(sourceParsedGraph);
  currentLayerMaxDepth = currentLayerMeta.maxDepth;
  currentAutoLayerDepth = getSuggestedLayerDepth(
    sourceParsedGraph,
    currentLayerMeta,
    getMinComponentThreshold(),
    AUTO_LAYER_NODE_THRESHOLD,
    AUTO_LAYER_EDGE_THRESHOLD,
  );

  if (resetDepth || layerDepthIsAuto) {
    currentLayerDepth = currentAutoLayerDepth;
    return;
  }

  currentLayerDepth = clampLayerDepth(currentLayerDepth, currentLayerMaxDepth);
}

function rebuildDisplayComponents({ preserveActive = true } = {}) {
  if (!sourceParsedGraph) {
    currentDisplayGraph = null;
    currentDisplayComponentState = null;
    currentGraphTabs = [];
    activeGraphTabId = null;
    return;
  }

  currentDisplayGraph = applyVisibleSubgraphFilters(
    sourceParsedGraph,
    currentLayerDepth,
    currentLayerMeta,
    0,
  );
  currentDisplayComponentState = buildDisplayComponentState(currentDisplayGraph, { minComponentSize });
  minComponentSize = currentDisplayComponentState.minComponentSize;
  minComponentSizeMax = currentDisplayComponentState.minComponentSizeMax;
  currentGraphTabs = currentDisplayComponentState.displayComponents;

  // Preserve extraction tabs
  for (const extTab of extractionTabs) {
    currentGraphTabs.push(extTab);
  }

  const previousActiveGraphTabId = preserveActive ? activeGraphTabId : null;
  activeGraphTabId = currentGraphTabs.some((tab) => tab.id === previousActiveGraphTabId)
    ? previousActiveGraphTabId
    : currentGraphTabs[0]?.id || null;
}

function getMinComponentSizeInputValue() {
  return Number.parseInt(minComponentSizeInput?.value || "", 10);
}

function applyMinComponentSize(nextSize) {
  const previousViewKey = getCurrentViewKey();
  captureCurrentTabViewState(previousViewKey);
  minComponentSize = normalizeMinComponentSize(nextSize);

  if (sourceParsedGraph) {
    refreshLayerState();
    rebuildDisplayComponents({ preserveActive: true });
  }

  updateMinComponentSizeInfo();
  updateExtractionToolbarState();
  if (!sourceParsedGraph) return;
  renderActiveGraph("已切换最小网络规模");
}

function stepMinComponentSize(delta) {
  applyMinComponentSize(minComponentSize + delta);
}

function applyLayerDepth(nextDepth, { auto = false, status = "" } = {}) {
  if (!sourceParsedGraph) return;
  captureCurrentTabViewState();
  layerDepthIsAuto = auto;
  currentLayerDepth = auto
    ? currentAutoLayerDepth
    : clampLayerDepth(nextDepth, currentLayerMaxDepth);
  rebuildDisplayComponents({ preserveActive: true });
  updateMinComponentSizeInfo();
  updateExtractionToolbarState();
  renderActiveGraph(status);
}

function updateLayerDepthControls() {
  updateLayerDepthControlsUi(
    {
      layerDepthDownBtn,
      layerDepthUpBtn,
      layerDepthAutoBtn,
      layerDepthAllBtn,
      layerDepthInfo,
    },
    {
      hasGraph: Boolean(sourceParsedGraph && currentTabBaseSubgraph),
      currentLayerDepth,
      currentLayerMaxDepth,
      currentAutoLayerDepth,
      getLayerDepthLabel,
    },
  );
}

function captureCurrentTabViewState(viewKey = getCurrentViewKey()) {
  const activeTab = getActiveGraphTab();
  if (!activeTab || !renderer.hasGraph()) return;
  tabStateStore.setViewState(activeTab.id, viewKey, renderer.getViewState(viewKey));
}

function renderGraphTabs() {
  renderGraphTabsUi({
    tabsEl: graphTabsEl,
    componentSelectEl: graphComponentSelect,
    graphTabsInfo,
    currentGraphTabs,
    activeGraphTabId,
    currentTabBaseSubgraph,
    currentSubgraph,
    currentLayerMaxDepth,
    currentLayerDepth,
    sourceParsedGraph,
    summarizeGraph,
    getTrimmedLayerCount,
    maxInlineTabs: MAX_INLINE_COMPONENT_TABS,
    onSelectTab: (tab) => {
      if (tab.id === activeGraphTabId) return;
      captureCurrentTabViewState();
      activeGraphTabId = tab.id;
      renderActiveGraph(`已切换到 ${tab.label}`);
    },
    onTabClose: (tab) => closeExtractionTab(tab),
  });
}

function handleRefineProjectionChange(reason = "") {
  if (!sourceParsedGraph) return;
  captureCurrentTabViewState();
  renderActiveGraph(reason ? `已应用精修：${reason}` : "已应用精修");
}

function handleExtractionAction(action) {
  if (action === "undo") {
    undoExpand();
    return;
  }
  if (action === "redo") {
    redoExpand();
  }
}

function handleExtractionChange(payload) {
  const { action, enabled, selectedIds, upLevel, downLevel } = payload || {};
  if (!enabled) {
    renderer.setSelectionEnabled(true);
    renderer.applySelectionHighlight(selectedNodeId || null);
    clearExtractionVisuals();
    return;
  }

  renderer.setSelectionEnabled(false);
  renderer.applySelectionHighlight(null);
  updateExtractionVisuals();

  if (action !== "finish") return;

  const hasGraph = Boolean(sourceParsedGraph && currentRenderedSubgraph);
  if (!hasGraph || !selectedIds?.length) return;

  const visibleNodes = currentRenderedSubgraph.nodes;
  const visibleEdges = currentRenderedSubgraph.edges;
  if (!visibleNodes.length) return;

  const extractedIds = new Set();
  const safeUpLevel = normalizeExtractionLevel(upLevel);
  const safeDownLevel = normalizeExtractionLevel(downLevel);
  for (const id of selectedIds) {
    const upNodes = getUpstreamNodes(id, safeUpLevel, currentRenderedSubgraph);
    const downNodes = getDownstreamNodes(id, safeDownLevel, currentRenderedSubgraph);
    extractedIds.add(String(id));
    for (const n of upNodes) extractedIds.add(String(n));
    for (const n of downNodes) extractedIds.add(String(n));
  }

  const miniGraph = buildExtractedViewGraph(visibleNodes, visibleEdges, extractedIds);
  const nodeList = Array.from(selectedIds);
  const tabLabel = nodeList.length <= 3
    ? `${nodeList.join(",")}`
    : `${nodeList.slice(0, 3).join(",")}... +${nodeList.length - 3}`;
  const tabId = `extraction-${Date.now()}`;
  const tab = {
    id: tabId,
    label: tabLabel,
    nodeIds: miniGraph.nodes.map((n) => String(n.id)),
    nodeSet: new Set(miniGraph.nodes.map((n) => String(n.id))),
    stats: { nodeCount: miniGraph.nodes.length, edgeCount: miniGraph.edges.length },
    ordinal: currentGraphTabs.length + 1,
    extractionMeta: {
      graph: miniGraph,
      extractedIds: Array.from(extractedIds, (id) => String(id)),
      workingNodes: visibleNodes,
      workingEdges: visibleEdges,
      undoStack: [],
      redoStack: [],
    },
  };

  extractionTabs.push(tab);
  currentGraphTabs.push(tab);
  activeGraphTabId = tabId;
  refineModeController?.exitExtractionTool();
  renderActiveGraph(`已创建提取视图 · ${selectedIds.length}个节点`);
}

function updateExtractionToolbarState() {
  refineModeController?.updateExtractionToolbar(getActiveGraphTab()?.extractionMeta || null);
}

function updateExtractionContext() {
  const hasGraph = Boolean(sourceParsedGraph && currentRenderedSubgraph);
  refineModeController?.updateExtractionContext({ hasGraph });
}

function updateExtractionVisuals() {
  const selectedIds = refineModeController?.getExtractionSelectedIds();
  const selectedSet = selectedIds ? new Set(selectedIds) : new Set();
  for (const [nodeId, entry] of renderer.nodeEntries) {
    entry.group.classList.toggle(
      "is-extraction-selected",
      selectedSet.has(String(nodeId)),
    );
  }
}

function clearExtractionVisuals() {
  document.querySelectorAll(".graphviz-svg g.node.is-extraction-selected").forEach((g) => {
    g.classList.remove("is-extraction-selected");
  });
}



async function requestSvgRender(dot, engine) {
  if (currentRenderAbortController) {
    currentRenderAbortController.abort();
  }

  currentRenderAbortController = new AbortController();
  const response = await fetch(RENDER_API_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dot, engine }),
    cache: "no-store",
    signal: currentRenderAbortController.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(async () => ({
      error: await response.text(),
    }));
    const details = payload.details ? ` ${payload.details}` : "";
    throw new Error(`${payload.error || `HTTP ${response.status}`}${details}`.trim());
  }

  return response.text();
}

function primeRenderableComponent(activeTab) {
  currentTabBaseSubgraph = getSubgraphForDisplayComponent(currentDisplayGraph, activeTab);
  currentRenderedLayerDepth = currentLayerDepth;
  currentRenderedSubgraph = refineModeController?.projectGraph(currentTabBaseSubgraph) || currentTabBaseSubgraph;
  currentSubgraph = currentRenderedSubgraph;
}

function getRefineProjectionSignature() {
  return refineModeController?.getProjectionSignature() || "refine:none";
}

async function renderActiveGraph(statusPrefix = "") {
  ensureActiveGraphTab();
  const activeTab = getActiveGraphTab();

  if (!sourceParsedGraph || !activeTab) {
    renderer.clear();
    currentTabBaseSubgraph = null;
    currentSubgraph = null;
    currentRenderedSubgraph = null;
    updateRenderModeInfo();
    updateLayerDepthControls();
    renderGraphTabs();
    updateExtractionToolbarState();
    setStatus(
      sourceParsedGraph ? "当前过滤后没有可显示的网络。" : "当前没有可渲染的子图。",
      false,
    );
    return;
  }

  if (activeTab.extractionMeta) {
    // Extraction tab: use pre-built graph with mini dimensions
    currentTabBaseSubgraph = activeTab.extractionMeta.graph;
    currentRenderedSubgraph = currentTabBaseSubgraph;
    currentSubgraph = currentTabBaseSubgraph;
    currentRenderedLayerDepth = currentLayerDepth;
  } else {
    primeRenderableComponent(activeTab);
  }

  currentGraphStats = summarizeGraph(currentRenderedSubgraph);
  currentRenderProfile = getEffectiveRenderProfile(currentGraphStats, getRequestedRenderMode());
  currentEffectiveLayoutMode = getEffectiveLayoutMode(getRequestedLayoutMode(), currentRenderProfile);

  updateRenderModeInfo();
  updateNodeTextModeInfo();
  updateNodeSizeModeInfo();
  updateLayerDepthControls();
  renderGraphTabs();
  updateExtractionToolbarState();

  const { dot, engine } = serializeGraphToDot(currentRenderedSubgraph, {
    renderProfile: currentRenderProfile,
    layoutMode: currentEffectiveLayoutMode,
    nodeTextMode,
    nodeSizeMode,
    sizeSourceNodes: currentTabBaseSubgraph.nodes,
  });
  const currentViewKey = getCurrentViewKey();
  const currentRenderKey = buildRenderKey(currentRenderedLayerDepth);
  const cachedRender = tabStateStore.getRenderCache(activeTab.id, currentRenderKey);

  const renderToken = ++currentRenderToken;
  renderer.setLoading(true);
  setStatus("渲染中...");

  try {
    const svgMarkup = cachedRender?.svgMarkup || (await requestSvgRender(dot, engine));
    if (renderToken !== currentRenderToken) return;

    if (!cachedRender) {
      tabStateStore.setRenderCache(activeTab.id, currentRenderKey, { svgMarkup });
    }

    renderer.render({
      svgMarkup,
      parsed: currentRenderedSubgraph,
      overview: currentRenderProfile === "overview",
      nodeTextMode,
    });

    if (activeTab.extractionMeta) {
      // Apply mini styling + hide edges between mini nodes
      const extractedSet = new Set(
        Array.from(activeTab.extractionMeta.extractedIds, (id) => String(id)),
      );
      const miniIds = currentRenderedSubgraph.nodes
        .map((n) => String(n.id))
        .filter((id) => !extractedSet.has(id));
      if (miniIds.length) {
        renderer.applyMiniNodes(miniIds, 0.18);
        renderer.shortenMiniEdges(miniIds, extractedSet);
      }
      // Hide edges where both endpoints are non-extracted
      const hideEdgeIds = new Set(
        currentRenderedSubgraph.edges
          .filter(
            (edge) =>
              !extractedSet.has(String(edge.from)) &&
              !extractedSet.has(String(edge.to)),
          )
          .map((edge) => `${String(edge.from)}->${String(edge.to)}`),
      );
      if (hideEdgeIds.size) {
        renderer.hideEdges(hideEdgeIds);
      }
      renderer.onMiniNodeClick = (id) => expandMiniNode(id);
    } else {
      renderer.clearExtractionStyles();
      renderer.onMiniNodeClick = null;
    }

    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    const savedState = tabStateStore.getViewState(activeTab.id, currentViewKey);
    const restoredViewport = renderer.restoreViewState(savedState, currentViewKey);
    if (!restoredViewport) {
      renderer.fitToView();
    }

    tabStateStore.setViewState(activeTab.id, currentViewKey, renderer.getViewState(currentViewKey));
    setStatus("");
    updateExtractionContext();
  } catch (error) {
    if (error?.name === "AbortError") return;
    renderer.clear();
    currentSubgraph = null;
    updateRenderModeInfo();
    updateLayerDepthControls();
    renderGraphTabs();
    updateExtractionToolbarState();
    setStatus(
      `${statusPrefix ? `${statusPrefix}；` : ""}渲染失败：${error.message}`,
      true,
    );
    console.error(error);
  } finally {
    renderer.setLoading(false);
  }
}

function renderGraph(statusPrefix = "") {
  extractionTabs = [];
  try {
    sourceParsedGraph = sanitizeParsedGraph(parseDot(currentDotText));
    currentGraphStats = summarizeGraph(sourceParsedGraph);
    tabStateStore.reset();
    layerDepthIsAuto = true;
    refreshLayerState({ resetDepth: true });
    rebuildDisplayComponents({ preserveActive: false });
    updateMinComponentSizeInfo();
    renderActiveGraph(statusPrefix);
  } catch (error) {
    renderer.clear();
    extractionTabs = [];
    sourceParsedGraph = null;
    currentGraphStats = null;
    currentDisplayComponentState = null;
    currentDisplayGraph = null;
    currentGraphTabs = [];
    activeGraphTabId = null;
    currentSubgraph = null;
    currentTabBaseSubgraph = null;
    currentLayerMeta = null;
    currentLayerDepth = 0;
    currentLayerMaxDepth = 0;
    currentAutoLayerDepth = 0;
    currentRenderedLayerDepth = 0;
    currentRenderedSubgraph = null;
    minComponentSize = DEFAULT_MIN_COMPONENT_SIZE;
    minComponentSizeMax = DEFAULT_MIN_COMPONENT_SIZE;
    layerDepthIsAuto = true;
    tabStateStore.reset();
    updateMinComponentSizeInfo();
    updateRenderModeInfo();
    updateLayerDepthControls();
    renderGraphTabs();
    updateExtractionToolbarState();
    setStatus(
      `${statusPrefix ? `${statusPrefix}；` : ""}渲染失败：${error.message}`,
      true,
    );
    console.error(error);
  }
}

function applyLayout() {
  if (!sourceParsedGraph) return;
  captureCurrentTabViewState();
  renderActiveGraph(`已应用布局：${layoutSelect.options[layoutSelect.selectedIndex].text}`);
}

async function loadDefaultGraph() {
  try {
    const response = await fetch(DEFAULT_DOT_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    currentDotText = await response.text();
    await loadNodeDetailsForGraph(DEFAULT_DOT_PATH);
    renderGraph(`已加载默认图：${DEFAULT_DOT_PATH}`);
  } catch (error) {
    currentDotText = "";
    clearGraph();
    updateRenderModeInfo();
    renderGraphTabs();
    setStatus(`默认图加载失败：${error.message}`, true);
    console.warn("Failed to load default graph:", error);
  }
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    currentDotText = await file.text();
    await loadNodeDetailsForGraph(file.name);
    renderGraph(`已加载文件：${file.name}`);
  } catch (error) {
    setStatus(`读取文件失败：${error.message}`, true);
  }
});

renderBtn.addEventListener("click", () => {
  if (!currentDotText.trim()) {
    setStatus("请先导入一个 .gv 文件。", true);
    return;
  }
  renderGraph();
});


applyLayoutBtn.addEventListener("click", applyLayout);
zoomInBtn.addEventListener("click", () => renderer.zoom(1.18));
zoomOutBtn.addEventListener("click", () => renderer.zoom(1 / 1.18));
fitViewBtn.addEventListener("click", () => renderer.fitToView());

if (renderModeSelect) {
  renderModeSelect.addEventListener("change", () => {
    if (!sourceParsedGraph) {
      updateRenderModeInfo();
      renderGraphTabs();
      return;
    }
    captureCurrentTabViewState();
    renderActiveGraph("已切换渲染策略");
  });
}

toggleNodeTextBtn.addEventListener("click", () => {
  if (currentRenderProfile === "overview") return;
  captureCurrentTabViewState();
  nodeTextMode = getNextNodeTextMode(nodeTextMode);
  renderActiveGraph("已切换节点文本");
});

nodeSizeModeSelect.addEventListener("change", () => {
  nodeSizeMode = nodeSizeModeSelect.value;
  updateNodeSizeModeInfo();
  if (!sourceParsedGraph) return;
  captureCurrentTabViewState();
  renderActiveGraph("已切换节点尺寸");
});

if (minComponentSizeInput) {
  minComponentSizeInput.addEventListener("change", () => {
    applyMinComponentSize(getMinComponentSizeInputValue());
  });

  minComponentSizeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyMinComponentSize(getMinComponentSizeInputValue());
    }
  });
}

if (minComponentSizeDownBtn) {
  minComponentSizeDownBtn.addEventListener("click", () => stepMinComponentSize(-1));
}

if (minComponentSizeUpBtn) {
  minComponentSizeUpBtn.addEventListener("click", () => stepMinComponentSize(1));
}

for (const button of minComponentSizeQuickBtns) {
  button.addEventListener("click", () => {
    applyMinComponentSize(Number.parseInt(button.dataset.minComponentSize || "", 10));
  });
}

layerDepthDownBtn.addEventListener("click", () => {
  const nextDepth = clampLayerDepth(currentLayerDepth + 1, currentLayerMaxDepth);
  applyLayerDepth(nextDepth, {
    status: `已切换显示层级：${getLayerDepthLabel(nextDepth, currentLayerMaxDepth)}`,
  });
});

layerDepthUpBtn.addEventListener("click", () => {
  const nextDepth = clampLayerDepth(currentLayerDepth - 1, currentLayerMaxDepth);
  applyLayerDepth(nextDepth, {
    status: `已切换显示层级：${getLayerDepthLabel(nextDepth, currentLayerMaxDepth)}`,
  });
});

if (layerDepthAutoBtn) {
  layerDepthAutoBtn.addEventListener("click", () => {
    applyLayerDepth(currentAutoLayerDepth, {
      auto: true,
      status: "已切换为合适层级",
    });
  });
}

layerDepthAllBtn.addEventListener("click", () => {
  applyLayerDepth(0, {
    status: "已切换为显示全部层级",
  });
});

window.addEventListener("resize", () => {
  if (!renderer.hasGraph()) return;
  captureCurrentTabViewState();
  const activeTab = getActiveGraphTab();
  const savedState = activeTab ? tabStateStore.getViewState(activeTab.id, getCurrentViewKey()) : null;
  if (!renderer.restoreViewState(savedState, getCurrentViewKey())) {
    renderer.fitToView();
  }
});

if (nodeSizeModeSelect) {
  for (const option of NODE_SIZE_MODE_OPTIONS) {
    if (!Array.from(nodeSizeModeSelect.options).some((existing) => existing.value === option.value)) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      nodeSizeModeSelect.append(el);
    }
  }
}

updateNodeTextModeInfo();
updateNodeSizeModeInfo();
updateMinComponentSizeInfo();
updateRenderModeInfo();
updateLayerDepthControls();
updateExtractionToolbarState();
loadDefaultGraph();
