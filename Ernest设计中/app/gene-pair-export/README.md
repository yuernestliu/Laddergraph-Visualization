# Gene Pair Export Handoff

## Purpose

`gene-pair-export/` owns the two-node gene export feature.

User workflow:

1. Click one ladderon/node.
2. Hold `Ctrl` and click another ladderon/node.
3. The right detail panel shows an export button.
4. The button downloads a CSV containing:
   - genes/items in the first selected node;
   - genes/items in the second selected node;
   - their intersection;
   - their union.

## Files

- `gene-pair-export.js`
  - Main controller and CSV export helpers.
  - Tracks the primary and secondary selected nodes.
  - Reads node details through a callback supplied by `graphviz-app.js`.

## Contract

Created from `graphviz-app.js`:

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

The exported CSV has four side-by-side columns:

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

Current primary example is `00_20_ladderons.csv`, parsed by `app/ladderon-node-info.js`.

## What Not To Do

- Do not parse CSV again in this module.
- Do not fetch files here.
- Do not mutate graph data.
- Do not put this export logic into `graphviz-app.js`; keep `graphviz-app.js` as wiring only.
