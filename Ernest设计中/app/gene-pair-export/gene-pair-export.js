function normalizeNodeId(nodeId) {
  return String(nodeId || "").trim();
}

function uniqueItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function getDetailItems(detail) {
  if (!detail) return [];
  if (detail.type === "geneColumn" && Array.isArray(detail.genes)) {
    return uniqueItems(detail.genes);
  }
  if (Array.isArray(detail.characters)) {
    return uniqueItems(detail.characters);
  }
  if (detail.rawDetail) {
    return uniqueItems(String(detail.rawDetail).split(/\s*[,，、]\s*/));
  }
  return [];
}

function intersectItems(leftItems, rightItems) {
  const rightSet = new Set(rightItems);
  return leftItems.filter((item) => rightSet.has(item));
}

function unionItems(leftItems, rightItems) {
  return uniqueItems([...leftItems, ...rightItems]);
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows) {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function downloadTextFile(filename, text, documentRef) {
  const blob = new Blob([`\uFEFF${text}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = documentRef.createElement("a");
  link.href = url;
  link.download = filename;
  documentRef.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFilenamePart(value) {
  return String(value || "node").replace(/[^\w.-]+/g, "_");
}

function makeExportRows(firstNodeId, secondNodeId, firstGenes, secondGenes, intersectionGenes, unionGenes) {
  const headers = [
    `${firstNodeId} 所有集`,
    `${secondNodeId} 所有集`,
    "交集",
    "并集",
  ];
  const maxLength = Math.max(
    firstGenes.length,
    secondGenes.length,
    intersectionGenes.length,
    unionGenes.length,
  );
  const rows = [headers];

  for (let index = 0; index < maxLength; index += 1) {
    rows.push([
      firstGenes[index] || "",
      secondGenes[index] || "",
      intersectionGenes[index] || "",
      unionGenes[index] || "",
    ]);
  }

  return rows;
}

function makePanel(documentRef) {
  const panel = documentRef.createElement("div");
  panel.className = "gene-pair-export";
  panel.hidden = true;

  const title = documentRef.createElement("h3");
  title.className = "gene-pair-export-title";
  title.textContent = "双节点基因导出";

  const meta = documentRef.createElement("p");
  meta.className = "gene-pair-export-meta";
  meta.textContent = "先点击一个梯元，再按 Ctrl 点击另一个梯元。";

  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "gene-pair-export-button";
  button.textContent = "导出基因交集 CSV";
  button.disabled = true;

  panel.append(title, meta, button);
  return { panel, meta, button };
}

export function createGenePairExportController(options = {}) {
  const {
    panelRoot,
    renderer = null,
    getNodeDetail = () => null,
    documentRef = document,
  } = options;

  const { panel, meta, button } = makePanel(documentRef);
  let firstNodeId = null;
  let secondNodeId = null;

  panelRoot?.append(panel);

  function getPairData() {
    if (!firstNodeId || !secondNodeId) return null;
    const firstGenes = getDetailItems(getNodeDetail(firstNodeId));
    const secondGenes = getDetailItems(getNodeDetail(secondNodeId));
    const intersectionGenes = intersectItems(firstGenes, secondGenes);
    const unionGenes = unionItems(firstGenes, secondGenes);
    return {
      firstNodeId,
      secondNodeId,
      firstGenes,
      secondGenes,
      intersectionGenes,
      unionGenes,
    };
  }

  function updateRendererMarks() {
    renderer?.setPairSelectionNodeIds?.(
      firstNodeId && secondNodeId ? [firstNodeId, secondNodeId] : [],
    );
  }

  function updatePanel() {
    const pairData = getPairData();
    panel.hidden = !firstNodeId;

    if (!firstNodeId) {
      meta.textContent = "先点击一个梯元，再按 Ctrl 点击另一个梯元。";
      button.disabled = true;
      updateRendererMarks();
      return;
    }

    if (!secondNodeId) {
      meta.textContent = `第一选择：${firstNodeId}。按 Ctrl 点击另一个梯元进行二次选择。`;
      button.disabled = true;
      updateRendererMarks();
      return;
    }

    const hasExportData =
      pairData.firstGenes.length > 0 ||
      pairData.secondGenes.length > 0 ||
      pairData.intersectionGenes.length > 0 ||
      pairData.unionGenes.length > 0;
    meta.textContent =
      `${firstNodeId}: ${pairData.firstGenes.length} 个；` +
      `${secondNodeId}: ${pairData.secondGenes.length} 个；` +
      `交集 ${pairData.intersectionGenes.length} 个；` +
      `并集 ${pairData.unionGenes.length} 个。`;
    button.disabled = !hasExportData;
    updateRendererMarks();
  }

  function clearPair() {
    firstNodeId = null;
    secondNodeId = null;
    updatePanel();
  }

  function setPrimaryNode(nodeId) {
    const id = normalizeNodeId(nodeId);
    firstNodeId = id || null;
    secondNodeId = null;
    updatePanel();
  }

  function handleNodeClick({ nodeId, event, activeSelectionNodeId } = {}) {
    const id = normalizeNodeId(nodeId);
    if (!id || !(event?.ctrlKey || event?.metaKey)) return false;

    const primaryId = firstNodeId || normalizeNodeId(activeSelectionNodeId);
    if (!primaryId || primaryId === id) return false;

    firstNodeId = primaryId;
    secondNodeId = id;
    updatePanel();
    return true;
  }

  function exportCurrentPair() {
    const pairData = getPairData();
    if (!pairData) return;

    const rows = makeExportRows(
      pairData.firstNodeId,
      pairData.secondNodeId,
      pairData.firstGenes,
      pairData.secondGenes,
      pairData.intersectionGenes,
      pairData.unionGenes,
    );
    const filename =
      `gene_pair_${safeFilenamePart(pairData.firstNodeId)}_${safeFilenamePart(pairData.secondNodeId)}.csv`;
    downloadTextFile(filename, rowsToCsv(rows), documentRef);
  }

  button.addEventListener("click", exportCurrentPair);

  return {
    handleNodeClick,
    setPrimaryNode,
    clearPair,
    refresh() {
      updatePanel();
    },
    destroy() {
      renderer?.setPairSelectionNodeIds?.([]);
      button.removeEventListener("click", exportCurrentPair);
      panel.remove();
    },
  };
}
