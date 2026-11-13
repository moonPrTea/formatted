# Studio runtime widgets

`runtime-grid.ts` renders DataGridView snapshots and sends edit, click, delete
and add events. `runtime-list.ts` renders ComboBox/ListBox snapshots. They use
the published runtime model and the browser DOM without Node access.

Grid text and list options use textContent. An unacknowledged list draft is
preserved until the runtime acknowledges it. Blocking a grid cancels its editor
and prevents old event handlers from submitting changes.

Run `node scripts/test-ui.mjs runtime-widgets-desktop.cjs` after `npm run build`.
The suite also runs in the normal macOS UI CI job. It checks these components in
Electron's sandboxed renderer. The complete Studio window and runtime wiring
remain separate publication steps.

The snapshot renderer, sandboxed preload and form CSS are now built together.
The tests cover draft acknowledgement, disabled forms and removed controls;
the process/window controller remains a separate publication step.
