import {FormulaFault, limits} from './types.js';

export interface Reference {
  sheet?: string;
  sheetAbsolute?: boolean;
  row: number;
  column: number;
  rowAbsolute: boolean;
  columnAbsolute: boolean;
}

export function columnName(column: number): string {
  if (!Number.isInteger(column) || column < 1 || column > limits.columns)
    throw new FormulaFault('#REF!');
  let result = '';
  for (; column > 0; column = Math.floor((column - 1) / 26))
    result = String.fromCharCode(65 + ((column - 1) % 26)) + result;
  return result;
}

export function parseAddress(address: string): Reference {
  const parts = /^(\$?)([A-Z]{1,3})(\$?)([1-9]\d*)$/i.exec(address);
  if (!parts) throw new FormulaFault('#REF!');
  const column = [...parts[2].toUpperCase()].reduce(
    (n, c) => n * 26 + c.charCodeAt(0) - 64,
    0,
  );
  const row = Number(parts[4]);
  if (row > limits.rows || column > limits.columns)
    throw new FormulaFault('#REF!');
  return {row, column, rowAbsolute: !!parts[3], columnAbsolute: !!parts[1]};
}

export const addressName = (ref: Reference) => columnName(ref.column) + ref.row;
export const sheetKey = (name: string) => name.toLowerCase();
export const cellKey = (sheet: string, ref: Reference) =>
  JSON.stringify([sheetKey(sheet), ref.row, ref.column]);

export function rangeBounds(start: Reference, end: Reference) {
  const top = Math.min(start.row, end.row);
  const left = Math.min(start.column, end.column);
  const rows = Math.abs(start.row - end.row) + 1;
  const columns = Math.abs(start.column - end.column) + 1;
  if (rows * columns > limits.rangeCells) throw new FormulaFault('#LIMIT!');
  return {top, left, rows, columns};
}
