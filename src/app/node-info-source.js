import { buildNodeDetailIndex as buildRowNodeDetailIndex } from "./csv-node-details.js";
import { buildJsonNodeDetailIndex } from "./json-node-details.js";
import { buildLadderonNodeInfoIndex } from "./ladderon-node-info.js";
import { buildLadderpathSequenceDetailIndex } from "./ladderpath-json-details.js";
import bundledSequenceDetailsText from "../assets/example_graphs/神兽lg-2.json?raw";

const BUNDLED_NODE_DETAIL_CANDIDATES = new Map([
  [
    "神兽lg-2.gv",
    {
      text: bundledSequenceDetailsText,
      displayName: "神兽lg-2.json",
    },
  ],
]);

function getFilename(sourceName) {
  return String(sourceName || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || "";
}

function getDirectory(sourceName) {
  const sourcePath = String(sourceName || "");
  return sourcePath.includes("/")
    ? sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1)
    : "";
}

function getGraphBaseName(sourceName) {
  return getFilename(sourceName).replace(/\.(gv|dot|txt)$/i, "");
}

function looksLikeJson(text, sourceName) {
  if (/\.json$/i.test(getFilename(sourceName))) return true;
  const firstCharacter = String(text || "").replace(/^\uFEFF/, "").trimStart()[0];
  return firstCharacter === "{" || firstCharacter === "[";
}

export function buildBestNodeDetailIndex(text, sourceName = "") {
  if (looksLikeJson(text, sourceName)) {
    const sequenceIndex = buildLadderpathSequenceDetailIndex(text);
    if (sequenceIndex.supported) return sequenceIndex;
    const jsonIndex = buildJsonNodeDetailIndex(text);
    if (jsonIndex.supported) return jsonIndex;
    throw new Error("JSON 节点信息必须是以节点 ID 为 key、基因数组为 value 的对象。");
  }

  const ladderonIndex = buildLadderonNodeInfoIndex(text);
  if (ladderonIndex.supported && ladderonIndex.entriesById.size > 0) {
    return ladderonIndex;
  }
  return buildRowNodeDetailIndex(text);
}

export function getBundledNodeDetailCandidate(sourceName) {
  return BUNDLED_NODE_DETAIL_CANDIDATES.get(getFilename(sourceName)) || null;
}

export function getSameNameCsvCandidate(sourceName) {
  const baseName = getGraphBaseName(sourceName);
  if (!baseName) return "";
  return `${getDirectory(sourceName)}${baseName}.csv`;
}
