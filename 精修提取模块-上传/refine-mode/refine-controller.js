import { RefineState } from "./refine-state.js";
import { projectRefineGraph } from "./refine-projection.js";
import {
  buildExtractionStatus,
  createExtractionState,
  setExtractionActive,
  setExtractionHasGraph,
  setExtractionLevels,
  setExtractionSelection,
  setExtractionUndoRedo,
  toggleExtractionNode,
} from "./refine-extraction.js";
import { createRefineToolbar } from "./refine-toolbar.js";

const REFINE_MODE_CLASS = "is-refine-mode";
const REFINE_MODE_STYLE_ID = "laddergraph-refine-mode-style";
const ACTIVE_BUTTON_CLASS = "is-active";
const DEFAULT_CONTROL_SELECTOR = "button, input, select, textarea";
const DEFAULT_ALLOWED_CONTROL_SELECTOR = "[data-refine-mode-control]";

function ensureRefineModeStyles(documentRef) {
  if (documentRef.getElementById(REFINE_MODE_STYLE_ID)) return;

  const style = documentRef.createElement("style");
  style.id = REFINE_MODE_STYLE_ID;
  style.textContent = `
    .${REFINE_MODE_CLASS} {
      outline: 3px solid #1971c2;
      outline-offset: 6px;
      box-shadow: 0 0 0 1px rgba(25, 113, 194, 0.2);
    }

    #refineModeBtn.${ACTIVE_BUTTON_CLASS} {
      background: #1971c2;
      border-color: #1864ab;
      color: #fff;
    }

    [data-refine-mode-locked="true"] {
      pointer-events: none;
    }

    .refine-mode-toolbar {
      position: absolute;
      left: 10px;
      bottom: 10px;
      z-index: 5;
      width: min(420px, calc(100% - 20px));
      padding: 9px 10px;
      background: rgba(255, 253, 248, 0.96);
      border: 1px solid rgba(25, 113, 194, 0.42);
      border-radius: 8px;
      box-shadow: 0 8px 22px rgba(25, 113, 194, 0.14);
      display: grid;
      gap: 7px;
    }

    .refine-mode-toolbar[hidden] {
      display: none;
    }

    .refine-mode-title {
      color: #0b3d66;
      font-size: 12px;
      font-weight: 700;
    }

    .refine-mode-selected {
      color: #495057;
      font-size: 12px;
      word-break: break-all;
    }

    .refine-mode-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .refine-mode-actions button {
      min-height: 30px;
      padding: 4px 8px;
      font-size: 12px;
      background: #f8fbff;
      border-color: #a5d8ff;
    }

    .refine-mode-actions button.is-active {
      color: #fff;
      background: #1971c2;
      border-color: #1864ab;
    }

    .refine-mode-extraction-status {
      color: #495057;
      font-size: 11px;
      margin-top: 2px;
    }
  `;
  documentRef.head.append(style);
}

function isElementAllowed(control, toggleButton, allowedControlSelector) {
  if (!control) return true;
  if (control === toggleButton) return true;
  return Boolean(allowedControlSelector && control.closest(allowedControlSelector));
}

export function createRefineModeController(options = {}) {
  const {
    rootEl,
    toggleButton,
    disabledRoot = document,
    controlSelector = DEFAULT_CONTROL_SELECTOR,
    allowedControlSelector = DEFAULT_ALLOWED_CONTROL_SELECTOR,
    documentRef = document,
    initialEnabled = false,
    onChange = () => {},
    onProjectionChange = () => {},
    onExtractionAction = () => {},
    onExtractionChange = () => {},
  } = options;

  const state = new RefineState();
  const extractionState = createExtractionState();
  let activeTool = "default";
  let enabled = Boolean(initialEnabled);
  let selectedNodeId = null;
  let mounted = false;
  let disableObserver = null;
  let disableRefreshQueued = false;
  let toolbar = null;
  const lockedControls = new Map();

  function emitChange() {
    const detail = { enabled, state: state.toJSON() };
    onChange(detail);
    rootEl?.dispatchEvent(new CustomEvent("laddergraph:refine-mode-change", { detail }));
  }

  function emitProjectionChange(reason) {
    updateToolbar();
    onProjectionChange({
      reason,
      enabled,
      selectedNodeId,
      state: state.toJSON(),
      signature: getProjectionSignature(),
    });
  }

  function emitExtractionChange(action = "enter") {
    onExtractionChange({
      action,
      enabled: enabled && activeTool === "extraction",
      selectedIds: Array.from(extractionState.selectedIds),
      upLevel: extractionState.upLevel,
      downLevel: extractionState.downLevel,
    });
  }

  function getLockableControls() {
    if (!disabledRoot?.querySelectorAll) return [];
    return Array.from(disabledRoot.querySelectorAll(controlSelector));
  }

  function lockControls() {
    for (const control of getLockableControls()) {
      if (isElementAllowed(control, toggleButton, allowedControlSelector)) continue;
      if (!lockedControls.has(control)) {
        lockedControls.set(control, control.disabled);
      }
      control.disabled = true;
      control.dataset.refineModeLocked = "true";
    }
  }

  function restoreControls() {
    for (const [control, wasDisabled] of lockedControls) {
      if (control.isConnected) {
        control.disabled = wasDisabled;
        delete control.dataset.refineModeLocked;
      }
    }
    lockedControls.clear();
  }

  function queueLockRefresh() {
    if (!enabled || disableRefreshQueued) return;
    disableRefreshQueued = true;
    window.requestAnimationFrame(() => {
      disableRefreshQueued = false;
      if (enabled) lockControls();
    });
  }

  function startObserver() {
    if (disableObserver || !disabledRoot || typeof MutationObserver === "undefined") return;
    disableObserver = new MutationObserver(queueLockRefresh);
    disableObserver.observe(disabledRoot, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });
  }

  function stopObserver() {
    disableObserver?.disconnect();
    disableObserver = null;
    disableRefreshQueued = false;
  }

  function updateToggleButton() {
    if (!toggleButton) return;
    toggleButton.classList.toggle(ACTIVE_BUTTON_CLASS, enabled);
    toggleButton.textContent = enabled ? "退出精修" : "精修";
    toggleButton.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggleButton.title = enabled ? "退出精修模式" : "进入精修模式";
  }

  function updateToolbar() {
    toolbar?.update({
      enabled,
      selectedNodeId,
      focusOnly: state.focusOnly,
      focusedCount: state.focusedNodeIds.size,
      hiddenCount: state.hiddenNodeIds.size,
      collapsedCount: state.collapsedNodeIds.size,
      activeTool,
      extractionActive: enabled && activeTool === "extraction",
      extractionStatus: buildExtractionStatus(extractionState),
      extractionSelectedCount: extractionState.selectedIds.size,
      extractionUpLevel: extractionState.upLevel,
      extractionDownLevel: extractionState.downLevel,
      extractionUndoCount: extractionState.undoCount,
      extractionRedoCount: extractionState.redoCount,
      extractionEnabled: extractionState.hasGraph,
    });
  }

  function renderModeState() {
    rootEl?.classList.toggle(REFINE_MODE_CLASS, enabled);
    updateToggleButton();
    updateToolbar();
  }

  function setEnabled(nextEnabled) {
    const normalized = Boolean(nextEnabled);
    if (enabled === normalized) return;
    enabled = normalized;

    if (!enabled) {
      activeTool = "default";
      setExtractionActive(extractionState, false);
    }

    renderModeState();
    if (enabled) {
      emitChange();
      lockControls();
      startObserver();
    } else {
      stopObserver();
      restoreControls();
      emitChange();
    }
  }

  function toggle() {
    setEnabled(!enabled);
  }

  function handleExtractionLevelChange(upLevel, downLevel) {
    setExtractionLevels(extractionState, upLevel, downLevel);
    updateToolbar();
  }

  function applyAction(action) {
    if (action === "enterExtraction") {
      activeTool = "extraction";
      setExtractionActive(extractionState, true);
      setExtractionSelection(extractionState, selectedNodeId);
      updateToolbar();
      emitExtractionChange();
      return;
    }

    if (action === "cancelExtraction") {
      activeTool = "default";
      setExtractionActive(extractionState, false);
      updateToolbar();
      emitExtractionChange("cancel");
      return;
    }

    if (action === "finishExtraction") {
      if (extractionState.selectedIds.size > 0) {
        onExtractionChange({
          action: "finish",
          enabled: true,
          selectedIds: Array.from(extractionState.selectedIds),
          upLevel: extractionState.upLevel,
          downLevel: extractionState.downLevel,
        });
      }
      return;
    }

    if (action === "undoExtraction" || action === "redoExtraction") {
      onExtractionAction(action === "undoExtraction" ? "undo" : "redo");
      return;
    }

    if (action === "toggleFocusOnly") {
      state.setFocusOnly(!state.focusOnly);
      emitProjectionChange("focus-only");
      return;
    }

    if (action === "clearAll") {
      state.clear();
      emitProjectionChange("clear");
      return;
    }

    if (!selectedNodeId) {
      updateToolbar();
      return;
    }

    if (action === "focus") state.focusNode(selectedNodeId);
    else if (action === "hide") state.hideNode(selectedNodeId);
    else if (action === "collapse") state.collapseNode(selectedNodeId);
    else if (action === "expand") state.expandNode(selectedNodeId);
    else if (action === "clearNode") state.clearNode(selectedNodeId);
    else return;

    emitProjectionChange(action);
  }

  function handleToggleClick() {
    toggle();
  }

  function getProjectionSignature() {
    return `refine:${state.getSignature()}`;
  }

  return {
    mount() {
      if (mounted) return;
      mounted = true;
      ensureRefineModeStyles(documentRef);
      toolbar = createRefineToolbar({
        rootEl,
        documentRef,
        onAction: applyAction,
        onExit: () => setEnabled(false),
        onExtractionLevelChange: handleExtractionLevelChange,
      });
      toggleButton?.addEventListener("click", handleToggleClick);
      renderModeState();
      if (enabled) {
        lockControls();
        startObserver();
      }
    },

    destroy() {
      if (!mounted) return;
      mounted = false;
      stopObserver();
      toggleButton?.removeEventListener("click", handleToggleClick);
      rootEl?.classList.remove(REFINE_MODE_CLASS);
      toggleButton?.classList.remove(ACTIVE_BUTTON_CLASS);
      toolbar?.destroy();
      toolbar = null;
      restoreControls();
    },

    setEnabled,
    toggle,
    setSelectedNode(nodeId) {
      selectedNodeId = nodeId ? String(nodeId) : null;
      if (enabled && activeTool === "extraction" && nodeId) {
        toggleExtractionNode(extractionState, nodeId);
        updateToolbar();
      }
      updateToolbar();
    },
    projectGraph(parsed) {
      return projectRefineGraph(parsed, state);
    },
    getProjectionSignature,
    clear() {
      state.clear();
      selectedNodeId = null;
      activeTool = "default";
      setExtractionActive(extractionState, false);
      updateToolbar();
    },
    refreshDisabledState() {
      if (enabled) lockControls();
    },
    isEnabled() {
      return enabled;
    },
    handleNodeSelection(nodeId) {
      if (!enabled || activeTool !== "extraction") return false;
      if (!nodeId) return false;
      toggleExtractionNode(extractionState, nodeId);
      updateToolbar();
      return true;
    },
    updateExtractionContext({ hasGraph, upLevel, downLevel }) {
      setExtractionHasGraph(extractionState, hasGraph);
      if (upLevel !== undefined || downLevel !== undefined) {
        setExtractionLevels(extractionState, upLevel, downLevel);
      }
      updateToolbar();
    },
    updateExtractionToolbar(meta) {
      setExtractionUndoRedo(extractionState, meta);
      updateToolbar();
    },
    exitExtractionTool() {
      activeTool = "default";
      setExtractionActive(extractionState, false);
      updateToolbar();
    },
    setExtractionLevels: handleExtractionLevelChange,
    getExtractionSelectedIds() {
      return Array.from(extractionState.selectedIds);
    },
    isEmpty() {
      return state.isEmpty();
    },
    getStateSnapshot() {
      return state.toJSON();
    },
  };
}
