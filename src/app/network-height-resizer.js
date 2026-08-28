export const DEFAULT_MIN_NETWORK_HEIGHT = 320;
export const DEFAULT_NETWORK_HEIGHT_STEP = 40;

function normalizeHeight(value, minHeight) {
  const parsed = Number(value);
  return Math.max(minHeight, Math.round(Number.isFinite(parsed) ? parsed : minHeight));
}

export function createNetworkHeightResizer(options = {}) {
  const {
    networkEl,
    handleEl,
    minHeight = DEFAULT_MIN_NETWORK_HEIGHT,
    keyboardStep = DEFAULT_NETWORK_HEIGHT_STEP,
  } = options;

  let mounted = false;
  let resizeSession = null;

  function getCurrentHeight() {
    return normalizeHeight(networkEl?.getBoundingClientRect().height, minHeight);
  }

  function updateAria(height = getCurrentHeight()) {
    if (!handleEl) return;
    handleEl.setAttribute("aria-valuemin", String(minHeight));
    handleEl.setAttribute("aria-valuenow", String(height));
    handleEl.setAttribute("aria-valuetext", `${height} 像素`);
  }

  function setHeight(value) {
    if (!networkEl) return minHeight;
    const height = normalizeHeight(value, minHeight);
    networkEl.style.height = `${height}px`;
    updateAria(height);
    return height;
  }

  function handlePointerDown(event) {
    if (event.button !== 0 || !networkEl || !handleEl) return;
    resizeSession = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startHeight: getCurrentHeight(),
    };
    handleEl.setPointerCapture?.(event.pointerId);
    handleEl.classList.add("is-resizing");
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (!resizeSession || event.pointerId !== resizeSession.pointerId) return;
    setHeight(resizeSession.startHeight + event.clientY - resizeSession.startClientY);
    event.preventDefault();
  }

  function finishPointerResize(event) {
    if (!resizeSession || (event && event.pointerId !== resizeSession.pointerId)) return;
    const pointerId = resizeSession.pointerId;
    resizeSession = null;
    if (handleEl?.hasPointerCapture?.(pointerId)) {
      handleEl.releasePointerCapture(pointerId);
    }
    handleEl?.classList.remove("is-resizing");
  }

  function handleKeyDown(event) {
    if (!networkEl || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const direction = event.key === "ArrowUp" ? -1 : 1;
    const multiplier = event.shiftKey ? 5 : 1;
    setHeight(getCurrentHeight() + direction * keyboardStep * multiplier);
    event.preventDefault();
  }

  function mount() {
    if (mounted || !networkEl || !handleEl) return;
    mounted = true;
    handleEl.addEventListener("pointerdown", handlePointerDown);
    handleEl.addEventListener("pointermove", handlePointerMove);
    handleEl.addEventListener("pointerup", finishPointerResize);
    handleEl.addEventListener("pointercancel", finishPointerResize);
    handleEl.addEventListener("keydown", handleKeyDown);
    updateAria();
  }

  function destroy() {
    if (!mounted || !handleEl) return;
    mounted = false;
    finishPointerResize();
    handleEl.removeEventListener("pointerdown", handlePointerDown);
    handleEl.removeEventListener("pointermove", handlePointerMove);
    handleEl.removeEventListener("pointerup", finishPointerResize);
    handleEl.removeEventListener("pointercancel", finishPointerResize);
    handleEl.removeEventListener("keydown", handleKeyDown);
  }

  return {
    destroy,
    mount,
    setHeight,
  };
}
