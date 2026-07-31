export function setStatus(statusEl, message, isError = false) {
  statusEl.textContent = message;
  statusEl.hidden = !message;
  statusEl.style.color = isError ? "#c92a2a" : "#6b7280";
}

export function syncNodeTextModeSelect(nodeTextModeSelect, nodeTextMode) {
  if (!nodeTextModeSelect) return;
  nodeTextModeSelect.value = nodeTextMode;
}

export function updateLabelFontSizeControl(controlEls, options) {
  const { labelFontSizeInput, labelFontSizeDownBtn, labelFontSizeUpBtn } = controlEls;
  const { labelFontSize, minLabelFontSize, maxLabelFontSize } = options;
  const minSize = Number.isFinite(minLabelFontSize) ? minLabelFontSize : 6;
  const maxSize = Number.isFinite(maxLabelFontSize) ? maxLabelFontSize : 24;
  const currentSize = Math.max(minSize, Math.min(maxSize, Number(labelFontSize || 10)));

  if (labelFontSizeInput) {
    labelFontSizeInput.min = String(minSize);
    labelFontSizeInput.max = String(maxSize);
    labelFontSizeInput.value = String(currentSize);
    labelFontSizeInput.title = `Label 字号：${currentSize}`;
  }

  if (labelFontSizeDownBtn) {
    labelFontSizeDownBtn.disabled = currentSize <= minSize;
  }

  if (labelFontSizeUpBtn) {
    labelFontSizeUpBtn.disabled = currentSize >= maxSize;
  }
}

export function updateMinComponentSizeControl(controlEls, options) {
  const {
    minComponentSizeInput,
    minComponentSizeDownBtn,
    minComponentSizeUpBtn,
    minComponentSizeInfo,
    minComponentSizeQuickBtns,
  } = controlEls;
  const {
    enabled,
    minComponentSize,
    minComponentSizeMin,
    minComponentSizeMax,
    displayComponentCount,
    eligibleComponentCount,
    isolatedCount,
  } = options;

  const minSize = Math.max(2, minComponentSizeMin || 2);
  const maxSize = Math.max(minSize, minComponentSizeMax || minSize);
  const currentSize = Math.max(minSize, Math.min(maxSize, minComponentSize || minSize));

  if (minComponentSizeInput) {
    minComponentSizeInput.min = String(minSize);
    minComponentSizeInput.max = String(maxSize);
    minComponentSizeInput.value = String(currentSize);
    minComponentSizeInput.disabled = !enabled;
    minComponentSizeInput.title = `只显示总结点数大于等于 ${currentSize} 的网络`;
  }

  if (minComponentSizeDownBtn) {
    minComponentSizeDownBtn.disabled = !enabled || currentSize <= minSize;
  }

  if (minComponentSizeUpBtn) {
    minComponentSizeUpBtn.disabled = !enabled || currentSize >= maxSize;
  }

  for (const button of minComponentSizeQuickBtns || []) {
    const value = Number.parseInt(button.dataset.minComponentSize || "", 10);
    button.disabled = !enabled || !Number.isFinite(value) || value > maxSize;
    button.classList.toggle("active", enabled && value === currentSize);
  }

  if (!minComponentSizeInfo) return;
  if (!enabled) {
    minComponentSizeInfo.textContent = "加载图后可设置。";
    return;
  }

  const isolatedNote = isolatedCount > 0 ? `；已忽略 ${isolatedCount} 个孤立点` : "";
  minComponentSizeInfo.textContent =
    `M ≥ ${currentSize}；可显示 ${displayComponentCount}/${eligibleComponentCount} 个网络` +
    `；最大 ${maxSize} 点${isolatedNote}。`;
}

export function updateLayerDepthControls(controlEls, options) {
  const { layerDepthDownBtn, layerDepthUpBtn, layerDepthAutoBtn, layerDepthAllBtn } = controlEls;
  const { hasGraph, currentLayerDepth, currentLayerMaxDepth, currentAutoLayerDepth } = options;

  if (!layerDepthDownBtn || !layerDepthUpBtn || !layerDepthAllBtn) return;

  layerDepthDownBtn.disabled = !hasGraph || currentLayerDepth >= currentLayerMaxDepth;
  layerDepthUpBtn.disabled = !hasGraph || currentLayerDepth <= 0;
  if (layerDepthAutoBtn) {
    layerDepthAutoBtn.disabled = !hasGraph || currentLayerDepth === currentAutoLayerDepth;
  }
  layerDepthAllBtn.disabled = !hasGraph || currentLayerDepth <= 0;
}

export function renderGraphTabs(options) {
  const {
    tabsEl,
    componentSelectEl,
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
    maxInlineTabs,
    onSelectTab,
  } = options;

  tabsEl.innerHTML = "";
  if (componentSelectEl) {
    componentSelectEl.innerHTML = "";
    componentSelectEl.hidden = true;
    componentSelectEl.onchange = null;
  }

  if (!currentGraphTabs.length) {
    tabsEl.hidden = true;
    graphTabsInfo.textContent = sourceParsedGraph
      ? "当前过滤后没有可显示的网络。"
      : "当前显示：未加载图";
    return;
  }

  const activeTab = currentGraphTabs.find((tab) => tab.id === activeGraphTabId) || currentGraphTabs[0];
  if (!activeTab) {
    tabsEl.hidden = true;
    graphTabsInfo.textContent = "当前显示：未加载图";
    return;
  }

  const totalStats = currentTabBaseSubgraph ? summarizeGraph(currentTabBaseSubgraph) : activeTab.stats;
  const visibleStats = currentSubgraph ? summarizeGraph(currentSubgraph) : totalStats;
  const totalLayers = Math.max(1, currentLayerMaxDepth + 1);
  const visibleLayers = Math.max(
    1,
    totalLayers - getTrimmedLayerCount(currentLayerDepth, currentLayerMaxDepth),
  );

  graphTabsInfo.textContent =
    `层级 ${visibleLayers}/${totalLayers}。` +
    `共 ${totalStats.nodeCount} 节点 / ${totalStats.edgeCount} 边；` +
    `目前显示：${visibleStats.nodeCount} 节点 / ${visibleStats.edgeCount} 边。`;

  if (currentGraphTabs.length === 1) {
    tabsEl.hidden = true;
    return;
  }

  if (componentSelectEl && currentGraphTabs.length > maxInlineTabs) {
    tabsEl.hidden = true;
    componentSelectEl.hidden = false;
    for (const tab of currentGraphTabs) {
      const option = document.createElement("option");
      option.value = tab.id;
      option.textContent = tab.optionLabel || tab.label;
      option.selected = tab.id === activeGraphTabId;
      componentSelectEl.append(option);
    }
    componentSelectEl.onchange = () => {
      const nextTab = currentGraphTabs.find((tab) => tab.id === componentSelectEl.value);
      if (nextTab) onSelectTab(nextTab);
    };
    return;
  }

  tabsEl.hidden = false;
  for (const tab of currentGraphTabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${tab.id === activeGraphTabId ? " active" : ""}`;
    button.textContent = tab.label;
    button.addEventListener("click", () => onSelectTab(tab));
    tabsEl.append(button);
  }
}

export function updateNodeDetailPanel(detailEls, options) {
  const {
    nodeDetailTitle,
    nodeDetailMeta,
    nodeDetailBody,
  } = detailEls;
  const {
    nodeId,
    detail,
    detailStatus,
    emptyMessage,
    missingMessage,
  } = options;

  if (!nodeDetailTitle || !nodeDetailMeta || !nodeDetailBody) return;

  if (!nodeId) {
    nodeDetailTitle.textContent = "未选择节点";
    nodeDetailMeta.textContent = emptyMessage || detailStatus || "点击图中的节点查看节点信息详情。";
    nodeDetailBody.textContent = "";
    nodeDetailBody.hidden = true;
    return;
  }

  nodeDetailTitle.textContent = `ID ${nodeId}`;

  if (!detail) {
    nodeDetailMeta.textContent = missingMessage || detailStatus || "节点信息中没有找到这个 ID。";
    nodeDetailBody.textContent = "";
    nodeDetailBody.hidden = true;
    return;
  }

  if (detail.type === "geneColumn") {
    const genes = Array.isArray(detail.genes) ? detail.genes : [];
    nodeDetailMeta.textContent = `节点 ${detail.id} · ${genes.length} 个基因`;
    nodeDetailBody.hidden = false;
    nodeDetailBody.textContent = genes.length ? genes.join("、") : "这个节点没有基因记录。";
    return;
  }

  const metaParts = [];
  if (detail.unit) metaParts.push(`梯元 ${detail.unit}`);
  if (detail.level) metaParts.push(`层级 ${detail.level}`);
  if (detail.weight) metaParts.push(`重数 ${detail.weight}`);
  metaParts.push(`${detail.characters.length} 字`);
  if (detail.hiddenCharacterCount > 0) {
    metaParts.push(`显示前 ${detail.previewCharacters.length} 字`);
  }

  nodeDetailMeta.textContent = metaParts.join(" · ");
  nodeDetailBody.hidden = false;
  nodeDetailBody.textContent = detail.previewCharacters.join("、");
}
