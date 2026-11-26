# Spreadsheet engine

Headless TypeScript module for the exam's INDEX/MATCH exercises. No runtime dependencies, backend, Python or LibreOffice required. Import from `index.ts` (compiled JavaScript uses `index.js`). The separate editor in `sheets/app/` uses it; the original native Calc lesson remains independent.

```ts
import {Workbook, isCellError} from './src/index.js';

const book = new Workbook();
book.addSheet('Data');
book.addSheet('Categories');
book.setCells([
  {sheet: 'Categories', address: 'A2', input: 40},
  {sheet: 'Categories', address: 'B2', input: 'Sports'},
  {sheet: 'Data', address: 'C2', input: 'Sports'},
]);
book.setFormula(
  'Data',
  'D2',
  '=INDEX(Categories.$A$2:$A$4;MATCH(C2;Categories.$B$2:$B$4;0))',
);
const result = book.getValue('Data', 'D2'); // 40, not the MATCH position
if (isCellError(result)) console.error(result.code);
book.copyRange('Data', 'D2', 'Data', 'D3');
book.getFormula('Data', 'D3', 'ru'); // ИНДЕКС / ПОИСКПОЗ
```

## Contract

| Area          | Supported                                                               |
| ------------- | ----------------------------------------------------------------------- |
| Values        | Text, finite numbers, booleans, blank (`null`), structured errors       |
| Formulas      | `INDEX` / `ИНДЕКС`, exact `MATCH` / `ПОИСКПОЗ`, `+ - * /`, parentheses  |
| References    | A1, `$A$1`, mixed references, rectangular ranges, quoted sheet names    |
| Edits         | Atomic batches, overlapping range copies, relative-reference adjustment |
| Recalculation | Lazy cached reads; dependency changes invalidate affected formulas      |
| Safety        | Parser without JavaScript execution; cycle, size and calculation limits |

`setCell` stores strings literally, including leading `=` and leading zeros. Only `setFormula` or `{formula: '...'}` enables calculation. `getCell` returns the original input; `getFormula` returns canonical syntax in either language. Invalid formulas return a `CellError`; invalid API inputs and capacity overflow throw without partially applying a batch.

Names are case insensitive. MATCH uses literal, case-insensitive text and strict value types: `"001"`, `1`, an empty string and a blank are distinct. Spaces are significant. Arithmetic treats blanks as zero and booleans as 0/1, but does not convert numeric strings. Function arguments use `;`, decimals use `.`, sheet references use Calc's `Sheet.A1` notation.

Copying changes relative row/column references; explicit sheet names remain unchanged even when copying between sheets. Range dependencies are conservative: editing any referenced cell invalidates the formula, even if INDEX previously selected another cell.

## Limits and exclusions

The exported `limits` object bounds this first version: 20,000 populated cells, 128 sheets, 10,000 referenced cells per formula, 200,000 dependency edges, 4,096 formula characters, 512 tokens, 64 parser nesting levels, 128 nested formula cells and 100,000 evaluation steps per read. A1 addresses extend to XFD1048576; this does not allocate an entire grid. These are safety limits, not throughput guarantees.

No approximate MATCH, wildcard/regex search, named ranges, array results, whole-column ranges, Excel `!` references, additional functions, date formats, sheet deletion/renaming, row insertion, undo, CSV/XLSX/ODS I/O or UI. INDEX supports a single range with positive row/column positions, not its multi-area or array forms. Error labels include engine-specific `#LIMIT!`, `#CYCLE!` and `#UNSUPPORTED!`.

Semantics are a documented subset, not full Calc compatibility. Reference: LibreOffice's [INDEX and MATCH](https://help.libreoffice.org/latest/en-US/text/scalc/01/04060109.html) and [relative/absolute references](https://help.libreoffice.org/latest/en-US/text/scalc/guide/relativ_absolut_ref.html). Tests use independent expected results; no native Calc comparison is run here.

## Checks

```sh
npm run test:engine
npm run bench:engine
npm run check
```

The benchmark verifies 1,000 lookups against a 30-entry dictionary before and after an edit, reporting load, first-read, cached-read and recalculation times. Tests also exercise a Node worker. Browser Web Worker integration is a later UI step; the module has no DOM, Electron, Node, filesystem or network imports.
