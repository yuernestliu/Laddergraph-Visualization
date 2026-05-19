import {
  DEFAULT_DOT_PATH,
  LARGE_GRAPH_EDGE_THRESHOLD,
  LARGE_GRAPH_NODE_THRESHOLD,
  NODE_SIZE_MODE_OPTIONS,
  buildNodeLayerMap,
  buildGraphTabs,
  filterSubgraphByLayerDepth,
  formatNodeSizeModeLabel,
  getEffectiveLayoutMode,
  getEffectiveRenderProfile,
  getSubgraphForTab,
  parseDot,
  sanitizeParsedGraph,
  serializeGraphToDot,
  summarizeGraph,
} from "./graphviz-core.js";
import { GraphvizSvgRenderer } from "./graphviz-svg-renderer.js";

const RENDER_API_PATH = "/api/render";
const DEFAULT_NODE_SIZE_MODE = "sqrt";
const AUTO_LAYER_NODE_THRESHOLD = 180;
const AUTO_LAYER_EDGE_THRESHOLD = 320;

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
const nodeSizeModeSelect = document.getElementById("nodeSizeModeSelect");
const nodeSizeModeInfo = document.getElementById("nodeSizeModeInfo");
const layerDepthDownBtn = document.getElementById("layerDepthDownBtn");
const layerDepthUpBtn = document.getElementById("layerDepthUpBtn");
const layerDepthAutoBtn = document.getElementById("layerDepthAutoBtn");
const layerDepthAllBtn = document.getElementById("layerDepthAllBtn");
const layerDepthInfo = document.getElementById("layerDepthInfo");
const networkEl = document.getElementById("network");
const newCustomViewBtn = document.getElementById("newCustomViewBtn");
const branchExtractContainer = document.getElementById("branchExtractContainer");
const branchExtractModeSelect = document.getElementById("branchExtractModeSelect");
const branchExtractNodePanel = document.getElementById("branchExtractNodePanel");
const branchExtractLayerPanel = document.getElementById("branchExtractLayerPanel");
const branchModeSelect = document.getElementById("branchModeSelect");
const extractSubgraphBtn = document.getElementById("extractSubgraphBtn");
const subUpLevelInput = document.getElementById("subUpLevel");
const subDownLevelInput = document.getElementById("subDownLevel");
const subgraphSelectInfo = document.getElementById("subgraphSelectInfo");
const layerUpLevelInput = document.getElementById("layerUpLevel");
const layerDownLevelInput = document.getElementById("layerDownLevel");
const extractLayerBtn = document.getElementById("extractLayerBtn");

const renderer = new GraphvizSvgRenderer(networkEl, {
  selectionEnabled: true,
  onSelectionChange: (nodeId) => {
    if (isCustomViewActive) return;
    selectedSubgraphNodeId = nodeId;
    updateSubgraphSelectionInfo();
  },
});

if (nodeSizeModeSelect) {
  nodeSizeModeSelect.value = DEFAULT_NODE_SIZE_MODE;
}

let sourceParsedGraph = null;
let currentDotText = "";
let currentGraphStats = null;
let currentGraphTabs = [];
let activeGraphTabId = null;
let currentRenderProfile = "full";
let currentEffectiveLayoutMode = "hierarchicalTB";
let graphTabViewState = new Map();
let graphTabDepthState = new Map();
let graphTabRenderedDepthState = new Map();
let graphTabRenderCache = new Map();
let nodeTextMode = "label";
let nodeSizeMode = DEFAULT_NODE_SIZE_MODE;
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
let selectedSubgraphNodeId = null;
let customViewSeq = 0;
let customViews = [];
let activeCustomViewId = null;
let isCustomViewActive = false;
let branchControlsEnabled = false;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.hidden = !message;
  statusEl.style.color = isError ? "#c92a2a" : "#6b7280";
}

function ensureCustomViewSectionVisible() {
  if (!branchExtractContainer) return;
  if (branchControlsEnabled || customViews.length) {
    branchExtractContainer.style.display = "block";
  } else {
    branchExtractContainer.style.display = "none";
  }
}

function createCustomView(title) {
  const id = `custom-${++customViewSeq}`;
  const view = {
    id,
    label: title || `自定义视图 ${customViewSeq}`,
    kind: "custom",
    graph: {
      graphAttrs: currentTabBaseSubgraph?.graphAttrs || {},
      nodes: [],
      edges: [],
    },
  };
  customViews.push(view);
  return view;
}

function clearCustomViews() {
  customViews = [];
  activeCustomViewId = null;
  isCustomViewActive = false;
  customViewSeq = 0;
  branchControlsEnabled = false;
  ensureCustomViewSectionVisible();
}

function getCustomViewById(id) {
  return customViews.find((view) => view.id === id) || null;
}

function initializeCustomViewLayers(view) {
  if (!view?.graph) return;
  const meta = buildNodeLayerMap(view.graph);
  view.layerMeta = meta;
  view.layerMaxDepth = meta.maxDepth;
  view.layerAutoDepth = getSuggestedLayerDepth(view.graph, meta);
  if (!Number.isFinite(view.layerDepth)) {
    view.layerDepth = view.layerAutoDepth;
  }
  view.layerDepth = clampLayerDepth(view.layerDepth, view.layerMaxDepth);
}

function updateBranchExtractModePanelVisibility() {
  if (!branchExtractModeSelect) return;
  const mode = branchExtractModeSelect.value || "node";
  if (branchExtractNodePanel) {
    branchExtractNodePanel.style.display = mode === "node" ? "block" : "none";
  }
  if (branchExtractLayerPanel) {
    branchExtractLayerPanel.style.display = mode === "layer" ? "block" : "none";
  }
}

function setActiveCustomView(viewId) {
  activeCustomViewId = viewId;
  isCustomViewActive = Boolean(viewId);
}

function setActiveGraphTab(tabId) {
  captureCurrentTabViewState();
  activeGraphTabId = tabId;
  isCustomViewActive = false;
  renderActiveGraph(`已切换到${getActiveGraphTab()?.label || "标签"}`);
}

function updateFreeModePanelVisibility() {
  if (!branchModeSelect || !branchExtractModeSelect) return;
  const panel = document.getElementById("freeModePanel");
  if (!panel) return;
  const show = branchExtractModeSelect.value === "node" && branchModeSelect.value === "free";
  panel.style.display = show ? "flex" : "none";
}

function updateSubgraphSelectionInfo(message) {
  if (!subgraphSelectInfo) return;
  if (message) {
    subgraphSelectInfo.textContent = message;
    return;
  }
  if (!selectedSubgraphNodeId) {
    subgraphSelectInfo.textContent = "未选择节点";
    return;
  }
  if (branchExtractModeSelect?.value === "layer") {
    const upLevel = Number(layerUpLevelInput?.value || 0);
    const downLevel = Number(layerDownLevelInput?.value || 0);
    subgraphSelectInfo.textContent =
      `已选：${selectedSubgraphNodeId}（上${upLevel}层 / 下${downLevel}层）`;
    return;
  }
  if (branchExtractModeSelect?.value !== "node") {
    subgraphSelectInfo.textContent = "切换为按节点可选择";
    return;
  }
  const mode = branchModeSelect?.value || "all";
  if (mode !== "free") {
    subgraphSelectInfo.textContent = `已选：${selectedSubgraphNodeId}（模式：${branchModeLabel(mode)}）`;
    return;
  }
  const upLevel = Number(subUpLevelInput?.value || 0);
  const downLevel = Number(subDownLevelInput?.value || 0);
  subgraphSelectInfo.textContent =
    `已选：${selectedSubgraphNodeId}（模式：${branchModeLabel(mode)}，上游${upLevel}层，下游${downLevel}层）`;
}

function computeLayerLevels(nodesList, edgesList, rankdir) {
  const incoming = new Map();
  const outgoing = new Map();
  const indegree = new Map();
  const nodeY = new Map();
  for (const node of nodesList) {
    const id = String(node.id);
    incoming.set(id, []);
    outgoing.set(id, []);
    indegree.set(id, 0);
    if (Number.isFinite(node.y)) nodeY.set(id, node.y);
  }
  for (const edge of edgesList) {
    const from = String(edge.from);
    const to = String(edge.to);
    if (!incoming.has(to) || !outgoing.has(from)) continue;
    incoming.get(to).push(from);
    outgoing.get(from).push(to);
    indegree.set(to, (indegree.get(to) || 0) + 1);
  }

  const queue = Array.from(indegree.entries())
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id);
  const level = new Map();
  for (const id of incoming.keys()) level.set(id, 0);

  while (queue.length) {
    const cur = queue.shift();
    const base = level.get(cur) || 0;
    for (const next of outgoing.get(cur) || []) {
      const candidate = base + 1;
      if (candidate > (level.get(next) || 0)) level.set(next, candidate);
      indegree.set(next, (indegree.get(next) || 0) - 1);
      if ((indegree.get(next) || 0) === 0) queue.push(next);
    }
  }

  let maxLevel = 0;
  for (const lv of level.values()) maxLevel = Math.max(maxLevel, lv);

  let sourceSum = 0;
  let sourceCount = 0;
  let sinkSum = 0;
  let sinkCount = 0;
  for (const id of incoming.keys()) {
    const y = nodeY.get(id);
    if (!Number.isFinite(y)) continue;
    if ((indegree.get(id) || 0) === 0) {
      sourceSum += y;
      sourceCount += 1;
    }
    if ((outgoing.get(id) || []).length === 0) {
      sinkSum += y;
      sinkCount += 1;
    }
  }
  const sourceAvg = sourceCount ? sourceSum / sourceCount : null;
  const sinkAvg = sinkCount ? sinkSum / sinkCount : null;
  let bottomIsSource =
    Number.isFinite(sourceAvg) && Number.isFinite(sinkAvg) ? sourceAvg > sinkAvg : false;
  if (!Number.isFinite(sourceAvg) && !Number.isFinite(sinkAvg)) {
    const dir = String(rankdir || "").toUpperCase();
    bottomIsSource = dir === "BT";
  }

  const reversed = new Map();
  for (const [id, lv] of level.entries()) {
    reversed.set(id, bottomIsSource ? lv : maxLevel - lv);
  }
  return reversed;
}

function getNodesWithinLayerRange(centerId, upLevels, downLevels, levelMap) {
  const centerLevel = levelMap.get(String(centerId));
  if (!Number.isFinite(centerLevel)) return new Set();
  const minLevel = Math.max(0, centerLevel - Math.max(0, upLevels));
  const maxLevel = centerLevel + Math.max(0, downLevels);
  const selected = new Set();
  for (const [id, level] of levelMap.entries()) {
    if (level >= minLevel && level <= maxLevel) selected.add(String(id));
  }
  return selected;
}

function getVisibleGraphByCurrentTab() {
  if (!currentSubgraph) return { nodes: [], edges: [] };
  return { nodes: currentSubgraph.nodes, edges: currentSubgraph.edges };
}

function branchModeLabel(mode) {
  if (mode === "up") return "仅上游";
  if (mode === "down") return "仅下游";
  if (mode === "adjacent") return "一跳邻接";
  if (mode === "free") return "自由选择";
  return "上下游全分支";
}

function getUpstreamNodesFromEdges(centerId, maxLevels, edgesList) {
  const result = new Set([String(centerId)]);
  const queue = [{ id: String(centerId), level: 0 }];
  const visited = new Map([[String(centerId), 0]]);
  while (queue.length > 0) {
    const { id, level } = queue.shift();
    if (level >= maxLevels) continue;
    const nextLevel = level + 1;
    for (const edge of edgesList) {
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

function getDownstreamNodesFromEdges(centerId, maxLevels, edgesList) {
  const result = new Set([String(centerId)]);
  const queue = [{ id: String(centerId), level: 0 }];
  const visited = new Map([[String(centerId), 0]]);
  while (queue.length > 0) {
    const { id, level } = queue.shift();
    if (level >= maxLevels) continue;
    const nextLevel = level + 1;
    for (const edge of edgesList) {
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

function collectNodesByMode(centerId, mode, edgesList, upLevel = 0, downLevel = 0) {
  if (mode === "up") {
    return getUpstreamNodesFromEdges(centerId, Number.MAX_SAFE_INTEGER, edgesList);
  }
  if (mode === "down") {
    return getDownstreamNodesFromEdges(centerId, Number.MAX_SAFE_INTEGER, edgesList);
  }
  if (mode === "adjacent") {
    const set = new Set([String(centerId)]);
    for (const edge of edgesList) {
      if (String(edge.from) === String(centerId)) set.add(String(edge.to));
      if (String(edge.to) === String(centerId)) set.add(String(edge.from));
    }
    return set;
  }
  if (mode === "free") {
    const upNodes = getUpstreamNodesFromEdges(centerId, Math.max(0, upLevel), edgesList);
    const downNodes = getDownstreamNodesFromEdges(centerId, Math.max(0, downLevel), edgesList);
    return new Set([...upNodes, ...downNodes]);
  }
  const upNodes = getUpstreamNodesFromEdges(centerId, Number.MAX_SAFE_INTEGER, edgesList);
  const downNodes = getDownstreamNodesFromEdges(centerId, Number.MAX_SAFE_INTEGER, edgesList);
  return new Set([...upNodes, ...downNodes]);
}

async function renderBranchView(subgraph, title) {
  const view = createCustomView(title);
  view.graph = subgraph;
  initializeCustomViewLayers(view);
  setActiveCustomView(view.id);
  await renderCustomView(view);
}

async function extractSubgraphByNode() {
  if (branchExtractModeSelect?.value !== "node") return;
  if (!selectedSubgraphNodeId) {
    updateSubgraphSelectionInfo("未选择节点");
    return;
  }
  const mode = branchModeSelect?.value || "all";
  const upLevel = Number(subUpLevelInput?.value || 0);
  const downLevel = Number(subDownLevelInput?.value || 0);
  const { nodes: visibleNodes, edges: visibleEdges } = getVisibleGraphByCurrentTab();
  if (!visibleNodes.length) return;

  const edgesList = visibleEdges.map((edge) => ({ from: edge.from, to: edge.to }));
  const selectedNodes = collectNodesByMode(
    selectedSubgraphNodeId,
    mode,
    edgesList,
    upLevel,
    downLevel,
  );
  const nodeSet = new Set(selectedNodes);
  const subgraph = {
    graphAttrs: currentTabBaseSubgraph?.graphAttrs || {},
    nodes: visibleNodes.filter((node) => nodeSet.has(String(node.id))),
    edges: visibleEdges.filter(
      (edge) => nodeSet.has(String(edge.from)) && nodeSet.has(String(edge.to)),
    ),
  };
  await renderBranchView(subgraph, `提取-按节点-${branchModeLabel(mode)}`);
  updateSubgraphSelectionInfo(
    `已提取：${subgraph.nodes.length} 节点（${branchModeLabel(mode)}）`,
  );
}

async function extractByLayer() {
  if (branchExtractModeSelect?.value !== "layer") return;
  if (!selectedSubgraphNodeId) {
    updateSubgraphSelectionInfo("未选择节点");
    return;
  }
  const upLevel = Math.max(0, Math.floor(Number(layerUpLevelInput?.value || 0)));
  const downLevel = Math.max(0, Math.floor(Number(layerDownLevelInput?.value || 0)));

  const { nodes: visibleNodes, edges: visibleEdges } = getVisibleGraphByCurrentTab();
  if (!visibleNodes.length) return;

  const reversedLevels = computeLayerLevels(
    visibleNodes,
    visibleEdges,
    currentTabBaseSubgraph?.graphAttrs?.rankdir,
  );
  const centerLevel = reversedLevels.get(String(selectedSubgraphNodeId));
  if (!Number.isFinite(centerLevel)) {
    updateSubgraphSelectionInfo("选中节点不在当前视图范围内");
    return;
  }
  const sameLevelIds = new Set();
  for (const [id, level] of reversedLevels.entries()) {
    if (level === centerLevel) sameLevelIds.add(String(id));
  }

  const edgesList = visibleEdges.map((edge) => ({ from: edge.from, to: edge.to }));
  const selectedIds = new Set();
  const addWithLimit = (id) => {
    selectedIds.add(id);
    if (selectedIds.size > 500) {
      setStatus("按层提取范围过大（超过 500 节点），请缩小层数。", true);
      return false;
    }
    return true;
  };
  for (const seedId of sameLevelIds) {
    const upNodes = getUpstreamNodesFromEdges(seedId, upLevel, edgesList);
    const downNodes = getDownstreamNodesFromEdges(seedId, downLevel, edgesList);
    for (const id of upNodes) {
      if (!addWithLimit(id)) return;
    }
    for (const id of downNodes) {
      if (!addWithLimit(id)) return;
    }
  }

  const subgraph = {
    graphAttrs: currentTabBaseSubgraph?.graphAttrs || {},
    nodes: visibleNodes.filter((node) => selectedIds.has(String(node.id))),
    edges: visibleEdges.filter(
      (edge) => selectedIds.has(String(edge.from)) && selectedIds.has(String(edge.to)),
    ),
  };
  await renderBranchView(
    subgraph,
    `提取-按层数-${selectedSubgraphNodeId}-U${upLevel}-D${downLevel}`,
  );
  updateSubgraphSelectionInfo(
    `已按层提取：${subgraph.nodes.length} 节点（上${upLevel}层 / 下${downLevel}层）`,
  );
}

function clearGraph() {
  sourceParsedGraph = null;
  currentGraphStats = null;
  currentGraphTabs = [];
  activeGraphTabId = null;
  currentRenderProfile = "full";
  currentEffectiveLayoutMode = "hierarchicalTB";
  graphTabViewState = new Map();
  graphTabDepthState = new Map();
  graphTabRenderedDepthState = new Map();
  graphTabRenderCache = new Map();
  currentSubgraph = null;
  currentTabBaseSubgraph = null;
  currentLayerMeta = null;
  currentLayerDepth = 0;
  currentLayerMaxDepth = 0;
  currentAutoLayerDepth = 0;
  currentRenderedLayerDepth = 0;
  currentRenderedSubgraph = null;
  clearCustomViews();
  renderer.clear();
}

function getRequestedRenderMode() {
  return renderModeSelect?.value || "full";
}

function applyBranchSelectionEnabled() {
  const mode = branchExtractModeSelect?.value;
  renderer.setSelectionEnabled(mode === "node" || mode === "layer");
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
    layerDepth <= 0 ? "depth:all" : `depth:-${layerDepth}`,
  ].join("|");
}

function buildRenderKey(renderedDepth = currentRenderedLayerDepth) {
  return [
    currentEffectiveLayoutMode,
    currentRenderProfile,
    nodeTextMode,
    nodeSizeMode,
    renderedDepth <= 0 ? "render:all" : `render:-${renderedDepth}`,
  ].join("|");
}

function getTabStateBucket(store, tabId) {
  if (!store.has(tabId)) {
    store.set(tabId, new Map());
  }
  return store.get(tabId);
}

function getStoredViewStateForTab(tabId, viewKey = getCurrentViewKey()) {
  return graphTabViewState.get(tabId)?.get(viewKey) || null;
}

function setStoredViewStateForTab(tabId, viewKey, state) {
  getTabStateBucket(graphTabViewState, tabId).set(viewKey, state);
}

function getStoredRenderCache(tabId, viewKey) {
  return graphTabRenderCache.get(tabId)?.get(viewKey) || null;
}

function setStoredRenderCache(tabId, viewKey, cacheEntry) {
  getTabStateBucket(graphTabRenderCache, tabId).set(viewKey, cacheEntry);
}

function clampLayerDepth(value, maxDepth) {
  return Math.max(0, Math.min(maxDepth, Number.isFinite(value) ? Math.trunc(value) : 0));
}

function getStoredLayerDepthForTab(tabId, maxDepth) {
  return clampLayerDepth(graphTabDepthState.get(tabId), maxDepth);
}

function setStoredLayerDepthForTab(tabId, depth, maxDepth) {
  graphTabDepthState.set(tabId, clampLayerDepth(depth, maxDepth));
}

function getStoredRenderedDepthForTab(tabId, maxDepth) {
  if (!graphTabRenderedDepthState.has(tabId)) return null;
  return clampLayerDepth(graphTabRenderedDepthState.get(tabId), maxDepth);
}

function setStoredRenderedDepthForTab(tabId, depth, maxDepth) {
  graphTabRenderedDepthState.set(tabId, clampLayerDepth(depth, maxDepth));
}

function getTrimmedLayerCount(depth, maxDepth) {
  return clampLayerDepth(depth, maxDepth);
}

function getLayerDepthLabel(depth, maxDepth) {
  const trimmed = getTrimmedLayerCount(depth, maxDepth);
  if (trimmed <= 0) {
    return "全部";
  }
  return `-${trimmed}层`;
}

function getSuggestedLayerDepth(baseSubgraph, layerMeta) {
  if (!baseSubgraph || !layerMeta) return 0;

  for (let trimmed = 0; trimmed <= layerMeta.maxDepth; trimmed += 1) {
    const candidate = filterSubgraphByLayerDepth(baseSubgraph, trimmed, layerMeta);
    const stats = summarizeGraph(candidate);
    if (
      stats.nodeCount <= AUTO_LAYER_NODE_THRESHOLD &&
      stats.edgeCount <= AUTO_LAYER_EDGE_THRESHOLD
    ) {
      return trimmed;
    }
  }

  return layerMeta.maxDepth;
}

function updateLayerDepthControls() {
  if (!layerDepthDownBtn || !layerDepthUpBtn || !layerDepthAllBtn) return;
  if (isCustomViewActive) {
    const view = getCustomViewById(activeCustomViewId);
    const hasGraph = Boolean(view?.graph?.nodes?.length);
    if (!hasGraph || !view?.layerMeta) {
      layerDepthDownBtn.disabled = true;
      layerDepthUpBtn.disabled = true;
      if (layerDepthAutoBtn) layerDepthAutoBtn.disabled = true;
      layerDepthAllBtn.disabled = true;
      if (layerDepthInfo) {
        layerDepthInfo.textContent = "当前层级：自定义视图";
      }
      return;
    }

    layerDepthDownBtn.disabled = view.layerDepth >= view.layerMaxDepth;
    layerDepthUpBtn.disabled = view.layerDepth <= 0;
    if (layerDepthAutoBtn) {
      layerDepthAutoBtn.disabled = view.layerDepth === view.layerAutoDepth;
    }
    layerDepthAllBtn.disabled = view.layerDepth <= 0;

    if (layerDepthInfo) {
      const trimmed = getTrimmedLayerCount(view.layerDepth, view.layerMaxDepth);
      const detail =
        trimmed <= 0
          ? `完整显示（最深 ${view.layerMaxDepth} 层）`
          : `已去掉最底层 ${trimmed} 层`;
      const autoDetail = view.layerAutoDepth === 0 ? "全部" : `-${view.layerAutoDepth}层`;
      layerDepthInfo.textContent =
        `当前层级：${getLayerDepthLabel(view.layerDepth, view.layerMaxDepth)}。${detail}；` +
        `合适层级：${autoDetail}`;
    }
    return;
  }

  const hasGraph = Boolean(sourceParsedGraph && currentTabBaseSubgraph);
  const trimmed = getTrimmedLayerCount(currentLayerDepth, currentLayerMaxDepth);
  layerDepthDownBtn.disabled = !hasGraph || currentLayerDepth >= currentLayerMaxDepth;
  layerDepthUpBtn.disabled = !hasGraph || currentLayerDepth <= 0;
  if (layerDepthAutoBtn) {
    layerDepthAutoBtn.disabled = !hasGraph || currentLayerDepth === currentAutoLayerDepth;
  }
  layerDepthAllBtn.disabled = !hasGraph || currentLayerDepth <= 0;

  if (!hasGraph) {
    if (layerDepthInfo) {
      layerDepthInfo.textContent = "当前层级：未加载图";
    }
    return;
  }

  if (layerDepthInfo) {
    const detail =
      trimmed <= 0
        ? `完整显示（最深 ${currentLayerMaxDepth} 层）`
        : `已去掉最底层 ${trimmed} 层`;
    const autoDetail =
      currentAutoLayerDepth === 0 ? "全部" : `-${currentAutoLayerDepth}层`;
    layerDepthInfo.textContent =
      `当前层级：${getLayerDepthLabel(currentLayerDepth, currentLayerMaxDepth)}。${detail}；` +
      `合适层级：${autoDetail}`;
  }
}

function captureCurrentTabViewState(viewKey = getCurrentViewKey()) {
  const activeTab = getActiveGraphTab();
  if (!activeTab || !renderer.hasGraph()) return;
  setStoredViewStateForTab(activeTab.id, viewKey, renderer.getViewState(viewKey));
}

function renderGraphTabs() {
  graphTabsEl.innerHTML = "";

  if (!currentGraphTabs.length && !customViews.length) {
    graphTabsEl.hidden = true;
    graphTabsInfo.textContent = "当前显示：未加载图";
    return;
  }

  ensureActiveGraphTab();
  const activeTab = getActiveGraphTab();
  if (!activeTab && !customViews.length) {
    graphTabsEl.hidden = true;
    graphTabsInfo.textContent = "当前显示：未加载图";
    return;
  }

  if (isCustomViewActive) {
    const view = getCustomViewById(activeCustomViewId);
    const stats = view ? summarizeGraph(view.graph) : { nodeCount: 0, edgeCount: 0 };
    graphTabsInfo.textContent =
      `自定义视图；共 ${stats.nodeCount} 节点 / ${stats.edgeCount} 边。`;
  } else {
    const totalStats = currentTabBaseSubgraph ? summarizeGraph(currentTabBaseSubgraph) : activeTab.stats;
    const visibleStats = currentSubgraph ? summarizeGraph(currentSubgraph) : totalStats;
    const totalLayers = Math.max(1, currentLayerMaxDepth + 1);
    const visibleLayers = Math.max(1, totalLayers - getTrimmedLayerCount(currentLayerDepth, currentLayerMaxDepth));

    graphTabsInfo.textContent =
      `层级 ${visibleLayers}/${totalLayers}。` +
      `共 ${totalStats.nodeCount} 节点 / ${totalStats.edgeCount} 边；` +
      `目前显示：${visibleStats.nodeCount} 节点 / ${visibleStats.edgeCount} 边。`;
  }

  ensureCustomViewSectionVisible();

  if (currentGraphTabs.length + customViews.length <= 1) {
    graphTabsEl.hidden = true;
    return;
  }

  graphTabsEl.hidden = false;

  for (const tab of currentGraphTabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${!isCustomViewActive && tab.id === activeGraphTabId ? " active" : ""}`;
    button.textContent = tab.label;
    button.addEventListener("click", () => {
      if (!isCustomViewActive && tab.id === activeGraphTabId) return;
      setActiveGraphTab(tab.id);
    });
    graphTabsEl.append(button);
  }

  for (const view of customViews) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${isCustomViewActive && view.id === activeCustomViewId ? " active" : ""}`;
    button.textContent = view.label;
    button.addEventListener("click", () => {
      if (isCustomViewActive && view.id === activeCustomViewId) return;
      setActiveCustomView(view.id);
      renderCustomView(view);
    });
    graphTabsEl.append(button);
  }
}

function updateRenderModeInfo() {
  if (!renderModeInfo) return;
  if (isCustomViewActive) {
    const stats = currentGraphStats || { nodeCount: 0, edgeCount: 0 };
    renderModeInfo.textContent = `当前视图：自定义视图（${stats.nodeCount} 节点 / ${stats.edgeCount} 边）`;
    return;
  }
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
  if (currentRenderProfile === "overview") {
    const autoPrefix = requestedMode === "auto" ? "自动 -> " : "";
    const layoutNote =
      currentEffectiveLayoutMode !== layoutSelect.value
        ? "；已把力导向安全降级为默认分层"
        : "";
    renderModeInfo.textContent =
      `当前策略：${autoPrefix}概览模式（${sizeLabel}；隐藏标签、压缩布局${layoutNote}）`;
    return;
  }

  renderModeInfo.textContent = `当前策略：${requestedLabel}（${sizeLabel}）`;
}

function updateNodeTextModeInfo() {
  if (currentRenderProfile === "overview") {
    nodeTextModeInfo.textContent = "当前显示：概览模式已隐藏节点文本";
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

function updateNodeSizeModeInfo() {
  if (!nodeSizeModeInfo) return;
  const label = formatNodeSizeModeLabel(nodeSizeMode);
  if (nodeSizeMode === "fixed") {
    nodeSizeModeInfo.textContent = "当前尺寸：固定。";
    return;
  }
  nodeSizeModeInfo.textContent = `当前尺寸：按 ${label} 映射；S 取括号里的数字。`;
}

function recomputeVisibleSubgraph() {
  if (!currentTabBaseSubgraph || !currentLayerMeta) {
    currentSubgraph = null;
    return null;
  }
  currentSubgraph = filterSubgraphByLayerDepth(
    currentTabBaseSubgraph,
    currentLayerDepth,
    currentLayerMeta,
  );
  return currentSubgraph;
}

function syncLayerVisibility(statusPrefix = "") {
  const activeTab = getActiveGraphTab();
  const visibleSubgraph = recomputeVisibleSubgraph();
  updateLayerDepthControls();
  renderGraphTabs();

  if (!activeTab || !visibleSubgraph || !renderer.hasGraph()) {
    return;
  }

  renderer.setVisibleSubgraph(visibleSubgraph);
  setStoredViewStateForTab(activeTab.id, getCurrentViewKey(), renderer.getViewState(getCurrentViewKey()));
  setStatus("");
}

async function renderCustomView(view) {
  if (!view) return;
  if (!view.graph) {
    renderer.clear();
    setStatus("当前视图为空。", true);
    return;
  }
  renderer.setSelectionEnabled(true);
  initializeCustomViewLayers(view);
  const subgraph = view.graph;
  const stats = summarizeGraph(subgraph);
  currentGraphStats = stats;
  currentRenderProfile = getEffectiveRenderProfile(stats, getRequestedRenderMode());
  currentEffectiveLayoutMode = getEffectiveLayoutMode(layoutSelect.value, currentRenderProfile);

  updateRenderModeInfo();
  updateNodeTextModeInfo();
  updateNodeSizeModeInfo();
  updateLayerDepthControls();
  renderGraphTabs();

  const { dot, engine } = serializeGraphToDot(subgraph, {
    renderProfile: currentRenderProfile,
    layoutMode: currentEffectiveLayoutMode,
    nodeTextMode,
    nodeSizeMode,
  });

  const visibleSubgraph = filterSubgraphByLayerDepth(
    subgraph,
    view.layerDepth,
    view.layerMeta,
  );

  const renderToken = ++currentRenderToken;
  renderer.setLoading(true);
  setStatus("渲染中...");
  try {
    const svgMarkup = await requestSvgRender(dot, engine);
    if (renderToken !== currentRenderToken) return;
    renderer.render({
      svgMarkup,
      parsed: subgraph,
      overview: currentRenderProfile === "overview",
      nodeTextMode,
    });
    if (view.layerDepth > 0) {
      renderer.setVisibleSubgraph(visibleSubgraph);
    }
    renderer.fitToView();
    renderer.setLoading(false);
    setStatus("");
  } catch (error) {
    if (error?.name === "AbortError") return;
    renderer.clear();
    setStatus(`渲染失败：${error.message}`, true);
    console.error(error);
  } finally {
    renderer.setLoading(false);
  }
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

async function renderActiveGraph(statusPrefix = "") {
  ensureActiveGraphTab();
  const activeTab = getActiveGraphTab();
  if (!sourceParsedGraph || !activeTab) {
    renderer.clear();
    currentTabBaseSubgraph = null;
    currentLayerMeta = null;
    currentLayerDepth = 0;
    currentLayerMaxDepth = 0;
    updateRenderModeInfo();
    updateLayerDepthControls();
    renderGraphTabs();
    setStatus("当前没有可渲染的子图。", true);
    return;
  }

  renderer.setSelectionEnabled(
    branchExtractModeSelect?.value === "node" || branchExtractModeSelect?.value === "layer",
  );

  currentTabBaseSubgraph = getSubgraphForTab(sourceParsedGraph, activeTab);
  currentLayerMeta = buildNodeLayerMap(currentTabBaseSubgraph);
  currentLayerMaxDepth = currentLayerMeta.maxDepth;
  currentAutoLayerDepth = getSuggestedLayerDepth(currentTabBaseSubgraph, currentLayerMeta);
  if (graphTabDepthState.has(activeTab.id)) {
    currentLayerDepth = getStoredLayerDepthForTab(activeTab.id, currentLayerMaxDepth);
  } else {
    currentLayerDepth = currentAutoLayerDepth;
    setStoredLayerDepthForTab(activeTab.id, currentLayerDepth, currentLayerMaxDepth);
  }
  const storedRenderedDepth = getStoredRenderedDepthForTab(activeTab.id, currentLayerMaxDepth);
  currentRenderedLayerDepth =
    storedRenderedDepth != null && storedRenderedDepth <= currentLayerDepth
      ? storedRenderedDepth
      : currentLayerDepth;
  currentRenderedSubgraph = filterSubgraphByLayerDepth(
    currentTabBaseSubgraph,
    currentRenderedLayerDepth,
    currentLayerMeta,
  );
  if (!currentRenderedSubgraph.nodes.length && currentTabBaseSubgraph.nodes.length) {
    currentRenderedLayerDepth = 0;
    currentLayerDepth = 0;
    currentAutoLayerDepth = 0;
    setStoredLayerDepthForTab(activeTab.id, 0, currentLayerMaxDepth);
    setStoredRenderedDepthForTab(activeTab.id, 0, currentLayerMaxDepth);
    currentRenderedSubgraph = currentTabBaseSubgraph;
  }
  currentSubgraph = filterSubgraphByLayerDepth(
    currentTabBaseSubgraph,
    currentLayerDepth,
    currentLayerMeta,
  );
  currentGraphStats = summarizeGraph(currentRenderedSubgraph);
  currentRenderProfile = getEffectiveRenderProfile(currentGraphStats, getRequestedRenderMode());
  currentEffectiveLayoutMode = getEffectiveLayoutMode(
    layoutSelect.value,
    currentRenderProfile,
  );

  updateRenderModeInfo();
  updateNodeTextModeInfo();
  updateNodeSizeModeInfo();
  updateLayerDepthControls();
  renderGraphTabs();

  const { dot, engine } = serializeGraphToDot(currentRenderedSubgraph, {
    renderProfile: currentRenderProfile,
    layoutMode: currentEffectiveLayoutMode,
    nodeTextMode,
    nodeSizeMode,
  });
  const currentViewKey = getCurrentViewKey();
  const currentRenderKey = buildRenderKey(currentRenderedLayerDepth);
  const cachedRender = getStoredRenderCache(activeTab.id, currentRenderKey);

  const renderToken = ++currentRenderToken;
  renderer.setLoading(true);
  setStatus("渲染中...");

  try {
    const svgMarkup = cachedRender?.svgMarkup || (await requestSvgRender(dot, engine));
    if (renderToken !== currentRenderToken) return;

    if (!cachedRender) {
      setStoredRenderCache(activeTab.id, currentRenderKey, {
        svgMarkup,
      });
    }

    renderer.render({
      svgMarkup,
      parsed: currentRenderedSubgraph,
      overview: currentRenderProfile === "overview",
      nodeTextMode,
    });

    if (currentLayerDepth !== currentRenderedLayerDepth) {
      renderer.setVisibleSubgraph(currentSubgraph);
    }

    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    const savedState = getStoredViewStateForTab(activeTab.id, currentViewKey);
    const restoredViewport = renderer.restoreViewState(savedState, currentViewKey);
    if (!restoredViewport) {
      renderer.fitToView();
    }
    setStoredRenderedDepthForTab(activeTab.id, currentRenderedLayerDepth, currentLayerMaxDepth);
    setStoredViewStateForTab(activeTab.id, currentViewKey, renderer.getViewState(currentViewKey));

    renderer.setLoading(false);
    setStatus("");
  } catch (error) {
    if (error?.name === "AbortError") return;
    renderer.clear();
    currentSubgraph = null;
    updateRenderModeInfo();
    updateLayerDepthControls();
    renderGraphTabs();
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
  try {
    clearCustomViews();
    branchControlsEnabled = false;
    sourceParsedGraph = sanitizeParsedGraph(parseDot(currentDotText));
    currentGraphTabs = buildGraphTabs(sourceParsedGraph);
    activeGraphTabId = currentGraphTabs[0]?.id || null;
    isCustomViewActive = false;
    currentGraphStats = summarizeGraph(sourceParsedGraph);
    graphTabViewState = new Map();
    graphTabDepthState = new Map();
    graphTabRenderedDepthState = new Map();
    graphTabRenderCache = new Map();
    renderActiveGraph(statusPrefix);
    ensureCustomViewSectionVisible();
  } catch (error) {
    renderer.clear();
    sourceParsedGraph = null;
    currentGraphTabs = [];
    activeGraphTabId = null;
    currentGraphStats = null;
    graphTabViewState = new Map();
    graphTabDepthState = new Map();
    graphTabRenderedDepthState = new Map();
    graphTabRenderCache = new Map();
    updateRenderModeInfo();
    updateLayerDepthControls();
    renderGraphTabs();
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
  renderActiveGraph(
    `已应用布局：${layoutSelect.options[layoutSelect.selectedIndex].text}`,
  );
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    currentDotText = await file.text();
    renderGraph(`已加载文件：${file.name}`);
  } catch (error) {
    setStatus(`读取文件失败：${error.message}`, true);
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
  } catch (error) {
    currentDotText = "";
    clearGraph();
    updateRenderModeInfo();
    renderGraphTabs();
    setStatus(`默认图加载失败：${error.message}`, true);
    console.warn("Failed to load default graph:", error);
  }
}

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
  nodeTextMode = nodeTextMode === "label" ? "id" : "label";
  renderActiveGraph("已切换节点文本");
});

nodeSizeModeSelect.addEventListener("change", () => {
  nodeSizeMode = nodeSizeModeSelect.value;
  updateNodeSizeModeInfo();
  if (!sourceParsedGraph) return;
  captureCurrentTabViewState();
  renderActiveGraph("已切换节点尺寸");
});

layerDepthDownBtn.addEventListener("click", () => {
  if (isCustomViewActive) {
    const view = getCustomViewById(activeCustomViewId);
    if (!view?.layerMeta) return;
    view.layerDepth = clampLayerDepth(view.layerDepth + 1, view.layerMaxDepth);
    updateLayerDepthControls();
    renderer.setVisibleSubgraph(
      filterSubgraphByLayerDepth(view.graph, view.layerDepth, view.layerMeta),
    );
    return;
  }
  const activeTab = getActiveGraphTab();
  if (!activeTab || !sourceParsedGraph) return;
  const nextDepth = Math.min(currentLayerMaxDepth, currentLayerDepth + 1);
  setStoredLayerDepthForTab(activeTab.id, nextDepth, currentLayerMaxDepth);
  currentLayerDepth = nextDepth;
  syncLayerVisibility(`已切换显示层级：${getLayerDepthLabel(nextDepth, currentLayerMaxDepth)}`);
});

layerDepthUpBtn.addEventListener("click", () => {
  if (isCustomViewActive) {
    const view = getCustomViewById(activeCustomViewId);
    if (!view?.layerMeta) return;
    view.layerDepth = clampLayerDepth(view.layerDepth - 1, view.layerMaxDepth);
    updateLayerDepthControls();
    if (view.layerDepth <= 0) {
      renderer.setVisibleSubgraph(view.graph);
    } else {
      renderer.setVisibleSubgraph(
        filterSubgraphByLayerDepth(view.graph, view.layerDepth, view.layerMeta),
      );
    }
    return;
  }
  const activeTab = getActiveGraphTab();
  if (!activeTab || !sourceParsedGraph) return;
  const nextDepth = Math.max(0, currentLayerDepth - 1);
  setStoredLayerDepthForTab(activeTab.id, nextDepth, currentLayerMaxDepth);
  if (nextDepth < currentRenderedLayerDepth) {
    captureCurrentTabViewState();
    currentLayerDepth = nextDepth;
    renderActiveGraph(`已切换显示层级：${getLayerDepthLabel(nextDepth, currentLayerMaxDepth)}`);
    return;
  }
  currentLayerDepth = nextDepth;
  syncLayerVisibility(`已切换显示层级：${getLayerDepthLabel(nextDepth, currentLayerMaxDepth)}`);
});

if (layerDepthAutoBtn) {
  layerDepthAutoBtn.addEventListener("click", () => {
    if (isCustomViewActive) {
      const view = getCustomViewById(activeCustomViewId);
      if (!view?.layerMeta) return;
      view.layerDepth = clampLayerDepth(view.layerAutoDepth, view.layerMaxDepth);
      updateLayerDepthControls();
      if (view.layerDepth <= 0) {
        renderer.setVisibleSubgraph(view.graph);
      } else {
        renderer.setVisibleSubgraph(
          filterSubgraphByLayerDepth(view.graph, view.layerDepth, view.layerMeta),
        );
      }
      return;
    }
    const activeTab = getActiveGraphTab();
    if (!activeTab || !sourceParsedGraph) return;
    setStoredLayerDepthForTab(activeTab.id, currentAutoLayerDepth, currentLayerMaxDepth);
    if (currentAutoLayerDepth < currentRenderedLayerDepth) {
      captureCurrentTabViewState();
      currentLayerDepth = currentAutoLayerDepth;
      renderActiveGraph("已切换为合适层级");
      return;
    }
    currentLayerDepth = currentAutoLayerDepth;
    syncLayerVisibility("已切换为合适层级");
  });
}

layerDepthAllBtn.addEventListener("click", () => {
  if (isCustomViewActive) {
    const view = getCustomViewById(activeCustomViewId);
    if (!view?.layerMeta) return;
    view.layerDepth = 0;
    updateLayerDepthControls();
    renderer.setVisibleSubgraph(view.graph);
    return;
  }
  const activeTab = getActiveGraphTab();
  if (!activeTab || !sourceParsedGraph) return;
  setStoredLayerDepthForTab(activeTab.id, 0, currentLayerMaxDepth);
  if (currentRenderedLayerDepth > 0) {
    captureCurrentTabViewState();
    currentLayerDepth = 0;
    renderActiveGraph("已切换为显示全部层级");
    return;
  }
  currentLayerDepth = 0;
  syncLayerVisibility("已切换为显示全部层级");
});

if (branchExtractModeSelect) {
  branchExtractModeSelect.addEventListener("change", () => {
    updateBranchExtractModePanelVisibility();
    updateFreeModePanelVisibility();
    applyBranchSelectionEnabled();
    updateSubgraphSelectionInfo();
  });
}

if (branchModeSelect) {
  branchModeSelect.addEventListener("change", () => {
    updateFreeModePanelVisibility();
    updateSubgraphSelectionInfo();
  });
}

newCustomViewBtn?.addEventListener("click", () => {
  branchControlsEnabled = true;
  ensureCustomViewSectionVisible();
  updateSubgraphSelectionInfo();
});

extractSubgraphBtn?.addEventListener("click", extractSubgraphByNode);
extractLayerBtn?.addEventListener("click", extractByLayer);
subUpLevelInput?.addEventListener("change", updateSubgraphSelectionInfo);
subDownLevelInput?.addEventListener("change", updateSubgraphSelectionInfo);
layerUpLevelInput?.addEventListener("change", updateSubgraphSelectionInfo);
layerDownLevelInput?.addEventListener("change", updateSubgraphSelectionInfo);

window.addEventListener("resize", () => {
  if (!renderer.hasGraph()) return;
  captureCurrentTabViewState();
  const activeTab = getActiveGraphTab();
  const savedState = activeTab ? getStoredViewStateForTab(activeTab.id, getCurrentViewKey()) : null;
  if (!renderer.restoreViewState(savedState, getCurrentViewKey())) {
    renderer.fitToView();
  }
});

for (const option of NODE_SIZE_MODE_OPTIONS) {
  if (!Array.from(nodeSizeModeSelect.options).some((existing) => existing.value === option.value)) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    nodeSizeModeSelect.append(el);
  }
}

updateNodeTextModeInfo();
updateNodeSizeModeInfo();
updateRenderModeInfo();
updateLayerDepthControls();
updateBranchExtractModePanelVisibility();
updateFreeModePanelVisibility();
updateSubgraphSelectionInfo();
loadDefaultGraph();
