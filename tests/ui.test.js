// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { renderGraphTabs, renderOmittedSingleTargets } from "../src/app/ui.js";

function makeOmittedSummaryEls() {
  const summaryEl = document.createElement("div");
  summaryEl.hidden = true;
  return {
    summaryEl,
    countEl: document.createElement("strong"),
    idsEl: document.createElement("div"),
  };
}

describe("target statistics UI", () => {
  it("shows an explicit zero after a graph is loaded", () => {
    const els = makeOmittedSummaryEls();

    renderOmittedSingleTargets(els, [], true);

    expect(els.summaryEl.hidden).toBe(false);
    expect(els.countEl.textContent).toBe("0");
    expect(els.idsEl.textContent).toBe("无");
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
      currentTabBaseSubgraph: null,
      currentSubgraph: null,
      currentLayerMaxDepth: 3,
      currentLayerDepth: 3,
      sourceParsedGraph: { nodes: [{ id: "-1" }], edges: [] },
      summarizeGraph: vi.fn(),
      getTrimmedLayerCount: vi.fn(),
      maxInlineTabs: 20,
      omittedSingleTargetIds: ["-1", "-8"],
      omittedSingleTargetSummaryEls: omittedEls,
      onSelectTab: vi.fn(),
    });

    expect(graphTabsInfo.textContent).toMatch(/没有可显示的网络/);
    expect(omittedEls.summaryEl.hidden).toBe(false);
    expect(omittedEls.countEl.textContent).toBe("2");
    expect(Array.from(omittedEls.idsEl.children, (child) => child.textContent)).toEqual(["-1", "-8"]);
  });

  it("renders target counts in tab labels and active graph totals", () => {
    const tabsEl = document.createElement("div");
    const graphTabsInfo = document.createElement("p");
    const activeTab = {
      id: "component-a",
      label: "1 · 3 节点 · target 2",
      optionLabel: "1 · 3 节点 · target 2 / 2 边",
      stats: { nodeCount: 3, edgeCount: 2, targetCount: 2 },
    };

    renderGraphTabs({
      tabsEl,
      componentSelectEl: document.createElement("select"),
      graphTabsInfo,
      currentGraphTabs: [
        activeTab,
        {
          id: "component-b",
          label: "2 · 2 节点 · target 1",
          optionLabel: "2 · 2 节点 · target 1 / 1 边",
          stats: { nodeCount: 2, edgeCount: 1, targetCount: 1 },
        },
      ],
      activeGraphTabId: activeTab.id,
      currentTabBaseSubgraph: { nodes: [{}, {}, {}], edges: [{}, {}] },
      currentSubgraph: { nodes: [{}, {}], edges: [{}] },
      currentLayerMaxDepth: 4,
      currentLayerDepth: 2,
      sourceParsedGraph: { nodes: [], edges: [] },
      summarizeGraph: (graph) => ({
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        targetCount: graph.nodes.length === 3 ? 2 : 1,
      }),
      getTrimmedLayerCount: (depth) => depth,
      maxInlineTabs: 20,
      omittedSingleTargetIds: [],
      omittedSingleTargetSummaryEls: makeOmittedSummaryEls(),
      onSelectTab: vi.fn(),
    });

    expect(Array.from(tabsEl.children, (button) => button.textContent)).toEqual([
      "1 · 3 节点 · target 2",
      "2 · 2 节点 · target 1",
    ]);
    expect(graphTabsInfo.textContent).toContain("共 3 节点 / target 2 / 2 边");
    expect(graphTabsInfo.textContent).toContain("目前显示：2 节点 / target 1 / 1 边");
  });
});
