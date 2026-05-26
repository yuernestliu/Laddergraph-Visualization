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
import { buildNodeDetailIndex as buildRowNodeDetailIndex, getNodeDetail } from "./app/csv-node-details.js";
import { createEditModeController } from "./app/edit-mode.js";
import { GraphTabStateStore } from "./app/graph-tab-state-store.js";
import { buildLadderonNodeInfoIndex } from "./app/ladderon-node-info.js";
import { clampLayerDepth, getLayerDepthLabel, getSuggestedLayerDepth, getTrimmedLayerCount } from "./app/layer-utils.js";
import {
  renderGraphTabs as renderGraphTabsUi,
  setStatus as setStatusUi,
  updateLabelFontSizeControl,
  updateLayerDepthControls as updateLayerDepthControlsUi,
  updateMinComponentSizeControl,
  updateNodeDetailPanel,
  updateNodeSizeModeInfo as updateNodeSizeModeInfoUi,
  updateNodeTextModeInfo as updateNodeTextModeInfoUi,
  updateRenderModeInfo as updateRenderModeInfoUi,
} from "./app/ui.js";

const RENDER_API_PATH = "/api/render";
const DEFAULT_NODE_SIZE_MODE = "sqrt";
const DEFAULT_LABEL_FONT_SIZE = 10;
const MIN_LABEL_FONT_SIZE = 6;
const MAX_LABEL_FONT_SIZE = 24;
const AUTO_LAYER_NODE_THRESHOLD = 180;
const AUTO_LAYER_EDGE_THRESHOLD = 320;
const NODE_TEXT_MODES = ["label", "id", "none"];

const fileInput = document.getElementById("fileInput");
const renderBtn = document.getElementById("renderBtn");
const nodeDetailCsvInput = document.getElementById("nodeDetailCsvInput");
const importNodeDetailCsvBtn = document.getElementById("importNodeDetailCsvBtn");
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
const nodeTextModeSelect = document.getElementById("nodeTextModeSelect");
const nodeTextModeInfo = document.getElementById("nodeTextModeInfo");
const labelFontSizeInput = document.getElementById("labelFontSizeInput");
const labelFontSizeDownBtn = document.getElementById("labelFontSizeDownBtn");
const labelFontSizeUpBtn = document.getElementById("labelFontSizeUpBtn");
const nodeSizeModeSelect = document.getElementById("nodeSizeModeSelect");
const nodeSizeModeInfo = document.getElementById("nodeSizeModeInfo");
const nodeInfoStatus = document.getElementById("nodeInfoStatus");
const editModeBtn = document.getElementById("editModeBtn");
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

const renderer = new GraphvizSvgRenderer(networkEl, {
  onSelectionChange: (nodeId) => updateSelectedNodeDetail(nodeId),
});
const tabStateStore = new GraphTabStateStore();
export const editModeController = createEditModeController({
  rootEl: networkShell,
  toggleButton: editModeBtn,
  disabledRoot: appRoot,
});
editModeController.mount();

if (nodeSizeModeSelect) {
  nodeSizeModeSelect.value = DEFAULT_NODE_SIZE_MODE;
}

if (minComponentSizeInput) {
  minComponentSizeInput.value = String(DEFAULT_MIN_COMPONENT_SIZE);
}

if (labelFontSizeInput) {
  labelFontSizeInput.value = String(DEFAULT_LABEL_FONT_SIZE);
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
let labelFontSize = DEFAULT_LABEL_FONT_SIZE;
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
    labelFontSize,
    nodeSizeMode,
    layerDepth <= 0 ? "depth:all" : `depth:-${layerDepth}`,
  ].join("|");
}

function buildRenderKey(renderedDepth = currentRenderedLayerDepth) {
  return [
    currentEffectiveLayoutMode,
    currentRenderProfile,
    nodeTextMode,
    labelFontSize,
    nodeSizeMode,
    renderedDepth <= 0 ? "render:all" : `render:-${renderedDepth}`,
  ].join("|");
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
  tabStateStore.reset();
  renderer.clear();
  updateMinComponentSizeInfo();
  updateLabelFontSizeInfo();
  updateNodeInfoStatus();
  updateSelectedNodeDetail(null);
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
  updateNodeTextModeInfoUi(nodeTextModeInfo, nodeTextModeSelect, {
    currentRenderProfile,
    nodeTextMode,
  });
}

function updateNodeInfoStatus() {
  if (!nodeInfoStatus) return;
  const infoCount = currentNodeDetailIndex?.entriesById?.size || 0;
  const hasInfo = infoCount > 0;
  nodeInfoStatus.textContent = hasInfo ? `节点信息：有（${infoCount} 项）` : "节点信息：无";
  nodeInfoStatus.classList.toggle("has-info", hasInfo);
}

function updateNodeSizeModeInfo() {
  updateNodeSizeModeInfoUi(nodeSizeModeInfo, nodeSizeMode, formatNodeSizeModeLabel);
}

function updateLabelFontSizeInfo() {
  updateLabelFontSizeControl(
    {
      labelFontSizeInput,
      labelFontSizeDownBtn,
      labelFontSizeUpBtn,
    },
    {
      labelFontSize,
      minLabelFontSize: MIN_LABEL_FONT_SIZE,
      maxLabelFontSize: MAX_LABEL_FONT_SIZE,
    },
  );
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

function buildBestNodeDetailIndex(csvText) {
  const ladderonIndex = buildLadderonNodeInfoIndex(csvText);
  if (ladderonIndex.supported && ladderonIndex.entriesById.size > 0) {
    return ladderonIndex;
  }
  return buildRowNodeDetailIndex(csvText);
}

async function loadNodeDetailsForGraph(sourceName) {
  currentNodeDetailIndex = null;
  currentNodeDetailSource = "";
  currentNodeDetailStatus = "正在查找同名 CSV...";
  updateNodeInfoStatus();
  updateSelectedNodeDetail(null);

  for (const candidate of getCsvCandidatesForGraph(sourceName)) {
    try {
      const response = await fetch(encodeURI(candidate), { cache: "no-store" });
      if (!response.ok) continue;

      const csvText = await response.text();
      currentNodeDetailIndex = buildBestNodeDetailIndex(csvText);
      currentNodeDetailSource = candidate;
      currentNodeDetailStatus =
        `已加载 ${candidate}；${currentNodeDetailIndex.entriesById.size} 条详情。`;
      updateNodeInfoStatus();
      updateSelectedNodeDetail(selectedNodeId);
      return;
    } catch (error) {
      console.warn(`Failed to load CSV details from ${candidate}:`, error);
    }
  }

  currentNodeDetailStatus = "没有找到同名 CSV。";
  updateNodeInfoStatus();
  updateSelectedNodeDetail(selectedNodeId);
}

async function loadNodeDetailsFromFile(file) {
  if (!file) return;

  try {
    const csvText = await file.text();
    currentNodeDetailIndex = buildBestNodeDetailIndex(csvText);
    currentNodeDetailSource = file.name;
    currentNodeDetailStatus =
      `已导入节点信息：${file.name}；${currentNodeDetailIndex.entriesById.size} 条详情。`;
    updateNodeInfoStatus();
    updateSelectedNodeDetail(selectedNodeId);
  } catch (error) {
    currentNodeDetailIndex = null;
    currentNodeDetailStatus = `节点信息导入失败：${error.message}`;
    updateNodeInfoStatus();
    updateSelectedNodeDetail(selectedNodeId);
    setStatus(currentNodeDetailStatus, true);
    console.error(error);
  }
}

function getMinComponentThreshold() {
  return Math.max(0, minComponentSize - 1);
}

function normalizeMinComponentSize(value) {
  const parsed = Number.parseInt(value, 10);
  return Math.max(DEFAULT_MIN_COMPONENT_SIZE, Number.isFinite(parsed) ? parsed : DEFAULT_MIN_COMPONENT_SIZE);
}

function normalizeLabelFontSize(value) {
  const parsed = Number.parseInt(value, 10);
  const safeValue = Number.isFinite(parsed) ? parsed : DEFAULT_LABEL_FONT_SIZE;
  return Math.max(MIN_LABEL_FONT_SIZE, Math.min(MAX_LABEL_FONT_SIZE, safeValue));
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
  if (!sourceParsedGraph) return;
  renderActiveGraph("已切换最小网络规模");
}

function stepMinComponentSize(delta) {
  applyMinComponentSize(minComponentSize + delta);
}

function applyLabelFontSize(nextSize) {
  const normalizedSize = normalizeLabelFontSize(nextSize);
  if (labelFontSize === normalizedSize) {
    updateLabelFontSizeInfo();
    return;
  }

  captureCurrentTabViewState();
  labelFontSize = normalizedSize;
  updateLabelFontSizeInfo();
  if (!sourceParsedGraph) return;
  renderActiveGraph("已切换 Label 字号");
}

function stepLabelFontSize(delta) {
  applyLabelFontSize(labelFontSize + delta);
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
  currentRenderedSubgraph = currentTabBaseSubgraph;
  currentSubgraph = currentTabBaseSubgraph;
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
    setStatus(
      sourceParsedGraph ? "当前过滤后没有可显示的网络。" : "当前没有可渲染的子图。",
      false,
    );
    return;
  }

  primeRenderableComponent(activeTab);

  currentGraphStats = summarizeGraph(currentRenderedSubgraph);
  currentRenderProfile = getEffectiveRenderProfile(currentGraphStats, getRequestedRenderMode());
  currentEffectiveLayoutMode = getEffectiveLayoutMode(getRequestedLayoutMode(), currentRenderProfile);

  updateRenderModeInfo();
  updateNodeTextModeInfo();
  updateNodeSizeModeInfo();
  updateLabelFontSizeInfo();
  updateLayerDepthControls();
  renderGraphTabs();

  const { dot, engine } = serializeGraphToDot(currentRenderedSubgraph, {
    renderProfile: currentRenderProfile,
    layoutMode: currentEffectiveLayoutMode,
    nodeTextMode,
    labelFontSize,
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
      labelFontSize,
    });

    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    const savedState = tabStateStore.getViewState(activeTab.id, currentViewKey);
    const restoredViewport = renderer.restoreViewState(savedState, currentViewKey);
    if (!restoredViewport) {
      renderer.fitToView();
    }
    if (!savedState?.selectedNodeId && selectedNodeId && renderer.hasNode(selectedNodeId)) {
      renderer.applySelectionHighlight(selectedNodeId);
    }

    tabStateStore.setViewState(activeTab.id, currentViewKey, renderer.getViewState(currentViewKey));
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
    currentGraphStats = summarizeGraph(sourceParsedGraph);
    tabStateStore.reset();
    layerDepthIsAuto = true;
    refreshLayerState({ resetDepth: true });
    rebuildDisplayComponents({ preserveActive: false });
    updateMinComponentSizeInfo();
    renderActiveGraph(statusPrefix);
  } catch (error) {
    renderer.clear();
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

if (importNodeDetailCsvBtn && nodeDetailCsvInput) {
  importNodeDetailCsvBtn.addEventListener("click", () => {
    nodeDetailCsvInput.click();
  });

  nodeDetailCsvInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    await loadNodeDetailsFromFile(file);
    nodeDetailCsvInput.value = "";
  });
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

if (nodeTextModeSelect) {
  nodeTextModeSelect.addEventListener("change", () => {
    const nextMode = nodeTextModeSelect.value;
    if (currentRenderProfile === "overview" || !NODE_TEXT_MODES.includes(nextMode)) return;
    if (nodeTextMode === nextMode) return;
    captureCurrentTabViewState();
    nodeTextMode = nextMode;
    renderActiveGraph("已切换节点文本");
  });
}

if (labelFontSizeInput) {
  labelFontSizeInput.addEventListener("change", () => {
    applyLabelFontSize(labelFontSizeInput.value);
  });

  labelFontSizeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyLabelFontSize(labelFontSizeInput.value);
    }
  });
}

if (labelFontSizeDownBtn) {
  labelFontSizeDownBtn.addEventListener("click", () => stepLabelFontSize(-1));
}

if (labelFontSizeUpBtn) {
  labelFontSizeUpBtn.addEventListener("click", () => stepLabelFontSize(1));
}

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
updateLabelFontSizeInfo();
updateMinComponentSizeInfo();
updateRenderModeInfo();
updateLayerDepthControls();
loadDefaultGraph();
