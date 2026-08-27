// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { renderGraphTabs, renderOmittedSingleTargets } from "../src/app/ui.js";

function makeOmittedSummaryEls() {
  const summaryEl = document.createElement("p");
  summaryEl.hidden = true;
  return {
    summaryEl,
    textEl: document.createElement("strong"),
  };
}

describe("target statistics UI", () => {
  it("removes the omitted-target row when the count is zero", () => {
    const els = makeOmittedSummaryEls();

    renderOmittedSingleTargets(els, [], true);

    expect(els.summaryEl.hidden).toBe(true);
    expect(els.textEl.hidden).toBe(true);
    expect(els.textEl.textContent).toBe("");
  });

  it("shows at most ten omitted target IDs", () => {
    const els = makeOmittedSummaryEls();
    const ids = Array.from({ length: 12 }, (_, index) => `-${index + 1}`);

    renderOmittedSingleTargets(els, ids, true);

    expect(els.textEl.hidden).toBe(false);
    expect(els.textEl.textContent).toBe(
      "未进入标签页的单Target数量为 12，其ID为：" +
      "-1, -2, -3, -4, -5, -6, -7, -8, -9, -10, ...",
    );
  });

  it("keeps omitted target IDs visible even when there are no tabs", () => {
    const tabsEl = document.createElement("div");
    const graphTabsInfo = document.createElement("p");
    const omittedEls = makeOmittedSummaryEls();

    renderGraphTabs({
      tabsEl,
      componentSelectEl: document.createElement("select"),
      graphTabsInfo,
      currentGraphTabs: [],
      activeGraphTabId: null,
      currentLayerMaxDepth: 3,
      currentLayerDepth: 3,
      sourceParsedGraph: { nodes: [{ id: "-1" }], edges: [] },
      getTrimmedLayerCount: (depth) => depth,
      maxInlineTabs: 20,
      omittedSingleTargetIds: ["-1", "-8"],
      omittedSingleTargetSummaryEls: omittedEls,
      onSelectTab: vi.fn(),
    });

    expect(graphTabsInfo.textContent).toBe("层级 1/4");
    expect(omittedEls.summaryEl.hidden).toBe(false);
    expect(omittedEls.textEl.textContent).toBe(
      "未进入标签页的单Target数量为 2，其ID为：-1, -8",
    );
  });

  it("renders leaf and ladder-unit counts in tab labels with only the layer counter", () => {
    const tabsEl = document.createElement("div");
    const graphTabsInfo = document.createElement("p");
    const activeTab = {
      id: "component-a",
      label: "(1)2叶.1梯元",
      optionLabel: "(1)2叶.1梯元",
      stats: { nodeCount: 3, edgeCount: 2, targetCount: 2, ladderUnitCount: 1 },
    };

    renderGraphTabs({
      tabsEl,
      componentSelectEl: document.createElement("select"),
      graphTabsInfo,
      currentGraphTabs: [
        activeTab,
        {
          id: "component-b",
          label: "(2)1叶.1梯元",
          optionLabel: "(2)1叶.1梯元",
          stats: { nodeCount: 2, edgeCount: 1, targetCount: 1, ladderUnitCount: 1 },
        },
      ],
      activeGraphTabId: activeTab.id,
      currentLayerMaxDepth: 4,
      currentLayerDepth: 2,
      sourceParsedGraph: { nodes: [], edges: [] },
      getTrimmedLayerCount: (depth) => depth,
      maxInlineTabs: 20,
      omittedSingleTargetIds: [],
      omittedSingleTargetSummaryEls: makeOmittedSummaryEls(),
      onSelectTab: vi.fn(),
    });

    expect(Array.from(tabsEl.children, (button) => button.textContent)).toEqual([
      "(1)2叶.1梯元",
      "(2)1叶.1梯元",
    ]);
    expect(graphTabsInfo.textContent).toBe("层级 3/5");
  });

  it("keeps a single total-count tab visible", () => {
    const tabsEl = document.createElement("div");
    tabsEl.hidden = true;
    const onlyTab = {
      id: "component-all",
      label: "(1)24叶.135梯元",
      optionLabel: "(1)24叶.135梯元",
      stats: { nodeCount: 159, edgeCount: 520, targetCount: 24, ladderUnitCount: 135 },
    };

    renderGraphTabs({
      tabsEl,
      componentSelectEl: document.createElement("select"),
      graphTabsInfo: document.createElement("p"),
      currentGraphTabs: [onlyTab],
      activeGraphTabId: onlyTab.id,
      currentLayerMaxDepth: 11,
      currentLayerDepth: 0,
      sourceParsedGraph: { nodes: [], edges: [] },
      getTrimmedLayerCount: (depth) => depth,
      maxInlineTabs: 20,
      omittedSingleTargetIds: [],
      omittedSingleTargetSummaryEls: makeOmittedSummaryEls(),
      onSelectTab: vi.fn(),
    });

    expect(tabsEl.hidden).toBe(false);
    expect(Array.from(tabsEl.children, (button) => button.textContent)).toEqual([
      "(1)24叶.135梯元",
    ]);
    expect(tabsEl.firstElementChild.classList.contains("active")).toBe(true);
  });
});
