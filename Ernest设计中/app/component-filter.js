export function getVisibleGraphTabs(tabs, threshold) {
  return tabs.filter((tab) => {
    if (tab.kind === "isolated") {
      return threshold < 1;
    }
    return tab.stats.nodeCount > threshold;
  });
}

export function getComponentFilterMax(tabs = [], fallbackNodeCount = 1) {
  if (!tabs.length) {
    return Math.max(1, fallbackNodeCount || 1);
  }

  let maxSize = 1;
  for (const tab of tabs) {
    if (tab.kind === "isolated") {
      maxSize = Math.max(maxSize, 1);
      continue;
    }
    maxSize = Math.max(maxSize, tab.stats.nodeCount || 1);
  }
  return maxSize;
}

export function clampComponentFilterThreshold(value, tabs = [], fallbackNodeCount = 1) {
  const maxThreshold = getComponentFilterMax(tabs, fallbackNodeCount);
  return Math.max(0, Math.min(maxThreshold, Number.isFinite(value) ? Math.trunc(value) : 0));
}

export function formatComponentFilterValue(threshold) {
  return threshold <= 0 ? "全部" : `≤ ${threshold}`;
}
