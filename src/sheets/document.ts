import {Workbook, type CellChange} from '../spreadsheet/workbook.js';
import {limits} from '../spreadsheet/types.js';
import {parseAddress} from '../spreadsheet/address.js';

export const documentLimit = 8 * 1024 * 1024;
export interface SheetDocument {
  format: 'formatted';
  version: 1;
  sheets: string[];
  cells: CellChange[];
}
export interface SheetSnapshot {
  document: SheetDocument;
  language: 'ru' | 'en';
  sheet: string;
  address: string;
  dirty: boolean;
  draft?: {sheet: string; address: string; text: string};
}
export interface DocumentBoot {
  snapshot?: SheetSnapshot;
  name?: string;
}
export const gridAddress = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^[A-Z]{1,2}[1-9]\d*$/.test(value))
    return false;
  try {
    return parseAddress(value).column <= 702;
  } catch {
    return false;
  }
};
export const documentOf = (book: Workbook): SheetDocument => ({
  format: 'formatted',
  version: 1,
  sheets: book.getSheetNames(),
  cells: book.getInputs(),
});
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function readDocument(value: unknown): Workbook {
  if (
    !record(value) ||
    value.format !== 'formatted' ||
    value.version !== 1 ||
    !Array.isArray(value.sheets) ||
    !value.sheets.length ||
    value.sheets.length > limits.sheets ||
    !Array.isArray(value.cells) ||
    value.cells.length > limits.cells
  )
    throw new Error('Invalid workbook format');
  const book = new Workbook();
  for (const name of value.sheets) book.addSheet(name);
  const seen = new Set<string>();
  const changes: CellChange[] = [];
  for (const cell of value.cells) {
    if (
      !record(cell) ||
      typeof cell.sheet !== 'string' ||
      !book.getSheetNames().includes(cell.sheet) ||
      !gridAddress(cell.address) ||
      !Object.hasOwn(cell, 'input')
    )
      throw new Error('Invalid cell');
    const key = JSON.stringify([cell.sheet, cell.address]);
    if (seen.has(key)) throw new Error('Duplicate cell');
    seen.add(key);
    changes.push(cell as unknown as CellChange);
  }
  book.setCells(changes);
  return book;
}

export function readSnapshot(value: unknown): SheetSnapshot {
  if (!record(value)) throw new Error('Invalid snapshot');
  const book = readDocument(value.document);
  if (
    (value.language !== 'ru' && value.language !== 'en') ||
    typeof value.sheet !== 'string' ||
    !book.getSheetNames().includes(value.sheet) ||
    !gridAddress(value.address) ||
    typeof value.dirty !== 'boolean'
  )
    throw new Error('Invalid selection');
  if (value.draft !== undefined) {
    const draft = value.draft;
    if (
      !record(draft) ||
      typeof draft.sheet !== 'string' ||
      !book.getSheetNames().includes(draft.sheet) ||
      !gridAddress(draft.address) ||
      typeof draft.text !== 'string' ||
      draft.text.length > 32767
    )
      throw new Error('Invalid draft');
  }
  return {...value, document: documentOf(book)} as unknown as SheetSnapshot;
}
