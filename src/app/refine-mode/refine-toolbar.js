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

  toolbar.append(title, selectedInfo, actionRow, modeRow);
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
      } = viewModel;

      toolbar.hidden = !enabled;
      selectedInfo.textContent = selectedNodeId
        ? `当前节点：${selectedNodeId}`
        : "未选择节点";
      title.textContent =
        `精修 · 关注 ${focusedCount} · 隐藏 ${hiddenCount} · 折叠 ${collapsedCount}`;
      focusOnlyBtn.classList.toggle("is-active", Boolean(focusOnly));
      setNodeButtonsDisabled(!selectedNodeId);
    },
    destroy() {
      toolbar.remove();
    },
  };
}
