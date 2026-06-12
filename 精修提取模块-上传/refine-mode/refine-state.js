function normalizeNodeId(nodeId) {
  return String(nodeId || "").trim();
}

function sortedValues(values) {
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

export class RefineState {
  constructor() {
    this.hiddenNodeIds = new Set();
    this.collapsedNodeIds = new Set();
    this.focusedNodeIds = new Set();
    this.focusOnly = false;
  }

  clear() {
    this.hiddenNodeIds.clear();
    this.collapsedNodeIds.clear();
    this.focusedNodeIds.clear();
    this.focusOnly = false;
  }

  isEmpty() {
    return (
      this.hiddenNodeIds.size === 0 &&
      this.collapsedNodeIds.size === 0 &&
      this.focusedNodeIds.size === 0 &&
      !this.focusOnly
    );
  }

  focusNode(nodeId) {
    const id = normalizeNodeId(nodeId);
    if (!id) return;
    this.hiddenNodeIds.delete(id);
    this.focusedNodeIds.add(id);
  }

  hideNode(nodeId) {
    const id = normalizeNodeId(nodeId);
    if (!id) return;
    this.focusedNodeIds.delete(id);
    this.collapsedNodeIds.delete(id);
    this.hiddenNodeIds.add(id);
  }

  collapseNode(nodeId) {
    const id = normalizeNodeId(nodeId);
    if (!id || this.hiddenNodeIds.has(id)) return;
    this.collapsedNodeIds.add(id);
  }

  expandNode(nodeId) {
    const id = normalizeNodeId(nodeId);
    if (!id) return;
    this.collapsedNodeIds.delete(id);
  }

  clearNode(nodeId) {
    const id = normalizeNodeId(nodeId);
    if (!id) return;
    this.hiddenNodeIds.delete(id);
    this.collapsedNodeIds.delete(id);
    this.focusedNodeIds.delete(id);
  }

  setFocusOnly(enabled) {
    this.focusOnly = Boolean(enabled);
  }

  getNodeStatus(nodeId) {
    const id = normalizeNodeId(nodeId);
    return {
      hidden: this.hiddenNodeIds.has(id),
      collapsed: this.collapsedNodeIds.has(id),
      focused: this.focusedNodeIds.has(id),
    };
  }

  toJSON() {
    return {
      hiddenNodeIds: sortedValues(this.hiddenNodeIds),
      collapsedNodeIds: sortedValues(this.collapsedNodeIds),
      focusedNodeIds: sortedValues(this.focusedNodeIds),
      focusOnly: this.focusOnly,
    };
  }

  getSignature() {
    const snapshot = this.toJSON();
    return [
      `hidden:${snapshot.hiddenNodeIds.join(",")}`,
      `collapsed:${snapshot.collapsedNodeIds.join(",")}`,
      `focused:${snapshot.focusedNodeIds.join(",")}`,
      `focusOnly:${snapshot.focusOnly ? "1" : "0"}`,
    ].join("|");
  }
}
