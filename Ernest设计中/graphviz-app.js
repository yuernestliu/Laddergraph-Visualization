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

const renderer = new GraphvizSvgRenderer(networkEl);

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

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.hidden = !message;
  statusEl.style.color = isError ? "#c92a2a" : "#6b7280";
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
  renderer.clear();
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

  const totalStats = currentTabBaseSubgraph ? summarizeGraph(currentTabBaseSubgraph) : activeTab.stats;
  const visibleStats = currentSubgraph ? summarizeGraph(currentSubgraph) : totalStats;
  const totalLayers = Math.max(1, currentLayerMaxDepth + 1);
  const visibleLayers = Math.max(1, totalLayers - getTrimmedLayerCount(currentLayerDepth, currentLayerMaxDepth));

  graphTabsInfo.textContent =
    `层级 ${visibleLayers}/${totalLayers}。` +
    `共 ${totalStats.nodeCount} 节点 / ${totalStats.edgeCount} 边；` +
    `目前显示：${visibleStats.nodeCount} 节点 / ${visibleStats.edgeCount} 边。`;

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
    sourceParsedGraph = sanitizeParsedGraph(parseDot(currentDotText));
    currentGraphTabs = buildGraphTabs(sourceParsedGraph);
    activeGraphTabId = currentGraphTabs[0]?.id || null;
    currentGraphStats = summarizeGraph(sourceParsedGraph);
    graphTabViewState = new Map();
    graphTabDepthState = new Map();
    graphTabRenderedDepthState = new Map();
    graphTabRenderCache = new Map();
    renderActiveGraph(statusPrefix);
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
  const activeTab = getActiveGraphTab();
  if (!activeTab || !sourceParsedGraph) return;
  const nextDepth = Math.min(currentLayerMaxDepth, currentLayerDepth + 1);
  setStoredLayerDepthForTab(activeTab.id, nextDepth, currentLayerMaxDepth);
  currentLayerDepth = nextDepth;
  syncLayerVisibility(`已切换显示层级：${getLayerDepthLabel(nextDepth, currentLayerMaxDepth)}`);
});

layerDepthUpBtn.addEventListener("click", () => {
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
loadDefaultGraph();
