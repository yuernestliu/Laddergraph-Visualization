function normalizeNodeId(value) {
  return String(value ?? "").trim();
}

function normalizeGenes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((gene) => String(gene ?? "").trim())
    .filter(Boolean);
}

export function buildJsonNodeDetailIndex(jsonText) {
  const payload = JSON.parse(String(jsonText || "").replace(/^\uFEFF/, ""));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      format: "json-node-genes",
      supported: false,
      headers: [],
      entriesById: new Map(),
    };
  }

  const entriesById = new Map();
  for (const [rawNodeId, rawGenes] of Object.entries(payload)) {
    const nodeId = normalizeNodeId(rawNodeId);
    if (!nodeId || !Array.isArray(rawGenes)) continue;

    const genes = normalizeGenes(rawGenes);
    entriesById.set(nodeId, {
      type: "geneColumn",
      id: nodeId,
      detailHeader: "基因",
      genes,
      geneCount: genes.length,
    });
  }

  return {
    format: "json-node-genes",
    supported: entriesById.size > 0,
    headers: Array.from(entriesById.keys()),
    entriesById,
  };
}
