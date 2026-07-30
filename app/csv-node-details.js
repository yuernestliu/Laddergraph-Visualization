const DETAIL_PREVIEW_ITEM_LIMIT = 160;

function stripBom(value) {
  return String(value || "").replace(/^\uFEFF/, "");
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const source = stripBom(text);

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => String(cell || "").trim()));
}

function findColumnIndex(headers, candidates, fallback = -1) {
  for (const candidate of candidates) {
    const index = headers.findIndex((header) => header.trim() === candidate);
    if (index >= 0) return index;
  }
  return fallback;
}

function normalizeLookupId(nodeId) {
  return String(nodeId || "").trim();
}

function buildEntry(headers, cells, indexes) {
  const rawCharacters = String(cells[indexes.detail] || "").trim();
  const characters = rawCharacters
    .split(/\s*[,，、]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  const previewCharacters = characters.slice(0, DETAIL_PREVIEW_ITEM_LIMIT);

  return {
    id: String(cells[indexes.id] || "").trim(),
    unit: String(cells[indexes.unit] || "").trim(),
    level: String(cells[indexes.level] || "").trim(),
    weight: String(cells[indexes.weight] || "").trim(),
    detailHeader: headers[indexes.detail] || "详情",
    rawDetail: rawCharacters,
    characters,
    previewCharacters,
    hiddenCharacterCount: Math.max(0, characters.length - previewCharacters.length),
  };
}

export function buildNodeDetailIndex(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) {
    return { rows: [], entriesById: new Map(), headers: [] };
  }

  const headers = rows[0].map((header) => stripBom(header).trim());
  const indexes = {
    level: findColumnIndex(headers, ["层级"], 0),
    unit: findColumnIndex(headers, ["梯元"], 1),
    id: findColumnIndex(headers, ["梯元id", "ID", "id"], 2),
    weight: findColumnIndex(headers, ["重数"], 3),
    detail: headers.length - 1,
  };
  const entriesById = new Map();

  for (const cells of rows.slice(1)) {
    const id = normalizeLookupId(cells[indexes.id]);
    if (!id) continue;
    entriesById.set(id, buildEntry(headers, cells, indexes));
  }

  return { rows, entriesById, headers };
}

export function getNodeDetail(detailIndex, nodeId) {
  if (!detailIndex || !nodeId) return null;

  const id = normalizeLookupId(nodeId);
  if (detailIndex.entriesById.has(id)) {
    return detailIndex.entriesById.get(id);
  }

  if (id.startsWith("-") && detailIndex.entriesById.has(id.slice(1))) {
    return detailIndex.entriesById.get(id.slice(1));
  }

  return null;
}
