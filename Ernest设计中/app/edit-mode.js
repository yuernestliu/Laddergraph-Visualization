const EDIT_MODE_CLASS = "is-edit-mode";
const EDIT_MODE_STYLE_ID = "laddergraph-edit-mode-style";
const ACTIVE_BUTTON_CLASS = "is-active";
const DEFAULT_CONTROL_SELECTOR = "button, input, select, textarea";
const DEFAULT_ALLOWED_CONTROL_SELECTOR = "[data-edit-mode-control]";

function ensureEditModeStyles(documentRef) {
  if (documentRef.getElementById(EDIT_MODE_STYLE_ID)) return;

  const style = documentRef.createElement("style");
  style.id = EDIT_MODE_STYLE_ID;
  style.textContent = `
    .${EDIT_MODE_CLASS} {
      outline: 3px solid #d92d20;
      outline-offset: 3px;
      box-shadow: 0 0 0 1px rgba(217, 45, 32, 0.18);
    }

    #editModeBtn.${ACTIVE_BUTTON_CLASS} {
      background: #d92d20;
      border-color: #b42318;
      color: #fff;
    }

    [data-edit-mode-locked="true"] {
      pointer-events: none;
    }
  `;
  documentRef.head.append(style);
}

function isElementAllowed(control, toggleButton, allowedControlSelector) {
  if (!control) return true;
  if (control === toggleButton) return true;
  return Boolean(allowedControlSelector && control.closest(allowedControlSelector));
}

export function createEditModeController(options = {}) {
  const {
    rootEl,
    toggleButton,
    disabledRoot = document,
    controlSelector = DEFAULT_CONTROL_SELECTOR,
    allowedControlSelector = DEFAULT_ALLOWED_CONTROL_SELECTOR,
    documentRef = document,
    initialEnabled = false,
    onChange = () => {},
  } = options;

  let enabled = Boolean(initialEnabled);
  let mounted = false;
  let disableObserver = null;
  let disableRefreshQueued = false;
  const lockedControls = new Map();

  function emitChange() {
    const detail = { enabled };
    onChange(detail);
    rootEl?.dispatchEvent(new CustomEvent("laddergraph:edit-mode-change", { detail }));
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
      control.dataset.editModeLocked = "true";
    }
  }

  function restoreControls() {
    for (const [control, wasDisabled] of lockedControls) {
      if (control.isConnected) {
        control.disabled = wasDisabled;
        delete control.dataset.editModeLocked;
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

  function renderModeState() {
    rootEl?.classList.toggle(EDIT_MODE_CLASS, enabled);

    if (!toggleButton) return;
    toggleButton.classList.toggle(ACTIVE_BUTTON_CLASS, enabled);
    toggleButton.textContent = enabled ? "退出编辑" : "编辑";
    toggleButton.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggleButton.title = enabled ? "退出编辑模式" : "进入编辑模式";
  }

  function setEnabled(nextEnabled) {
    const normalized = Boolean(nextEnabled);
    if (enabled === normalized) return;
    enabled = normalized;

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

  function handleToggleClick() {
    toggle();
  }

  return {
    mount() {
      if (mounted) return;
      mounted = true;
      ensureEditModeStyles(documentRef);
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
      rootEl?.classList.remove(EDIT_MODE_CLASS);
      toggleButton?.classList.remove(ACTIVE_BUTTON_CLASS);
      restoreControls();
    },

    setEnabled,
    toggle,
    refreshDisabledState() {
      if (enabled) lockControls();
    },
    isEnabled() {
      return enabled;
    },
  };
}
