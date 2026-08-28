import {
  FONT_FAMILY,
  isScalableLadderNode,
  isTargetNode,
  layeredGradientColor,
  normalizeDisplayLabel,
  readableTextColor,
  splitDisplayLabel,
} from "../core/graphviz-core.js";
import {
  GRAPH_INPUT_KINDS,
  formatNodeIdForDisplay,
} from "../core/graph-input-profile.js";
import { sanitizeGraphvizSvgMarkup } from "../app/svg-sanitizer.js";

const HIGHLIGHT_RED = "#e60023";
const INCOMING_GREEN = "#2f9e44";
const CENTER_NODE_COLOR = "#5a0010";
const MIN_USER_SCALE = 0.08;
const MAX_USER_SCALE = 24;

export class GraphvizSvgRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.onNodeClick = options.onNodeClick || (() => false);
    this.onSelectionChange = options.onSelectionChange || (() => {});
    this.currentSvg = null;
    this.currentViewport = null;
    this.currentSubgraph = null;
    this.graphInputKind = GRAPH_INPUT_KINDS.GENERIC;
    this.nodeTextMode = "label";
    this.labelFontSize = 10;
    this.activeSelectionNodeId = null;
    this.nodeEntries = new Map();
    this.edgeEntries = new Map();
    this.activeNodeMeta = new Map();
    this.pairSelectionNodeIds = new Set();
    this.panSession = null;
    this.suppressBackgroundClick = false;

    this.bindContainerEvents();
  }

  hasGraph() {
    return Boolean(this.currentSvg);
  }

  hasNode(nodeId) {
    return this.nodeEntries.has(String(nodeId));
  }

  clear() {
    this.container.replaceChildren();
    this.container.classList.remove("is-rendering", "is-panning");
    this.currentSvg = null;
    this.currentViewport = null;
    this.currentSubgraph = null;
    this.activeSelectionNodeId = null;
    this.nodeEntries = new Map();
    this.edgeEntries = new Map();
    this.activeNodeMeta = new Map();
    this.pairSelectionNodeIds = new Set();
    this.panSession = null;
    this.suppressBackgroundClick = false;
  }

  setLoading(isLoading) {
    this.container.classList.toggle("is-rendering", Boolean(isLoading));
  }

  setPairSelectionNodeIds(nodeIds = []) {
    this.pairSelectionNodeIds = new Set(Array.from(nodeIds, String).filter(Boolean));
    for (const [nodeId, entry] of this.nodeEntries) {
      entry.group.classList.toggle("is-gene-pair-selected", this.pairSelectionNodeIds.has(String(nodeId)));
    }
  }

  getViewState(viewKey) {
    return {
      viewKey,
      viewport: this.currentViewport ? { ...this.currentViewport } : null,
      selectedNodeId: this.activeSelectionNodeId || null,
    };
  }

  restoreViewState(savedState, currentViewKey) {
    if (!savedState) return false;

    let restoredViewport = false;
    if (savedState.viewport && savedState.viewKey === currentViewKey) {
      this.applyViewport(savedState.viewport);
      restoredViewport = true;
    }

    if (savedState.selectedNodeId && this.nodeEntries.has(savedState.selectedNodeId)) {
      this.applySelectionHighlight(savedState.selectedNodeId);
    } else {
      this.applySelectionHighlight(null);
    }

    return restoredViewport;
  }

  render({ svgMarkup, parsed, graphInputKind, nodeTextMode, labelFontSize }) {
    this.clear();

    const svg = this.parseSvgMarkup(svgMarkup);
    const { width, height } = this.getSvgViewSizeFromElement(svg);
    svg.classList.add("graphviz-svg");
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.display = "block";
    svg.style.maxWidth = "none";
    svg.style.maxHeight = "none";
    svg.style.transformOrigin = "0 0";
    svg.style.userSelect = "none";
    svg.style.overflow = "visible";
    svg.setAttribute("overflow", "visible");
    if (width && height) {
      svg.setAttribute("width", `${width}`);
      svg.setAttribute("height", `${height}`);
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;
    }
    svg.setAttribute("aria-label", "Graphviz SVG");

    this.container.replaceChildren(svg);
    this.currentSvg = svg;
    this.currentSubgraph = parsed;
    this.graphInputKind = graphInputKind || GRAPH_INPUT_KINDS.GENERIC;
    this.nodeTextMode = nodeTextMode;
    this.labelFontSize = Math.max(6, Math.min(24, Number(labelFontSize || 10)));

    this.bindSvgGraph(svg, parsed);
    this.expandSvgViewToContent(svg);
  }

  fitToView() {
    this.applyViewport(this.computeFitViewport());
  }

  zoom(scaleFactor) {
    if (!this.currentSvg || !this.currentViewport) return;

    const rect = this.container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const nextScale = this.clampScale(this.currentViewport.scale * scaleFactor);
    const worldX = (centerX - this.currentViewport.x) / this.currentViewport.scale;
    const worldY = (centerY - this.currentViewport.y) / this.currentViewport.scale;

    this.applyViewport({
      scale: nextScale,
      x: centerX - worldX * nextScale,
      y: centerY - worldY * nextScale,
    });
  }

  parseSvgMarkup(svgMarkup) {
    const template = document.createElement("template");
    template.innerHTML = sanitizeGraphvizSvgMarkup(svgMarkup);
    const svg = template.content.querySelector("svg");
    if (!svg) {
      throw new Error("Graphviz 没有返回有效 SVG。");
    }
    return svg;
  }

  getSvgViewSize() {
    return this.getSvgViewSizeFromElement(this.currentSvg);
  }

  getSvgViewSizeFromElement(svg) {
    const viewBox = svg?.viewBox?.baseVal;
    if (viewBox && viewBox.width && viewBox.height) {
      return { width: viewBox.width, height: viewBox.height };
    }

    const width = Number.parseFloat(svg?.getAttribute("width") || "0");
    const height = Number.parseFloat(svg?.getAttribute("height") || "0");
    return { width, height };
  }

  syncSvgRenderedSize(svg) {
    const { width, height } = this.getSvgViewSizeFromElement(svg);
    if (!width || !height) return;
    svg.setAttribute("width", `${width}`);
    svg.setAttribute("height", `${height}`);
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
  }

  expandSvgViewToContent(svg) {
    let box = null;
    try {
      box = svg.getBBox();
    } catch {
      return;
    }
    if (!box || !box.width || !box.height) return;

    const padding = 30;
    const current = svg.viewBox?.baseVal;
    const currentX = current?.width ? current.x : box.x;
    const currentY = current?.height ? current.y : box.y;
    const currentMaxX = current?.width ? current.x + current.width : box.x + box.width;
    const currentMaxY = current?.height ? current.y + current.height : box.y + box.height;
    const minX = Math.min(currentX, box.x - padding);
    const minY = Math.min(currentY, box.y - padding);
    const maxX = Math.max(currentMaxX, box.x + box.width + padding);
    const maxY = Math.max(currentMaxY, box.y + box.height + padding);

    svg.setAttribute("viewBox", `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
    this.syncSvgRenderedSize(svg);
  }

  clampScale(scale) {
    return Math.max(MIN_USER_SCALE, Math.min(MAX_USER_SCALE, scale));
  }

  getAutoFitMaxScale() {
    const nodeCount = this.currentSubgraph?.nodes?.length || 0;
    if (nodeCount <= 6) return 1.05;
    if (nodeCount <= 12) return 1.25;
    if (nodeCount <= 24) return 1.65;
    if (nodeCount <= 48) return 2.4;
    return 4;
  }

  applyViewport(viewport) {
    if (!this.currentSvg) return;

    this.currentViewport = {
      x: Number(viewport.x || 0),
      y: Number(viewport.y || 0),
      scale: this.clampScale(Number(viewport.scale || 1)),
    };
    this.currentSvg.style.transform =
      `translate(${this.currentViewport.x}px, ${this.currentViewport.y}px) ` +
      `scale(${this.currentViewport.scale})`;
  }

  computeFitViewport() {
    if (!this.currentSvg) {
      return { x: 0, y: 0, scale: 1 };
    }

    const rect = this.container.getBoundingClientRect();
    const { width, height } = this.getSvgViewSize();
    if (!rect.width || !rect.height || !width || !height) {
      return { x: 0, y: 0, scale: 1 };
    }

    const fitPadding = 8;
    const usableWidth = Math.max(40, rect.width - fitPadding * 2);
    const usableHeight = Math.max(40, rect.height - fitPadding * 2);
    const fitScale = Math.min(usableWidth / width, usableHeight / height);
    const scale = this.clampScale(Math.min(fitScale, this.getAutoFitMaxScale()));
    return {
      x: (rect.width - width * scale) / 2,
      y: (rect.height - height * scale) / 2,
      scale,
    };
  }

  createSvgText(x, y, text, className, options = {}) {
    const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textEl.setAttribute("x", `${x}`);
    textEl.setAttribute("y", `${y}`);
    textEl.setAttribute("text-anchor", "middle");
    textEl.setAttribute("font-family", FONT_FAMILY);
    textEl.setAttribute("font-size", String(options.fontSize || 9.5));
    textEl.setAttribute("fill", options.fill || "#111111");
    textEl.setAttribute("class", className);
    textEl.style.paintOrder = "stroke fill";
    textEl.style.stroke = options.stroke || "rgba(255,255,255,0.92)";
    textEl.style.strokeWidth = String(options.strokeWidth || 3);
    textEl.textContent = text;
    return textEl;
  }

  captureNodeSnapshot(group) {
    return {
      shapes: Array.from(group.querySelectorAll("ellipse, circle, polygon, path, rect")).map((shape) => ({
        element: shape,
        fill: shape.getAttribute("fill"),
        stroke: shape.getAttribute("stroke"),
        strokeWidth: shape.getAttribute("stroke-width"),
      })),
      texts: Array.from(group.querySelectorAll("text")).map((text) => ({
        element: text,
        fill: text.getAttribute("fill"),
        fontWeight: text.getAttribute("font-weight"),
        styleStroke: text.style.stroke || "",
        styleStrokeWidth: text.style.strokeWidth || "",
      })),
    };
  }

  captureEdgeSnapshot(group) {
    return {
      shapes: Array.from(group.querySelectorAll("path, polygon, polyline")).map((shape) => ({
        element: shape,
        fill: shape.getAttribute("fill"),
        stroke: shape.getAttribute("stroke"),
        strokeWidth: shape.getAttribute("stroke-width"),
      })),
      texts: Array.from(group.querySelectorAll("text")).map((text) => ({
        element: text,
        fill: text.getAttribute("fill"),
        styleStroke: text.style.stroke || "",
        styleStrokeWidth: text.style.strokeWidth || "",
      })),
    };
  }

  resetSnapshot(snapshot) {
    if (!snapshot) return;

    for (const entry of snapshot.shapes || []) {
      if (entry.fill == null) entry.element.removeAttribute("fill");
      else entry.element.setAttribute("fill", entry.fill);
      if (entry.stroke == null) entry.element.removeAttribute("stroke");
      else entry.element.setAttribute("stroke", entry.stroke);
      if (entry.strokeWidth == null) entry.element.removeAttribute("stroke-width");
      else entry.element.setAttribute("stroke-width", entry.strokeWidth);
    }

    for (const entry of snapshot.texts || []) {
      if (entry.fill == null) entry.element.removeAttribute("fill");
      else entry.element.setAttribute("fill", entry.fill);
      if ("fontWeight" in entry) {
        if (entry.fontWeight == null) entry.element.removeAttribute("font-weight");
        else entry.element.setAttribute("font-weight", entry.fontWeight);
      }
      entry.element.style.stroke = entry.styleStroke || "";
      entry.element.style.strokeWidth = entry.styleStrokeWidth || "";
    }
  }

  resetAllHighlights() {
    for (const entry of this.nodeEntries.values()) {
      entry.group.classList.remove("is-selected", "is-related-up", "is-related-down");
      this.resetSnapshot(entry.snapshot);
    }

    for (const entries of this.edgeEntries.values()) {
      for (const entry of entries) {
        entry.group.classList.remove("is-related-up", "is-related-down");
        this.resetSnapshot(entry.snapshot);
      }
    }
  }

  setNodeVisual(nodeId, fillColor, strokeColor, textColor, borderWidth = 2.4) {
    const entry = this.nodeEntries.get(nodeId);
    if (!entry) return;

    for (const shape of entry.group.querySelectorAll("ellipse, circle, polygon, path, rect")) {
      if (shape.getAttribute("fill") !== "none") {
        shape.setAttribute("fill", fillColor);
      }
      shape.setAttribute("stroke", strokeColor);
      shape.setAttribute("stroke-width", String(borderWidth));
    }

    for (const text of entry.group.querySelectorAll("text")) {
      const labelRole = text.getAttribute("data-label-role");
      if (labelRole === "top") {
        text.setAttribute("fill", "#111111");
        text.style.stroke = "rgba(255,255,255,0.96)";
        text.style.strokeWidth = "3px";
      } else {
        text.setAttribute("fill", textColor);
        text.style.stroke =
          textColor === "#ffffff" ? "rgba(0,0,0,0.78)" : "rgba(255,255,255,0.96)";
        text.style.strokeWidth = text.getAttribute("data-label-role") ? "2.2px" : "";
      }
      text.setAttribute("font-weight", "600");
    }
  }

  setEdgeVisual(edgeId, strokeColor, width = 2.8) {
    const entries = this.edgeEntries.get(edgeId) || [];
    for (const entry of entries) {
      for (const shape of entry.group.querySelectorAll("path, polygon, polyline")) {
        const tagName = shape.tagName.toLowerCase();
        if (tagName === "polygon") {
          shape.setAttribute("fill", strokeColor);
          shape.setAttribute("stroke", strokeColor);
        } else {
          if (shape.getAttribute("fill") !== "none") {
            shape.setAttribute("fill", strokeColor);
          }
          shape.setAttribute("stroke", strokeColor);
        }
        shape.setAttribute("stroke-width", String(width));
      }

      for (const text of entry.group.querySelectorAll("text")) {
        text.setAttribute("fill", strokeColor);
      }
    }
  }

  computeDirectionalReach(centerId) {
    const outgoingByNode = new Map();
    const incomingByNode = new Map();

    for (const node of this.currentSubgraph?.nodes || []) {
      outgoingByNode.set(node.id, []);
      incomingByNode.set(node.id, []);
    }

    for (const edge of this.currentSubgraph?.edges || []) {
      if (!outgoingByNode.has(edge.from)) outgoingByNode.set(edge.from, []);
      if (!incomingByNode.has(edge.to)) incomingByNode.set(edge.to, []);
      outgoingByNode.get(edge.from).push(edge);
      incomingByNode.get(edge.to).push(edge);
    }

    const upNodeDist = new Map([[centerId, 0]]);
    const upEdgeDist = new Map();
    const upQueue = [centerId];
    while (upQueue.length) {
      const nodeId = upQueue.shift();
      const distance = upNodeDist.get(nodeId) || 0;
      for (const edge of outgoingByNode.get(nodeId) || []) {
        const step = distance + 1;
        const edgeId = `${edge.from}->${edge.to}`;
        const prevEdge = upEdgeDist.get(edgeId);
        if (prevEdge == null || step < prevEdge) upEdgeDist.set(edgeId, step);
        if (!upNodeDist.has(edge.to)) {
          upNodeDist.set(edge.to, step);
          upQueue.push(edge.to);
        }
      }
    }

    const downNodeDist = new Map([[centerId, 0]]);
    const downEdgeDist = new Map();
    const downQueue = [centerId];
    while (downQueue.length) {
      const nodeId = downQueue.shift();
      const distance = downNodeDist.get(nodeId) || 0;
      for (const edge of incomingByNode.get(nodeId) || []) {
        const step = distance + 1;
        const edgeId = `${edge.from}->${edge.to}`;
        const prevEdge = downEdgeDist.get(edgeId);
        if (prevEdge == null || step < prevEdge) downEdgeDist.set(edgeId, step);
        if (!downNodeDist.has(edge.from)) {
          downNodeDist.set(edge.from, step);
          downQueue.push(edge.from);
        }
      }
    }

    return { upNodeDist, upEdgeDist, downNodeDist, downEdgeDist };
  }

  applySelectionHighlight(nodeId) {
    this.activeSelectionNodeId = nodeId || null;
    this.resetAllHighlights();
    if (!nodeId) {
      this.onSelectionChange(null);
      return;
    }

    const { upNodeDist, upEdgeDist, downNodeDist, downEdgeDist } =
      this.computeDirectionalReach(nodeId);
    const maxUpNodeDist = Math.max(0, ...upNodeDist.values());
    const maxDownNodeDist = Math.max(0, ...downNodeDist.values());
    const maxUpEdgeDist = Math.max(0, ...upEdgeDist.values());
    const maxDownEdgeDist = Math.max(0, ...downEdgeDist.values());

    const centerEntry = this.nodeEntries.get(nodeId);
    if (centerEntry) {
      centerEntry.group.classList.add("is-selected");
    }
    this.setNodeVisual(
      nodeId,
      CENTER_NODE_COLOR,
      "#000000",
      readableTextColor(CENTER_NODE_COLOR),
      3.2,
    );

    for (const [targetId, distance] of upNodeDist.entries()) {
      if (targetId === nodeId || distance <= 0) continue;
      const color = layeredGradientColor(HIGHLIGHT_RED, distance, maxUpNodeDist);
      this.nodeEntries.get(targetId)?.group.classList.add("is-related-up");
      this.setNodeVisual(targetId, color, "#111111", readableTextColor(color), 2.8);
    }

    for (const [targetId, distance] of downNodeDist.entries()) {
      if (targetId === nodeId || distance <= 0 || upNodeDist.has(targetId)) continue;
      const color = layeredGradientColor(INCOMING_GREEN, distance, maxDownNodeDist);
      this.nodeEntries.get(targetId)?.group.classList.add("is-related-down");
      this.setNodeVisual(targetId, color, "#111111", readableTextColor(color), 2.8);
    }

    for (const [edgeId, distance] of upEdgeDist.entries()) {
      const color = layeredGradientColor(HIGHLIGHT_RED, distance, maxUpEdgeDist);
      for (const entry of this.edgeEntries.get(edgeId) || []) {
        entry.group.classList.add("is-related-up");
      }
      this.setEdgeVisual(edgeId, color, 2.8);
    }

    for (const [edgeId, distance] of downEdgeDist.entries()) {
      if (upEdgeDist.has(edgeId)) continue;
      const color = layeredGradientColor(INCOMING_GREEN, distance, maxDownEdgeDist);
      for (const entry of this.edgeEntries.get(edgeId) || []) {
        entry.group.classList.add("is-related-down");
      }
      this.setEdgeVisual(edgeId, color, 2.8);
    }

    this.onSelectionChange(nodeId);
  }

  decorateSplitLabelNodes() {
    if (this.nodeTextMode === "none") {
      for (const entry of this.nodeEntries.values()) {
        entry.group.querySelectorAll("text").forEach((text) => text.remove());
        entry.group.querySelectorAll(".codex-split-label").forEach((label) => label.remove());
      }
      return;
    }

    for (const [nodeId, entry] of this.nodeEntries) {
      const nodeMeta = this.activeNodeMeta.get(nodeId);
      const isTarget = isTargetNode(nodeMeta?.attrs || {}, nodeId);
      const isLadder = isScalableLadderNode(nodeMeta?.attrs || {}, nodeId);
      if (!nodeMeta || (!isTarget && !isLadder)) continue;

      entry.group.querySelectorAll("text").forEach((text) => text.remove());
      entry.group.querySelectorAll(".codex-split-label").forEach((label) => label.remove());

      const shape =
        entry.group.querySelector("ellipse, circle, polygon, path, rect") ||
        entry.group.querySelector("*");
      if (!shape) continue;

      const box = shape.getBBox();
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      const parts =
        this.nodeTextMode === "id"
          ? { top: "", inner: formatNodeIdForDisplay(nodeMeta, this.graphInputKind) }
          : splitDisplayLabel(nodeMeta.attrs?.label || nodeId);

      const innerFontSize = isTarget ? this.labelFontSize + 2 : this.labelFontSize + 3;
      const topFontSize = isTarget ? this.labelFontSize + 2.5 : this.labelFontSize + 3.5;

      if (parts.inner) {
        const innerLabel = this.createSvgText(
          centerX,
          centerY + innerFontSize * 0.36,
          parts.inner,
          "codex-split-label",
          {
            fontSize: innerFontSize,
            fill: "#111111",
            stroke: "#ffffff",
            strokeWidth: isTarget ? 3.2 : 3.5,
          },
        );
        innerLabel.setAttribute("data-label-role", "inner");
        entry.group.append(innerLabel);
      }

      if (parts.top) {
        const topLabel = this.createSvgText(centerX, box.y - 6, parts.top, "codex-split-label", {
          fontSize: topFontSize,
          fill: "#111111",
          stroke: "rgba(255,255,255,0.92)",
          strokeWidth: isTarget ? 3.3 : 3.6,
        });
        topLabel.setAttribute("data-label-role", "top");
        topLabel.setAttribute("dominant-baseline", "auto");
        entry.group.append(topLabel);
      }
    }
  }

  bindSvgGraph(svg, parsed) {
    this.activeNodeMeta = new Map(parsed.nodes.map((node) => [String(node.id), node]));
    this.nodeEntries = new Map();
    this.edgeEntries = new Map();

    for (const group of svg.querySelectorAll("g.node")) {
      const title = group.querySelector("title")?.textContent?.trim();
      if (!title) continue;
      group.dataset.nodeId = title;
      group.classList.add("graph-node");
      this.nodeEntries.set(title, {
        group,
        snapshot: null,
      });
    }

    this.decorateSplitLabelNodes();

    for (const [nodeId, entry] of this.nodeEntries) {
      entry.snapshot = this.captureNodeSnapshot(entry.group);
      entry.group.addEventListener("click", (event) => {
        event.stopPropagation();
        const handled = this.onNodeClick({
          nodeId,
          event,
          activeSelectionNodeId: this.activeSelectionNodeId,
        });
        if (handled) return;
        this.applySelectionHighlight(nodeId === this.activeSelectionNodeId ? null : nodeId);
      });
    }

    for (const group of svg.querySelectorAll("g.edge")) {
      const title = group.querySelector("title")?.textContent?.trim();
      if (!title) continue;
      group.dataset.edgeId = title;
      group.classList.add("graph-edge");
      if (!this.edgeEntries.has(title)) {
        this.edgeEntries.set(title, []);
      }
      this.edgeEntries.get(title).push({
        group,
        snapshot: this.captureEdgeSnapshot(group),
      });
    }
  }

  bindContainerEvents() {
    this.container.addEventListener("pointerdown", (event) => {
      if (!this.currentSvg || event.button !== 0) return;
      if (event.target.closest("g.node")) return;

      this.panSession = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: this.currentViewport?.x || 0,
        startY: this.currentViewport?.y || 0,
        moved: false,
      };
      this.container.setPointerCapture(event.pointerId);
      this.container.classList.add("is-panning");
    });

    this.container.addEventListener("pointermove", (event) => {
      if (!this.panSession || event.pointerId !== this.panSession.pointerId || !this.currentViewport) {
        return;
      }

      const dx = event.clientX - this.panSession.startClientX;
      const dy = event.clientY - this.panSession.startClientY;
      if (!this.panSession.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        this.panSession.moved = true;
        this.suppressBackgroundClick = true;
      }

      this.applyViewport({
        x: this.panSession.startX + dx,
        y: this.panSession.startY + dy,
        scale: this.currentViewport.scale,
      });
    });

    const finishPan = (event) => {
      if (!this.panSession || event.pointerId !== this.panSession.pointerId) return;
      if (this.container.hasPointerCapture(event.pointerId)) {
        this.container.releasePointerCapture(event.pointerId);
      }
      this.container.classList.remove("is-panning");
      this.panSession = null;
    };

    this.container.addEventListener("pointerup", finishPan);
    this.container.addEventListener("pointercancel", finishPan);

    this.container.addEventListener("click", (event) => {
      if (event.target.closest("g.node")) return;
      if (this.suppressBackgroundClick) {
        this.suppressBackgroundClick = false;
        return;
      }
      this.applySelectionHighlight(null);
    });
  }
}
