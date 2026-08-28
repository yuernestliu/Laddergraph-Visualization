export const GRAPH_INPUT_KINDS = Object.freeze({
  GENERIC: "generic",
  SEQUENCE: "sequence",
  COLLECTION: "collection",
});

const BRACKETED_NUMBER_PATTERN = /\[([0-9][0-9,]*)\]/g;
const SEQUENCE_LABEL_PATTERN = /\[[0-9][0-9,]*\](?:\s+\([0-9][0-9,]*\))?\s*$/;
const COLLECTION_LABEL_PATTERN = /\[[0-9][0-9,]*\]\.\s*$/;

function normalizeLabel(rawLabel) {
  return String(rawLabel ?? "").replace(/\\n/g, "\n").trim();
}

function countMatchingLabels(parsed, pattern) {
  return (parsed?.nodes || []).reduce((count, node) => {
    const label = normalizeLabel(node.attrs?.label);
    return count + (pattern.test(label) ? 1 : 0);
  }, 0);
}

const INPUT_PROFILES = Object.freeze({
  [GRAPH_INPUT_KINDS.SEQUENCE]: Object.freeze({
    kind: GRAPH_INPUT_KINDS.SEQUENCE,
    score(parsed) {
      return countMatchingLabels(parsed, SEQUENCE_LABEL_PATTERN);
    },
    formatNodeId(node) {
      const nodeId = String(node?.id ?? "");
      const lengthSuffix = extractSequenceLengthSuffix(node?.attrs?.label);
      return lengthSuffix ? `${nodeId}${lengthSuffix}` : nodeId;
    },
  }),
  [GRAPH_INPUT_KINDS.COLLECTION]: Object.freeze({
    kind: GRAPH_INPUT_KINDS.COLLECTION,
    score(parsed) {
      return countMatchingLabels(parsed, COLLECTION_LABEL_PATTERN);
    },
    formatNodeId(node) {
      return String(node?.id ?? "");
    },
  }),
  [GRAPH_INPUT_KINDS.GENERIC]: Object.freeze({
    kind: GRAPH_INPUT_KINDS.GENERIC,
    score() {
      return 0;
    },
    formatNodeId(node) {
      return String(node?.id ?? "");
    },
  }),
});

export function extractSequenceLengthSuffix(rawLabel) {
  const matches = Array.from(normalizeLabel(rawLabel).matchAll(BRACKETED_NUMBER_PATTERN));
  const lengthText = matches.at(-1)?.[1];
  return lengthText ? `[${lengthText}]` : "";
}

export function buildSequenceNodeDetail(node, inputKind = GRAPH_INPUT_KINDS.GENERIC) {
  if (!node || inputKind !== GRAPH_INPUT_KINDS.SEQUENCE) return null;
  const label = normalizeLabel(node.attrs?.label);
  const matches = Array.from(label.matchAll(BRACKETED_NUMBER_PATTERN));
  const lengthMatch = matches.at(-1);
  if (!lengthMatch) return null;

  const sequence = label.slice(0, lengthMatch.index).trim();
  const nodeId = String(node.id ?? "");
  if (!sequence || sequence === nodeId) return null;

  const parsedLength = Number(lengthMatch[1].replace(/,/g, ""));
  return {
    type: "sequence",
    id: nodeId,
    sequence,
    sequenceLength: Number.isFinite(parsedLength) ? parsedLength : Array.from(sequence).length,
  };
}

export function detectGraphInputKind(parsed) {
  const sequenceScore = INPUT_PROFILES[GRAPH_INPUT_KINDS.SEQUENCE].score(parsed);
  const collectionScore = INPUT_PROFILES[GRAPH_INPUT_KINDS.COLLECTION].score(parsed);

  if (sequenceScore > collectionScore) return GRAPH_INPUT_KINDS.SEQUENCE;
  if (collectionScore > sequenceScore) return GRAPH_INPUT_KINDS.COLLECTION;
  return GRAPH_INPUT_KINDS.GENERIC;
}

export function formatNodeIdForDisplay(node, inputKind = GRAPH_INPUT_KINDS.GENERIC) {
  const profile = INPUT_PROFILES[inputKind] || INPUT_PROFILES[GRAPH_INPUT_KINDS.GENERIC];
  return profile.formatNodeId(node);
}
