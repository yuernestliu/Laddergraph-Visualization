function normalizeSequenceRecord(nodeId, rawRecord, nodeKind) {
  if (!Array.isArray(rawRecord)) return null;
  const sequence = String(rawRecord[2] ?? "").trim();
  if (!sequence) return null;

  const declaredLength = Number(rawRecord[1]);
  return {
    type: "sequence",
    id: String(nodeId),
    nodeKind,
    sequence,
    sequenceLength: Number.isFinite(declaredLength)
      ? declaredLength
      : Array.from(sequence).length,
  };
}

function addSequenceRecords(entriesById, records, nodeKind) {
  if (!records || typeof records !== "object" || Array.isArray(records)) return;
  for (const [nodeId, rawRecord] of Object.entries(records)) {
    const detail = normalizeSequenceRecord(nodeId, rawRecord, nodeKind);
    if (detail) entriesById.set(String(nodeId), detail);
  }
}

export function buildLadderpathSequenceDetailIndex(jsonText) {
  const payload = JSON.parse(String(jsonText || "").replace(/^\uFEFF/, ""));
  const entriesById = new Map();

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    addSequenceRecords(entriesById, payload.ladderons, "ladderon");
    addSequenceRecords(entriesById, payload.targets, "target");
  }

  return {
    format: "ladderpath-sequences",
    supported: entriesById.size > 0,
    headers: Array.from(entriesById.keys()),
    entriesById,
  };
}
