# Edit Mode Handoff

## Purpose

`edit-mode/` owns the editing-mode boundary for the Laddergraph UI.

Current edit mode is an interface shell, not the real graph-editing feature. It gives future agents a safe place to add editing tools without putting editing logic back into `graphviz-app.js`.

## Current Entry Points

- `edit-controller.js`
  - Main controller.
  - Exports `createEditModeController(...)`.
- `../edit-mode.js`
  - Compatibility wrapper.
  - Re-exports `createEditModeController` so existing imports keep working.

## Contract

The controller is created from `graphviz-app.js`:

```js
createEditModeController({
  rootEl: networkShell,
  toggleButton: editModeBtn,
  disabledRoot: appRoot,
});
```

Public methods:

- `mount()`
- `destroy()`
- `setEnabled(true | false)`
- `toggle()`
- `refreshDisabledState()`
- `isEnabled()`

Events:

- Dispatches `laddergraph:edit-mode-change` from `rootEl`.
- Event detail shape: `{ enabled }`.

## UI Rules

- Edit mode uses a red frame on `#networkShell`.
- While edit mode is enabled, normal controls are locked.
- Controls inside `[data-edit-mode-control]` remain available.
- Zoom controls must remain available in edit mode.
- `精修` mode should not be active at the same time as edit mode; `graphviz-app.js` currently enforces this.

## Where To Add Real Editing

Add editing-specific modules in this folder, for example:

```text
edit-mode/
  edit-controller.js
  edit-toolbar.js
  edit-node-color.js
  edit-selection-tools.js
```

Keep `graphviz-app.js` as the coordinator only. Do not put concrete editing behavior there.

## What Not To Do

- Do not mutate `sourceParsedGraph` directly from edit-mode tools.
- Do not disable zoom in edit mode.
- Do not mix refine-mode behavior into this folder.
- Do not remove `../edit-mode.js` unless all imports have been migrated.
