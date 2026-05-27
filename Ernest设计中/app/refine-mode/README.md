# Refine Mode Handoff

## Purpose

`refine-mode/` owns the "精修" feature.

精修 is a display-projection layer. It must not change the original source graph. It receives the current display subgraph and returns a refined graph for rendering.

Pipeline:

```text
source graph
  -> normal filters: layer / M / component tab
  -> refine projection
  -> Graphviz render
```

## Current Entry Points

- `refine-controller.js`
  - Main mode controller.
  - Owns mode state, control locking, toolbar lifecycle, and public API.
- `refine-state.js`
  - Stores user refine marks:
    - focused nodes
    - hidden nodes
    - collapsed nodes
    - focus-only flag
- `refine-projection.js`
  - Converts `(graph, state)` into a projected graph.
  - Current first version:
    - hidden nodes are removed with incident edges;
    - collapsed nodes stay as blue capsule-style placeholder nodes;
    - focused nodes are marked visually;
    - focus-only keeps focused nodes plus direct neighbors.
- `refine-toolbar.js`
  - Builds the in-window refine toolbar.

## Contract

Created from `graphviz-app.js`:

```js
createRefineModeController({
  rootEl: networkShell,
  toggleButton: refineModeBtn,
  disabledRoot: appRoot,
  onChange,
  onProjectionChange,
});
```

Public methods:

- `mount()`
- `destroy()`
- `setEnabled(true | false)`
- `toggle()`
- `setSelectedNode(nodeId)`
- `projectGraph(parsed)`
- `getProjectionSignature()`
- `clear()`
- `refreshDisabledState()`
- `isEnabled()`
- `isEmpty()`
- `getStateSnapshot()`

Events:

- Dispatches `laddergraph:refine-mode-change` from `rootEl`.
- Event detail shape: `{ enabled, state }`.

## UI Rules

- Refine mode uses a blue frame on `#networkShell`.
- While refine mode is enabled, normal controls are locked.
- Controls inside `[data-refine-mode-control]` remain available.
- Zoom controls must remain available in refine mode.
- Edit mode and refine mode should not be active at the same time; `graphviz-app.js` currently enforces this.

## Current User Actions

The toolbar currently supports:

- `关注`
- `隐藏`
- `折叠`
- `展开`
- `取消标记`
- `只看关注`
- `清空`
- `退出`

## Extension Points

For future refinement logic:

- Add graph-projection algorithms in `refine-projection.js`.
- Add state fields in `refine-state.js`.
- Add UI buttons in `refine-toolbar.js`.
- Keep only wiring in `refine-controller.js`.

## What Not To Do

- Do not mutate `sourceParsedGraph`.
- Do not mutate the graph passed into `projectGraph`; return cloned nodes/edges when decorating.
- Do not put refine action logic in `graphviz-app.js`.
- Do not mix edit-mode behavior into this folder.
- Do not create a second tab/component splitting pipeline here; use the graph passed in by the main display pipeline.
