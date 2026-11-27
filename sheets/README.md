# Sheets

The spreadsheet editor and function wizard are kept together in this product.

- `app/`: React entry points, pages, services, stores and styles.
- `electron/`: windows, file operations, recovery and preload bridges.
- `tests/`: editor, document, formula and desktop integration checks.
- `scripts/`: spreadsheet benchmark and function catalog tooling.

The shared spreadsheet engine is in `packages/spreadsheet/src`.
Run commands from the repository root: `npm run check`, `npm run test:sheets`
and `npm run bench:engine`. Packaging continues through the root application.

To run this product's unit tests from the root, use `npm test --workspace=@formatted/sheets`.
