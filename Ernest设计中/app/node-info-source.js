import { buildNodeDetailIndex as buildRowNodeDetailIndex } from "./csv-node-details.js";
import { buildJsonNodeDetailIndex } from "./json-node-details.js";
import { buildLadderonNodeInfoIndex } from "./ladderon-node-info.js";

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

function getGraphNodeInfoStems(sourceName) {
  const baseName = getGraphBaseName(sourceName);
  if (!baseName) return [];

  const stems = [baseName];
  const rangeMatch = baseName.match(/-(\d+_\d+)(?:-|$)/);
  if (rangeMatch) {
    stems.push(`${rangeMatch[1]}_ladderons`);
  }
  return Array.from(new Set(stems));
}

function looksLikeJson(text, sourceName) {
  if (/\.json$/i.test(getFilename(sourceName))) return true;
  const firstCharacter = String(text || "").replace(/^\uFEFF/, "").trimStart()[0];
  return firstCharacter === "{" || firstCharacter === "[";
}

export function buildBestNodeDetailIndex(text, sourceName = "") {
  if (looksLikeJson(text, sourceName)) {
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

export function getNodeInfoCandidatesForGraph(sourceName) {
  const stems = getGraphNodeInfoStems(sourceName);
  if (!stems.length) return [];

  const directory = getDirectory(sourceName);
  const directories = Array.from(new Set([
    directory,
    "./graphs/PHIRE/",
    "./graphs/",
    "./",
  ].filter(Boolean)));
  const candidates = [];

  for (const extension of ["json", "csv"]) {
    for (const candidateDirectory of directories) {
      for (const stem of stems) {
        candidates.push(`${candidateDirectory}${stem}.${extension}`);
      }
    }
  }

  return Array.from(new Set(candidates));
}
