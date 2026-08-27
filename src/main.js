import {
  DEFAULT_DOT_DISPLAY_PATH,
  DEFAULT_DOT_PATH,
  DEFAULT_NODE_DETAILS_DISPLAY_PATH,
  DEFAULT_NODE_DETAILS_PATH,
  NODE_SIZE_MODE_OPTIONS,
  applyVisibleSubgraphFilters,
  buildNodeLayerMap,
  cleanId,
  parseDot,
  sanitizeParsedGraph,
  serializeGraphToDot,
  summarizeGraph,
} from "./core/graphviz-core.js";
import { GraphvizRenderClient } from "./app/graphviz-render-client.js";
import { GraphvizSvgRenderer } from "./rendering/graphviz-svg-renderer.js";
import {
  DEFAULT_MIN_COMPONENT_SIZE,
  MAX_INLINE_COMPONENT_TABS,
  buildDisplayComponentState,
  getSubgraphForDisplayComponent,
} from "./app/display-components.js";
import { getNodeDetail } from "./app/csv-node-details.js";
import { createEditModeController } from "./app/edit-mode/edit-controller.js";
import { createGenePairExportController } from "./app/gene-pair-export/gene-pair-export.js";
import { GraphTabStateStore } from "./app/graph-tab-state-store.js";
import { clampLayerDepth, getLayerDepthLabel, getSuggestedLayerDepth, getTrimmedLayerCount } from "./app/layer-utils.js";
import { buildBestNodeDetailIndex, getSameNameCsvCandidate } from "./app/node-info-source.js";
import { createLoadGenerationTracker } from "./app/load-generation.js";
import { createRefineModeController } from "./app/refine-mode/refine-controller.js";
import { isCurrentRender } from "./app/render-token.js";
import {
  renderGraphTabs as renderGraphTabsUi,
  setStatus as setStatusUi,
  syncNodeTextModeSelect,
  updateLabelFontSizeControl,
  updateLayerDepthControls as updateLayerDepthControlsUi,
  updateMinComponentSizeControl,
  updateNodeDetailPanel,
} from "./app/ui.js";

const DEFAULT_NODE_SIZE_MODE = "sqrt";
const DEFAULT_LABEL_FONT_SIZE = 10;
const MIN_LABEL_FONT_SIZE = 6;
const MAX_LABEL_FONT_SIZE = 24;
const AUTO_LAYER_NODE_THRESHOLD = 180;
const AUTO_LAYER_EDGE_THRESHOLD = 320;
const NODE_TEXT_MODES = ["label", "id", "none"];

const fileInput = document.getElementById("fileInput");
const renderBtn = document.getElementById("renderBtn");
const nodeDetailFileInput = document.getElementById("nodeDetailFileInput");
const importNodeDetailCsvBtn = document.getElementById("importNodeDetailCsvBtn");
const nodeInfoFallbackDialog = document.getElementById("nodeInfoFallbackDialog");
const nodeInfoFallbackMessage = document.getElementById("nodeInfoFallbackMessage");
const chooseNodeDetailFileBtn = document.getElementById("chooseNodeDetailFileBtn");
const appRoot = document.getElementById("appRoot");
const statusEl = document.getElementById("status");
const layoutSelect = document.getElementById("layoutSelect");
const applyLayoutBtn = document.getElementById("applyLayoutBtn");
const graphTabsEl = document.getElementById("graphTabs");
const graphComponentSelect = document.getElementById("graphComponentSelect");
const graphTabsInfo = document.getElementById("graphTabsInfo");
const omittedSingleTargetsSummary = document.getElementById("omittedSingleTargetsSummary");
const omittedSingleTargetsText = document.getElementById("omittedSingleTargetsText");
const nodeSearchForm = document.getElementById("nodeSearchForm");
const nodeSearchInput = document.getElementById("nodeSearchInput");
const nodeSearchFeedback = document.getElementById("nodeSearchFeedback");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const fitViewBtn = document.getElementById("fitViewBtn");
const nodeTextModeSelect = document.getElementById("nodeTextModeSelect");
const labelFontSizeInput = document.getElementById("labelFontSizeInput");
const labelFontSizeDownBtn = document.getElementById("labelFontSizeDownBtn");
const labelFontSizeUpBtn = document.getElementById("labelFontSizeUpBtn");
const nodeSizeModeSelect = document.getElementById("nodeSizeModeSelect");
const nodeInfoStatus = document.getElementById("nodeInfoStatus");
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
const nodeDetailTitle = document.getElementById("nodeDetailTitle");
const nodeDetailMeta = document.getElementById("nodeDetailMeta");
const nodeDetailBody = document.getElementById("nodeDetailBody");
const genePairExportPanel = document.getElementById("genePairExportPanel");
const networkShell = document.getElementById("networkShell");
const networkEl = document.getElementById("network");

let refineModeController = null;
let genePairExportController = null;
const renderer = new GraphvizSvgRenderer(networkEl, {
  onNodeClick: (detail) => genePairExportController?.handleNodeClick(detail) || false,
  onSelectionChange: (nodeId) => {
    updateSelectedNodeDetail(nodeId);
    refineModeController?.setSelectedNode(nodeId);
    genePairExportController?.setPrimaryNode(nodeId);
  },
});
const tabStateStore = new GraphTabStateStore();
const graphvizRenderClient = new GraphvizRenderClient();
const loadGenerationTracker = createLoadGenerationTracker();
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
});
refineModeController.mount();
export { refineModeController };

genePairExportController = createGenePairExportController({
  panelRoot: genePairExportPanel,
  renderer,
  getNodeDetail: (nodeId) => getNodeDetail(currentNodeDetailIndex, nodeId),
});
export { genePairExportController };

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
let currentLayoutMode = "hierarchicalTB";
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
let currentGraphSource = null;
let currentNodeDetailIndex = null;
let currentNodeDetailSource = "";
let currentNodeDetailStatus = "点击图中的节点查看节点信息详情。";
let selectedNodeId = null;
let nodeSearchRequestToken = 0;

function setStatus(message, isError = false) {
  setStatusUi(statusEl, message, isError);
}

function setNodeSearchFeedback(message, state = "") {
  if (!nodeSearchFeedback) return;
  nodeSearchFeedback.textContent = message;
  nodeSearchFeedback.dataset.state = state;
}

function resetNodeSearch({ clearInput = true } = {}) {
  nodeSearchRequestToken += 1;
  if (clearInput && nodeSearchInput) nodeSearchInput.value = "";
  setNodeSearchFeedback("");
}

function getGraphTabContainingNode(nodeId) {
  return currentGraphTabs.find((tab) => tab.nodeSet.has(nodeId)) || null;
}

async function locateNodeById(rawNodeId) {
  const requestToken = ++nodeSearchRequestToken;
  const nodeId = cleanId(rawNodeId);

  if (!nodeId) {
    setNodeSearchFeedback("请输入完整的节点 ID。", "error");
    nodeSearchInput?.focus();
    return;
  }

  if (!sourceParsedGraph) {
    setNodeSearchFeedback("请先导入并渲染一个图。", "error");
    return;
  }

  const sourceNodeExists = sourceParsedGraph.nodes.some((node) => node.id === nodeId);
  if (!sourceNodeExists) {
    setNodeSearchFeedback("不存在此ID", "error");
    return;
  }

  const targetTab = getGraphTabContainingNode(nodeId);
  if (!targetTab) {
    setNodeSearchFeedback("未进入任一标签页", "warning");
    return;
  }

  captureCurrentTabViewState();
  if (nodeSearchInput) nodeSearchInput.value = nodeId;
  activeGraphTabId = targetTab.id;
  const renderSucceeded = await renderActiveGraph(`正在定位 ID ${nodeId}`);
  if (requestToken !== nodeSearchRequestToken) return;
  if (!renderSucceeded) {
    setNodeSearchFeedback(`无法定位 ID ${nodeId}：图形渲染未完成。`, "error");
    return;
  }

  if (!renderer.hasNode(nodeId)) {
    setNodeSearchFeedback(
      `ID ${nodeId} 位于标签页“${targetTab.label}”，但当前精修结果没有显示它。`,
      "warning",
    );
    return;
  }

  renderer.applySelectionHighlight(nodeId);
  captureCurrentTabViewState();
  setNodeSearchFeedback(
    `已在标签页“${targetTab.label}”标出 ID ${nodeId}。`,
    "success",
  );
}

function getRequestedLayoutMode() {
  return layoutSelect?.value || "hierarchicalTB";
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

function getRefineProjectionSignature() {
  return refineModeController?.getProjectionSignature() || "refine:none";
}

function buildViewKey(layerDepth = currentLayerDepth) {
  return [
    currentLayoutMode,
    nodeTextMode,
    labelFontSize,
    nodeSizeMode,
    getRefineProjectionSignature(),
    layerDepth <= 0 ? "depth:all" : `depth:-${layerDepth}`,
  ].join("|");
}

function buildRenderKey(renderedDepth = currentRenderedLayerDepth) {
  return [
    currentLayoutMode,
    nodeTextMode,
    labelFontSize,
    nodeSizeMode,
    getRefineProjectionSignature(),
    renderedDepth <= 0 ? "render:all" : `render:-${renderedDepth}`,
  ].join("|");
}

function clearGraph({ preserveNodeDetails = false } = {}) {
  resetNodeSearch();
  sourceParsedGraph = null;
  currentGraphStats = null;
  currentDisplayComponentState = null;
  currentDisplayGraph = null;
  currentGraphTabs = [];
  activeGraphTabId = null;
  currentLayoutMode = "hierarchicalTB";
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
  currentGraphSource = null;
  if (!preserveNodeDetails) {
    currentNodeDetailIndex = null;
    currentNodeDetailSource = "";
    currentNodeDetailStatus = "点击图中的节点查看节点信息详情。";
  }
  selectedNodeId = null;
  tabStateStore.reset();
  refineModeController?.clear();
  genePairExportController?.clearPair();
  renderer.clear();
  updateMinComponentSizeInfo();
  updateLabelFontSizeInfo();
  updateNodeInfoStatus();
  updateSelectedNodeDetail(null);
}

function updateNodeInfoStatus() {
  if (!nodeInfoStatus) return;
  const infoCount = currentNodeDetailIndex?.entriesById?.size || 0;
  const hasInfo = infoCount > 0;
  nodeInfoStatus.textContent = hasInfo ? `节点信息：有（${infoCount} 项）` : "节点信息：无";
  nodeInfoStatus.classList.toggle("has-info", hasInfo);
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
  const hasNodeInfo = Boolean(currentNodeDetailIndex);

  updateNodeDetailPanel(
    {
      nodeDetailTitle,
      nodeDetailMeta,
      nodeDetailBody,
    },
    {
      nodeId: selectedNodeId,
      detail,
      detailStatus: currentNodeDetailStatus,
      emptyMessage: currentNodeDetailStatus || "点击图中的节点查看详情。",
      missingMessage: hasNodeInfo
        ? `节点信息中没有找到 ID ${selectedNodeId}。`
        : currentNodeDetailStatus,
    },
  );
}

function refreshNodeDetailViews() {
  updateNodeInfoStatus();
  genePairExportController?.refresh();
  updateSelectedNodeDetail(selectedNodeId);
}

function resetNodeDetails(status = "点击“导入节点信息”查找同目录 CSV。") {
  currentNodeDetailIndex = null;
  currentNodeDetailSource = "";
  currentNodeDetailStatus = status;
  selectedNodeId = null;
  refreshNodeDetailViews();
}

function applyNodeDetailText(nodeInfoText, sourceName, action = "已导入节点信息") {
  currentNodeDetailIndex = buildBestNodeDetailIndex(nodeInfoText, sourceName);
  currentNodeDetailSource = sourceName;
  currentNodeDetailStatus =
    `${action}：${sourceName}；${currentNodeDetailIndex.entriesById.size} 条详情。`;
  refreshNodeDetailViews();
}

function showNodeInfoFallback(message) {
  if (nodeInfoFallbackDialog?.showModal) {
    nodeInfoFallbackMessage.textContent = message;
    if (!nodeInfoFallbackDialog.open) nodeInfoFallbackDialog.showModal();
    return;
  }

  window.alert(message);
  nodeDetailFileInput?.click();
}

async function tryLoadSameNameCsv(
  sourceName,
  candidateOverride = "",
  displayNameOverride = "",
  loadToken = loadGenerationTracker.beginNodeInfoAction("same-name-csv"),
) {
  const candidate = candidateOverride || getSameNameCsvCandidate(sourceName);
  const displayName = displayNameOverride || candidate;
  if (!candidate) {
    return { outcome: "missing", candidate: "" };
  }

  if (!loadGenerationTracker.isCurrentNodeInfo(loadToken)) {
    return { outcome: "stale", candidate };
  }
  currentNodeDetailStatus = `正在同目录查找 ${displayName}...`;
  refreshNodeDetailViews();

  try {
    const response = await fetch(encodeURI(candidate), { cache: "no-store" });
    if (!loadGenerationTracker.isCurrentNodeInfo(loadToken)) {
      return { outcome: "stale", candidate };
    }
    if (!response.ok) {
      if (!currentNodeDetailIndex) {
        currentNodeDetailStatus = `同目录没有找到 ${displayName}。`;
        refreshNodeDetailViews();
      }
      return { outcome: "missing", candidate };
    }

    const nodeInfoText = await response.text();
    if (!loadGenerationTracker.isCurrentNodeInfo(loadToken)) {
      return { outcome: "stale", candidate };
    }
    applyNodeDetailText(nodeInfoText, displayName, "已自动导入节点信息");
    return { outcome: "loaded", candidate };
  } catch (error) {
    if (!loadGenerationTracker.isCurrentNodeInfo(loadToken)) {
      return { outcome: "stale", candidate };
    }
    if (!currentNodeDetailIndex) {
      currentNodeDetailStatus = `读取 ${displayName} 失败：${error.message}`;
      refreshNodeDetailViews();
    }
    console.warn(`Failed to load node details from ${candidate}:`, error);
    return { outcome: "error", candidate, error };
  }
}

async function loadNodeDetailsFromFile(file) {
  if (!file) return;
  const loadToken = loadGenerationTracker.beginNodeInfoAction(`manual-node-info:${file.name}`);

  try {
    const nodeInfoText = await file.text();
    if (!loadGenerationTracker.isCurrentNodeInfo(loadToken)) return;
    applyNodeDetailText(nodeInfoText, file.name);
  } catch (error) {
    if (!loadGenerationTracker.isCurrentNodeInfo(loadToken)) return;
    currentNodeDetailIndex = null;
    currentNodeDetailSource = "";
    currentNodeDetailStatus = `节点信息导入失败：${error.message}`;
    refreshNodeDetailViews();
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

function rebuildLayerMeta() {
  currentLayerMeta = sourceParsedGraph ? buildNodeLayerMap(sourceParsedGraph) : null;
  currentLayerMaxDepth = currentLayerMeta?.maxDepth || 0;
}

// The layer map depends only on the source graph, so it is rebuilt once per load in
// renderGraph(). Only the suggested depth depends on the current M threshold, so
// stepping M must not pay for a full re-layering of a 10k+ node graph.
function refreshLayerState({ resetDepth = false } = {}) {
  if (!sourceParsedGraph || !currentLayerMeta) {
    currentLayerMeta = null;
    currentLayerDepth = 0;
    currentLayerMaxDepth = 0;
    currentAutoLayerDepth = 0;
    return;
  }

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
  currentDisplayComponentState = buildDisplayComponentState(currentDisplayGraph, {
    minComponentSize,
    sourceParsedGraph,
  });
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
  resetNodeSearch({ clearInput: false });
  minComponentSize = normalizeMinComponentSize(nextSize);

  if (sourceParsedGraph) {
    refreshLayerState();
    rebuildDisplayComponents({ preserveActive: true });
  }

  updateMinComponentSizeInfo();
  if (!sourceParsedGraph) return;
  renderActiveGraph("已更新视图过滤：隐藏节点数 < n 的图");
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
  resetNodeSearch({ clearInput: false });
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
  resetNodeSearch({ clearInput: false });
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
    },
    {
      hasGraph: Boolean(sourceParsedGraph && currentTabBaseSubgraph),
      currentLayerDepth,
      currentLayerMaxDepth,
      currentAutoLayerDepth,
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
    currentLayerMaxDepth,
    currentLayerDepth,
    sourceParsedGraph,
    getTrimmedLayerCount,
    maxInlineTabs: MAX_INLINE_COMPONENT_TABS,
    omittedSingleTargetIds: currentDisplayComponentState?.omittedSingleTargetIds || [],
    omittedSingleTargetSummaryEls: {
      summaryEl: omittedSingleTargetsSummary,
      textEl: omittedSingleTargetsText,
    },
    onSelectTab: (tab) => {
      if (tab.id === activeGraphTabId) return;
      captureCurrentTabViewState();
      resetNodeSearch({ clearInput: false });
      activeGraphTabId = tab.id;
      renderActiveGraph(`已切换到 ${tab.label}`);
    },
  });
}

async function requestSvgRender(dot, engine) {
  return graphvizRenderClient.render(dot, engine);
}

function primeRenderableComponent(activeTab) {
  currentTabBaseSubgraph = getSubgraphForDisplayComponent(currentDisplayGraph, activeTab);
  currentRenderedLayerDepth = currentLayerDepth;
  currentRenderedSubgraph = refineModeController?.projectGraph(currentTabBaseSubgraph) || currentTabBaseSubgraph;
  currentSubgraph = currentRenderedSubgraph;
}

function handleRefineProjectionChange(reason = "") {
  if (!sourceParsedGraph) return;
  captureCurrentTabViewState();
  resetNodeSearch({ clearInput: false });
  renderActiveGraph(reason ? `已应用精修：${reason}` : "已应用精修");
}

async function renderActiveGraph(statusPrefix = "") {
  ensureActiveGraphTab();
  const activeTab = getActiveGraphTab();

  if (!sourceParsedGraph || !activeTab) {
    currentRenderToken += 1;
    graphvizRenderClient.cancel("当前图已清空。");
    renderer.clear();
    currentTabBaseSubgraph = null;
    currentSubgraph = null;
    currentRenderedSubgraph = null;
    updateLayerDepthControls();
    renderGraphTabs();
    setStatus(
      sourceParsedGraph ? "当前过滤后没有可显示的网络。" : "当前没有可渲染的子图。",
      false,
    );
    return false;
  }

  primeRenderableComponent(activeTab);

  currentGraphStats = summarizeGraph(currentRenderedSubgraph);
  currentLayoutMode = getRequestedLayoutMode();

  syncNodeTextModeSelect(nodeTextModeSelect, nodeTextMode);
  updateLabelFontSizeInfo();
  updateLayerDepthControls();
  renderGraphTabs();

  const { dot, engine } = serializeGraphToDot(currentRenderedSubgraph, {
    layoutMode: currentLayoutMode,
    nodeTextMode,
    labelFontSize,
    nodeSizeMode,
    sizeSourceNodes: currentTabBaseSubgraph.nodes,
  });
  const currentViewKey = getCurrentViewKey();
  const currentRenderKey = buildRenderKey(currentRenderedLayerDepth);
  const cachedRender = tabStateStore.getRenderCache(activeTab.id, currentRenderKey);

  const renderToken = ++currentRenderToken;
  if (cachedRender) {
    graphvizRenderClient.cancel("已使用本地渲染缓存。");
  }
  renderer.setLoading(true);
  setStatus("渲染中...");

  try {
    const svgMarkup = cachedRender?.svgMarkup || (await requestSvgRender(dot, engine));
    if (renderToken !== currentRenderToken) return false;

    if (!cachedRender) {
      tabStateStore.setRenderCache(activeTab.id, currentRenderKey, { svgMarkup });
    }

    renderer.render({
      svgMarkup,
      parsed: currentRenderedSubgraph,
      nodeTextMode,
      labelFontSize,
    });

    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    if (!isCurrentRender(renderToken, currentRenderToken)) return false;

    const savedState = tabStateStore.getViewState(activeTab.id, currentViewKey);
    const restoredViewport = renderer.restoreViewState(savedState, currentViewKey);
    if (!restoredViewport) {
      renderer.fitToView();
    }
    if (!savedState?.selectedNodeId && selectedNodeId && renderer.hasNode(selectedNodeId)) {
      renderer.applySelectionHighlight(selectedNodeId);
    }
    genePairExportController?.refresh();

    tabStateStore.setViewState(activeTab.id, currentViewKey, renderer.getViewState(currentViewKey));
    setStatus("");
    return true;
  } catch (error) {
    if (error?.name === "AbortError") return false;
    if (!isCurrentRender(renderToken, currentRenderToken)) return false;
    renderer.clear();
    currentSubgraph = null;
    updateLayerDepthControls();
    renderGraphTabs();
    setStatus(
      `${statusPrefix ? `${statusPrefix}；` : ""}渲染失败：${error.message}`,
      true,
    );
    console.error(error);
    return false;
  } finally {
    if (renderToken === currentRenderToken) {
      renderer.setLoading(false);
    }
  }
}

function renderGraph(statusPrefix = "") {
  resetNodeSearch();
  try {
    sourceParsedGraph = sanitizeParsedGraph(parseDot(currentDotText));
    currentGraphStats = summarizeGraph(sourceParsedGraph);
    tabStateStore.reset();
    refineModeController?.clear();
    genePairExportController?.clearPair();
    layerDepthIsAuto = true;
    rebuildLayerMeta();
    refreshLayerState({ resetDepth: true });
    rebuildDisplayComponents({ preserveActive: false });
    updateMinComponentSizeInfo();
    renderActiveGraph(statusPrefix);
  } catch (error) {
    currentRenderToken += 1;
    graphvizRenderClient.cancel("DOT 解析失败，已停止旧渲染任务。");
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
  resetNodeSearch({ clearInput: false });
  renderActiveGraph(`已应用布局：${layoutSelect.options[layoutSelect.selectedIndex].text}`);
}

async function loadDefaultGraph() {
  const defaultLoad = loadGenerationTracker.beginGraphAction("default-graph");
  try {
    const response = await fetch(DEFAULT_DOT_PATH, { cache: "no-store" });
    if (!loadGenerationTracker.isCurrentGraph(defaultLoad.graphToken)) return;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const dotText = await response.text();
    if (!loadGenerationTracker.isCurrentGraph(defaultLoad.graphToken)) return;
    currentDotText = dotText;
    currentGraphSource = {
      kind: "url",
      sourceName: DEFAULT_DOT_PATH,
      nodeDetailsSourceName: DEFAULT_NODE_DETAILS_PATH,
      nodeDetailsDisplayName: DEFAULT_NODE_DETAILS_DISPLAY_PATH,
    };
    if (loadGenerationTracker.isCurrentNodeInfo(defaultLoad.nodeInfoToken)) {
      resetNodeDetails();
      await tryLoadSameNameCsv(
        DEFAULT_DOT_PATH,
        DEFAULT_NODE_DETAILS_PATH,
        DEFAULT_NODE_DETAILS_DISPLAY_PATH,
        defaultLoad.nodeInfoToken,
      );
    }
    if (!loadGenerationTracker.isCurrentGraph(defaultLoad.graphToken)) return;
    renderGraph(`已加载默认图：${DEFAULT_DOT_DISPLAY_PATH}`);
  } catch (error) {
    if (!loadGenerationTracker.isCurrentGraph(defaultLoad.graphToken)) return;
    currentDotText = "";
    clearGraph({
      preserveNodeDetails: !loadGenerationTracker.isCurrentNodeInfo(defaultLoad.nodeInfoToken),
    });
    renderGraphTabs();
    setStatus(`默认图加载失败：${error.message}`, true);
    console.warn("Failed to load default graph:", error);
  }
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const localLoad = loadGenerationTracker.beginGraphAction(`local-graph:${file.name}`);
  try {
    const dotText = await file.text();
    if (!loadGenerationTracker.isCurrentGraph(localLoad.graphToken)) return;
    currentDotText = dotText;
    currentGraphSource = { kind: "local-file", sourceName: file.name };
    if (loadGenerationTracker.isCurrentNodeInfo(localLoad.nodeInfoToken)) {
      resetNodeDetails(`已加载 ${file.name}；点击“导入节点信息”查找同名 CSV。`);
    }
    renderGraph(`已加载文件：${file.name}`);
  } catch (error) {
    if (!loadGenerationTracker.isCurrentGraph(localLoad.graphToken)) return;
    setStatus(`读取文件失败：${error.message}`, true);
  }
});

if (importNodeDetailCsvBtn && nodeDetailFileInput) {
  importNodeDetailCsvBtn.addEventListener("click", async () => {
    if (!currentGraphSource) {
      showNodeInfoFallback("当前还没有导入 GV 图。你仍可直接选择一个 CSV 或 JSON 节点信息文件。");
      return;
    }

    const candidate = getSameNameCsvCandidate(currentGraphSource.sourceName);
    if (currentGraphSource.kind === "url") {
      const result = await tryLoadSameNameCsv(
        currentGraphSource.sourceName,
        currentGraphSource.nodeDetailsSourceName,
        currentGraphSource.nodeDetailsDisplayName,
      );
      if (result.outcome === "loaded") return;
      if (result.outcome === "stale") return;

      const reason = result.outcome === "error"
        ? `读取 ${result.candidate} 失败。`
        : `GV 同目录没有找到同名文件 ${result.candidate}。`;
      showNodeInfoFallback(`${reason} 请手动选择 CSV 或 JSON 节点信息文件。`);
      return;
    }

    showNodeInfoFallback(
      `浏览器没有权限枚举 ${currentGraphSource.sourceName} 所在的本地文件夹，无法自动读取 ${candidate}。请手动选择 CSV 或 JSON 节点信息文件。`,
    );
  });

  nodeDetailFileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    await loadNodeDetailsFromFile(file);
    nodeDetailFileInput.value = "";
  });
}

if (chooseNodeDetailFileBtn && nodeDetailFileInput) {
  chooseNodeDetailFileBtn.addEventListener("click", () => {
    nodeInfoFallbackDialog?.close();
    nodeDetailFileInput.click();
  });
}

if (nodeSearchForm && nodeSearchInput) {
  nodeSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    locateNodeById(nodeSearchInput.value);
  });

  nodeSearchInput.addEventListener("input", () => {
    nodeSearchRequestToken += 1;
    setNodeSearchFeedback("");
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

if (nodeTextModeSelect) {
  nodeTextModeSelect.addEventListener("change", () => {
    const nextMode = nodeTextModeSelect.value;
    if (!NODE_TEXT_MODES.includes(nextMode)) return;
    if (nodeTextMode === nextMode) return;
    captureCurrentTabViewState();
    resetNodeSearch({ clearInput: false });
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
  if (!sourceParsedGraph) return;
  captureCurrentTabViewState();
  resetNodeSearch({ clearInput: false });
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

window.addEventListener("pagehide", () => graphvizRenderClient.dispose());

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

syncNodeTextModeSelect(nodeTextModeSelect, nodeTextMode);
updateLabelFontSizeInfo();
updateMinComponentSizeInfo();
updateLayerDepthControls();
loadDefaultGraph();
