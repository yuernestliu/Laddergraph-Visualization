// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createNetworkHeightResizer } from "../src/app/network-height-resizer.js";

function makePointerEvent(type, properties) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: properties.button ?? 0 },
    clientY: { value: properties.clientY },
    pointerId: { value: properties.pointerId },
  });
  return event;
}

function makeFixture(initialHeight = 600) {
  const networkEl = document.createElement("div");
  const handleEl = document.createElement("div");
  let renderedHeight = initialHeight;

  Object.defineProperty(networkEl, "getBoundingClientRect", {
    value: () => ({ height: Number.parseFloat(networkEl.style.height) || renderedHeight }),
  });
  handleEl.setPointerCapture = vi.fn();
  handleEl.hasPointerCapture = vi.fn(() => true);
  handleEl.releasePointerCapture = vi.fn();

  return { networkEl, handleEl };
}

describe("network height resizer", () => {
  it("changes only height during a vertical pointer drag", () => {
    const { networkEl, handleEl } = makeFixture();
    const controller = createNetworkHeightResizer({ networkEl, handleEl });
    controller.mount();

    handleEl.dispatchEvent(makePointerEvent("pointerdown", { pointerId: 7, clientY: 500 }));
    handleEl.dispatchEvent(makePointerEvent("pointermove", { pointerId: 7, clientY: 640 }));
    handleEl.dispatchEvent(makePointerEvent("pointerup", { pointerId: 7, clientY: 640 }));

    expect(networkEl.style.height).toBe("740px");
    expect(networkEl.style.width).toBe("");
    expect(handleEl.getAttribute("aria-valuenow")).toBe("740");
    expect(handleEl.classList.contains("is-resizing")).toBe(false);
  });

  it("respects the minimum and supports keyboard adjustments", () => {
    const { networkEl, handleEl } = makeFixture(340);
    const controller = createNetworkHeightResizer({ networkEl, handleEl });
    controller.mount();

    handleEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(networkEl.style.height).toBe("320px");

    handleEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(networkEl.style.height).toBe("360px");
  });
});
