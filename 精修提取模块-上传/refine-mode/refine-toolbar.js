function makeButton(documentRef, label, action, title = "") {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.refineAction = action;
  if (title) button.title = title;
  return button;
}

export function createRefineToolbar(options = {}) {
  const {
    rootEl,
    documentRef = document,
    onAction = () => {},
    onExit = () => {},
    onExtractionLevelChange = () => {},
  } = options;

  const toolbar = documentRef.createElement("div");
  toolbar.className = "refine-mode-toolbar";
  toolbar.hidden = true;
  toolbar.dataset.refineModeControl = "";

  const title = documentRef.createElement("div");
  title.className = "refine-mode-title";
  title.textContent = "精修";

  const selectedInfo = documentRef.createElement("div");
  selectedInfo.className = "refine-mode-selected";
  selectedInfo.textContent = "未选择节点";

  const actionRow = documentRef.createElement("div");
  actionRow.className = "refine-mode-actions";
  const focusBtn = makeButton(documentRef, "关注", "focus", "把当前节点标记为关注节点");
  const hideBtn = makeButton(documentRef, "隐藏", "hide", "从当前显示投影中隐藏该节点");
  const collapseBtn = makeButton(documentRef, "折叠", "collapse", "把当前节点显示为折叠胶囊");
  const expandBtn = makeButton(documentRef, "展开", "expand", "取消当前节点的折叠状态");
  const clearNodeBtn = makeButton(documentRef, "取消标记", "clearNode", "清除当前节点的精修标记");
  actionRow.append(focusBtn, hideBtn, collapseBtn, expandBtn, clearNodeBtn);

  const modeRow = documentRef.createElement("div");
  modeRow.className = "refine-mode-actions";
  const focusOnlyBtn = makeButton(documentRef, "只看关注", "toggleFocusOnly", "只显示关注节点及其直接邻居");
  const clearAllBtn = makeButton(documentRef, "清空", "clearAll", "清空全部精修状态");
  const exitBtn = makeButton(documentRef, "退出", "exit", "退出精修模式");
  modeRow.append(focusOnlyBtn, clearAllBtn, exitBtn);

  const extractionRow = documentRef.createElement("div");
  extractionRow.className = "refine-mode-actions extraction-controls";
  extractionRow.hidden = true;
  extractionRow.dataset.extractionControls = "";

  const extractBtn = makeButton(documentRef, "提取子图", "enterExtraction", "进入提取子图模式");
  extractBtn.dataset.extractionToggle = "";

  const upInput = documentRef.createElement("input");
  upInput.type = "number";
  upInput.min = "0";
  upInput.step = "1";
  upInput.value = "1";
  upInput.style.cssText = "width:44px;text-align:center;font-size:12px";
  upInput.setAttribute("aria-label", "上游层数");
  upInput.dataset.extractionUp = "";

  const upLabel = documentRef.createElement("span");
  upLabel.textContent = "上游";
  upLabel.style.cssText = "font-size:11px;color:#495057";

  const downInput = documentRef.createElement("input");
  downInput.type = "number";
  downInput.min = "0";
  downInput.step = "1";
  downInput.value = "1";
  downInput.style.cssText = "width:44px;text-align:center;font-size:12px";
  downInput.setAttribute("aria-label", "下游层数");
  downInput.dataset.extractionDown = "";

  const downLabel = documentRef.createElement("span");
  downLabel.textContent = "下游";
  downLabel.style.cssText = "font-size:11px;color:#495057";

  const finishBtn = makeButton(documentRef, "完成提取", "finishExtraction", "根据选中节点和层数创建提取视图");
  finishBtn.dataset.extractionFinish = "";
  finishBtn.hidden = true;

  const cancelBtn = makeButton(documentRef, "取消提取", "cancelExtraction", "退出提取子图模式");
  cancelBtn.dataset.extractionCancel = "";
  cancelBtn.hidden = true;

  const undoExtractionBtn = makeButton(documentRef, "← 后退(0)", "undoExtraction", "回退一步展开");
  undoExtractionBtn.dataset.extractionUndo = "";
  undoExtractionBtn.hidden = true;

  const redoExtractionBtn = makeButton(documentRef, "前进 →(0)", "redoExtraction", "前进一步展开");
  redoExtractionBtn.dataset.extractionRedo = "";
  redoExtractionBtn.hidden = true;

  const extractionStatus = documentRef.createElement("div");
  extractionStatus.className = "refine-mode-extraction-status";
  extractionStatus.dataset.extractionStatus = "";
  extractionStatus.textContent = "";

  extractionRow.append(extractBtn, upLabel, upInput, downLabel, downInput, finishBtn, cancelBtn);
  const extractionUndoRow = documentRef.createElement("div");
  extractionUndoRow.className = "refine-mode-actions";
  extractionUndoRow.dataset.extractionUndoRow = "";
  extractionUndoRow.append(undoExtractionBtn, redoExtractionBtn);
  extractionRow.append(extractionUndoRow);
  extractionRow.append(extractionStatus);

  toolbar.append(title, selectedInfo, actionRow, modeRow, extractionRow);
  rootEl?.append(toolbar);

  toolbar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-refine-action]");
    if (!button) return;
    const action = button.dataset.refineAction;
    if (action === "exit") {
      onExit();
      return;
    }
    onAction(action);
  });

  upInput.addEventListener("change", () => {
    onExtractionLevelChange(Number.parseInt(upInput.value, 10) || 0, Number.parseInt(downInput.value, 10) || 0);
  });
  downInput.addEventListener("change", () => {
    onExtractionLevelChange(Number.parseInt(upInput.value, 10) || 0, Number.parseInt(downInput.value, 10) || 0);
  });

  function setNodeButtonsDisabled(disabled) {
    for (const button of [focusBtn, hideBtn, collapseBtn, expandBtn, clearNodeBtn]) {
      button.disabled = disabled;
    }
  }

  return {
    element: toolbar,
    setVisible(visible) {
      toolbar.hidden = !visible;
    },
    update(viewModel = {}) {
      const {
        enabled = false,
        selectedNodeId = null,
        focusOnly = false,
        focusedCount = 0,
        hiddenCount = 0,
        collapsedCount = 0,
        activeTool = "default",
        extractionActive = false,
        extractionStatus: extStatus = "",
        extractionSelectedCount = 0,
        extractionUpLevel = 1,
        extractionDownLevel = 1,
        extractionUndoCount = 0,
        extractionRedoCount = 0,
        extractionEnabled = true,
      } = viewModel;

      toolbar.hidden = !enabled;
      selectedInfo.textContent = selectedNodeId
        ? `当前节点：${selectedNodeId}`
        : "未选择节点";
      title.textContent =
        `精修 · 关注 ${focusedCount} · 隐藏 ${hiddenCount} · 折叠 ${collapsedCount}`;
      focusOnlyBtn.classList.toggle("is-active", Boolean(focusOnly));
      setNodeButtonsDisabled(!selectedNodeId);

      const showExtraction = activeTool === "extraction" || enabled;
      extractionRow.hidden = false;
      extractBtn.hidden = extractionActive;
      upInput.hidden = !extractionActive;
      downInput.hidden = !extractionActive;
      upLabel.hidden = !extractionActive;
      downLabel.hidden = !extractionActive;
      finishBtn.hidden = !extractionActive;
      cancelBtn.hidden = !extractionActive;
      undoExtractionBtn.hidden = !enabled;
      redoExtractionBtn.hidden = !enabled;

      if (!showExtraction) {
        extractionRow.hidden = true;
      }

      upInput.value = String(extractionUpLevel);
      downInput.value = String(extractionDownLevel);
      extractBtn.disabled = !extractionEnabled;
      finishBtn.disabled = extractionSelectedCount === 0;
      undoExtractionBtn.disabled = extractionUndoCount === 0;
      redoExtractionBtn.disabled = extractionRedoCount === 0;
      undoExtractionBtn.textContent = `← 后退(${extractionUndoCount})`;
      redoExtractionBtn.textContent = `前进 →(${extractionRedoCount})`;
      extractionStatus.textContent = extStatus;
    },
    destroy() {
      toolbar.remove();
    },
  };
}
