import { parseCsv } from "./csv-node-details.js";

function normalizeNodeId(value) {
  return String(value || "").trim();
}

function isNodeIdHeader(value) {
  return /^-?\d+$/.test(normalizeNodeId(value));
}

function collectColumnValues(rows, columnIndex) {
  return rows
    .map((row) => String(row[columnIndex] || "").trim())
    .filter(Boolean);
}

export function buildLadderonNodeInfoIndex(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) {
    return {
      format: "ladderon-column-genes",
      supported: false,
      rows: [],
      headers: [],
      entriesById: new Map(),
    };
  }

  const headers = rows[0].map((header) => normalizeNodeId(header));
  const nodeColumnIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => isNodeIdHeader(header));

  const mostlyNodeColumns = nodeColumnIndexes.length >= 2 && nodeColumnIndexes.length >= headers.length * 0.5;
  if (!mostlyNodeColumns) {
    return {
      format: "ladderon-column-genes",
      supported: false,
      rows,
      headers,
      entriesById: new Map(),
    };
  }

  const dataRows = rows.slice(1);
  const entriesById = new Map();
  for (const { header, index } of nodeColumnIndexes) {
    const genes = collectColumnValues(dataRows, index);
    entriesById.set(header, {
      type: "geneColumn",
      id: header,
      columnIndex: index,
      detailHeader: "基因",
      genes,
      geneCount: genes.length,
    });
  }

  return {
    format: "ladderon-column-genes",
    supported: true,
    rows,
    headers,
    entriesById,
  };
}
