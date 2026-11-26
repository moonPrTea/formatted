import {
  generateDataset,
  normalizeConfig,
  sourceFiles,
} from '../../../packages/practice/src/generator.js';
import {Workbook} from '../../../packages/spreadsheet/src/index.js';
import {
  columnName,
  parseAddress,
} from '../../../packages/spreadsheet/src/address.js';
import {documentOf, type SheetSnapshot} from './document.js';
import {SheetSession} from '../stores/session.js';

export type SheetLaunch =
  {kind: 'blank' | 'lesson'} | {kind: 'variant'; config: unknown};
export function launchSnapshot(request: unknown): SheetSnapshot {
  if (!request || typeof request !== 'object')
    throw new Error('Invalid launch request');
  const value = request as {kind?: unknown; config?: unknown};
  let book = new Workbook();
  if (value.kind === 'lesson') book = new SheetSession().book;
  else if (value.kind === 'blank') book.addSheet('Лист1');
  else if (value.kind === 'variant') {
    if (
      !value.config ||
      typeof value.config !== 'object' ||
      Array.isArray(value.config)
    )
      throw new Error('Invalid variant');
    const dataset = generateDataset(normalizeConfig(value.config));
    for (const source of sourceFiles(dataset)) {
      const sheet = source.name.replace(/\.csv$/i, '');
      book.addSheet(sheet);
      book.setCells(
        [
          source.headers,
          ...source.rows.map(row => source.headers.map(header => row[header])),
        ].flatMap((row, r) =>
          row.map((input, c) => ({
            sheet,
            address: `${columnName(c + 1)}${r + 1}`,
            input,
          })),
        ),
      );
    }
  } else throw new Error('Invalid launch kind');
  return {
    document: documentOf(book),
    language: 'ru',
    sheet: value.kind === 'lesson' ? 'Практика' : book.getSheetNames()[0],
    address: value.kind === 'lesson' ? 'H2' : 'A1',
    dirty: value.kind === 'variant',
  };
}

export function gridSize(book: Workbook, extra: string[] = []) {
  let rows = 100,
    columns = 12;
  for (const value of [
    ...book.getInputs().map(cell => cell.address),
    ...extra,
  ]) {
    const address = parseAddress(value);
    rows = Math.max(rows, address.row);
    columns = Math.max(columns, address.column);
  }
  return {rows, columns};
}
