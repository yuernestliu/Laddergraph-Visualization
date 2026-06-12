const SHRINK_SCALE = 0.18;

function normalizeNodeId(nodeId) {
  return String(nodeId || "").trim();
}

export function createExtractionState() {
  return {
    active: false,
    selectedIds: new Set(),
    upLevel: 1,
    downLevel: 1,
    undoCount: 0,
    redoCount: 0,
    hasGraph: false,
  };
}

export function normalizeExtractionLevel(value) {
  const parsed = Number.parseInt(value, 10);
  return Math.max(0, Number.isFinite(parsed) ? parsed : 0);
}

export function setExtractionLevels(state, upLevel, downLevel) {
  state.upLevel = normalizeExtractionLevel(upLevel);
  state.downLevel = normalizeExtractionLevel(downLevel);
}

export function setExtractionHasGraph(state, hasGraph) {
  state.hasGraph = Boolean(hasGraph);
}

export function setExtractionUndoRedo(state, meta) {
  state.undoCount = meta?.undoStack?.length || 0;
  state.redoCount = meta?.redoStack?.length || 0;
}

export function setExtractionActive(state, active) {
  state.active = Boolean(active);
  if (!state.active) {
    state.selectedIds.clear();
  }
}

export function toggleExtractionNode(state, nodeId) {
  const id = normalizeNodeId(nodeId);
  if (!id) return;
  if (state.selectedIds.has(id)) {
    state.selectedIds.delete(id);
  } else {
    state.selectedIds.add(id);
  }
}

export function setExtractionSelection(state, nodeId) {
  state.selectedIds.clear();
  const id = normalizeNodeId(nodeId);
  if (id) state.selectedIds.add(id);
}

export function buildExtractionStatus(state) {
  if (!state.hasGraph) return "加载图后可提取。";
  if (state.active) {
    return `已选 ${state.selectedIds.size} 个节点。上游 ${state.upLevel} / 下游 ${state.downLevel}。点击「完成提取」生成视图。`;
  }
  return "点击「提取子图」进入多选模式。";
}

export function getExtractionScale() {
  return SHRINK_SCALE;
}
