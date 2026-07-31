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
}
