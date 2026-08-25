# Gene Pair Export Handoff

## Purpose

`gene-pair-export/` owns both single-node and two-node gene export.

User workflow:

1. Click one ladderon/node.
2. The right detail panel immediately allows exporting that node's genes/items.
3. Optionally hold `Ctrl`/`Command` and click another ladderon/node.
4. The two-node export downloads a CSV containing:
   - genes/items in the first selected node;
   - genes/items in the second selected node;
   - their intersection;
   - their union.

## Files

- `gene-pair-export.js`
  - Main controller and CSV export helpers.
  - Tracks the primary and secondary selected nodes.
  - Reads node details through a callback supplied by `src/main.js`.

## Contract

Created from `src/main.js`:

```js
createGenePairExportController({
  panelRoot: genePairExportPanel,
  renderer,
  getNodeDetail: (nodeId) => getNodeDetail(currentNodeDetailIndex, nodeId),
});
```

Public methods:

- `handleNodeClick({ nodeId, event, activeSelectionNodeId })`
- `setPrimaryNode(nodeId)`
- `clearPair()`
- `refresh()`
- `destroy()`

## CSV Format

The single-node CSV has one column:

```csv
<node id> 所有集
<gene from node>
```

The two-node CSV has four side-by-side columns:

```csv
<first node id> 所有集,<second node id> 所有集,交集,并集
<gene from first>,<gene from second>,<gene in intersection>,<gene in union>
```

Columns can have different lengths. Shorter columns are padded with empty cells.

The file is UTF-8 with BOM so Excel opens Chinese text reliably.

## Detail Source

The module expects `getNodeDetail(nodeId)` to return one of:

- `detail.type === "geneColumn"` with `detail.genes`
- row-style details with `detail.characters`
- fallback `detail.rawDetail`

Current primary format is JSON node information such as `03_300_ladderons.json`, parsed by
`src/app/json-node-details.js`. Legacy CSV node information remains supported.

## What Not To Do

- Do not parse CSV again in this module.
- Do not fetch files here.
- Do not mutate graph data.
- Do not put this export logic into `src/main.js`; keep `src/main.js` as wiring only.
