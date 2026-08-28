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
    minComponentSizeInput.title = `视图中隐藏节点数小于 ${currentSize} 的图`;
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
    `n=${currentSize}；视图中已隐藏节点数小于 ${currentSize} 的图；` +
    `可显示 ${displayComponentCount}/${eligibleComponentCount} 个网络；最大 ${maxSize} 点${isolatedNote}。`;
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

export function renderOmittedSingleTargets(summaryEls, nodeIds = [], hasGraph = true) {
  const { summaryEl, textEl } = summaryEls;
  if (!summaryEl || !textEl) return;

  const normalizedIds = Array.from(nodeIds, String);
  summaryEl.hidden = !hasGraph || normalizedIds.length === 0;
  textEl.hidden = !hasGraph || normalizedIds.length === 0;
  if (!hasGraph || normalizedIds.length === 0) {
    textEl.textContent = "";
    return;
  }

  const visibleIds = normalizedIds.slice(0, 10);
  const idText = visibleIds.length ? visibleIds.join(", ") : "无";
  const suffix = normalizedIds.length > visibleIds.length ? ", ..." : "";
  textEl.textContent =
    `未进入标签页的单Target数量为 ${normalizedIds.length}，` +
    `其ID为：${idText}${suffix}`;
}

export function renderGraphTabs(options) {
  const {
    tabsEl,
    componentSelectEl,
    graphTabsInfo,
    currentGraphTabs,
    activeGraphTabId,
    currentLayerMaxDepth,
    currentLayerDepth,
    sourceParsedGraph,
    getTrimmedLayerCount,
    maxInlineTabs,
    omittedSingleTargetIds,
    omittedSingleTargetSummaryEls,
    onSelectTab,
  } = options;

  renderOmittedSingleTargets(
    omittedSingleTargetSummaryEls || {},
    omittedSingleTargetIds,
    Boolean(sourceParsedGraph),
  );
  tabsEl.innerHTML = "";
  if (componentSelectEl) {
    componentSelectEl.innerHTML = "";
    componentSelectEl.hidden = true;
    componentSelectEl.onchange = null;
  }

  const totalLayers = sourceParsedGraph ? Math.max(1, currentLayerMaxDepth + 1) : 0;
  const visibleLayers = totalLayers
    ? Math.max(
        1,
        totalLayers - getTrimmedLayerCount(currentLayerDepth, currentLayerMaxDepth),
      )
    : 0;
  graphTabsInfo.textContent = `层级 ${visibleLayers}/${totalLayers}`;

  if (!currentGraphTabs.length) {
    tabsEl.hidden = true;
    return;
  }

  const activeTab = currentGraphTabs.find((tab) => tab.id === activeGraphTabId) || currentGraphTabs[0];
  if (!activeTab) {
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
    emptyMessage,
    missingMessage,
  } = options;

  if (!nodeDetailTitle || !nodeDetailMeta || !nodeDetailBody) return;

  if (!nodeId) {
    nodeDetailTitle.textContent = "未选择节点";
    nodeDetailMeta.textContent = emptyMessage || "点击图中的节点查看 ID 与详情。";
    nodeDetailBody.textContent = "";
    nodeDetailBody.hidden = true;
    return;
  }

  nodeDetailTitle.textContent = `ID ${nodeId}`;

  if (!detail) {
    nodeDetailMeta.textContent = missingMessage || "暂无可显示的节点详情。";
    nodeDetailBody.textContent = "";
    nodeDetailBody.hidden = true;
    return;
  }

  if (detail.type === "sequence") {
    const sequence = String(detail.sequence || "");
    const sequenceLength = Number.isFinite(Number(detail.sequenceLength))
      ? Number(detail.sequenceLength)
      : Array.from(sequence).length;
    nodeDetailMeta.textContent = `序列长度 ${sequenceLength}`;
    nodeDetailBody.hidden = false;
    nodeDetailBody.textContent = sequence;
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
