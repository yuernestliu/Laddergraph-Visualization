function clampDepth(value, maxDepth) {
  return Math.max(0, Math.min(maxDepth, Number.isFinite(value) ? Math.trunc(value) : 0));
}

function getBucket(store, tabId) {
  if (!store.has(tabId)) {
    store.set(tabId, new Map());
  }
  return store.get(tabId);
}

export class GraphTabStateStore {
  constructor() {
    this.reset();
  }

  reset() {
    this.viewState = new Map();
    this.depthState = new Map();
    this.renderedDepthState = new Map();
    this.renderCache = new Map();
  }

  getViewState(tabId, viewKey) {
    return this.viewState.get(tabId)?.get(viewKey) || null;
  }

  setViewState(tabId, viewKey, state) {
    getBucket(this.viewState, tabId).set(viewKey, state);
  }

  getRenderCache(tabId, renderKey) {
    return this.renderCache.get(tabId)?.get(renderKey) || null;
  }

  setRenderCache(tabId, renderKey, cacheEntry) {
    getBucket(this.renderCache, tabId).set(renderKey, cacheEntry);
  }

  getLayerDepth(tabId, maxDepth) {
    return clampDepth(this.depthState.get(tabId), maxDepth);
  }

  hasLayerDepth(tabId) {
    return this.depthState.has(tabId);
  }

  setLayerDepth(tabId, depth, maxDepth) {
    this.depthState.set(tabId, clampDepth(depth, maxDepth));
  }

  getRenderedDepth(tabId, maxDepth) {
    if (!this.renderedDepthState.has(tabId)) return null;
    return clampDepth(this.renderedDepthState.get(tabId), maxDepth);
  }

  setRenderedDepth(tabId, depth, maxDepth) {
    this.renderedDepthState.set(tabId, clampDepth(depth, maxDepth));
  }
}
