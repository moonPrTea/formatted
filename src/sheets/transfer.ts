import {
  parseAddress,
  rangeBounds,
  addressName,
} from '../spreadsheet/address.js';
import {
  formatExpression,
  parseFormula,
  shiftExpression,
} from '../spreadsheet/formula.js';
import {isCellError, type CellInput} from '../spreadsheet/index.js';
import {limits} from '../spreadsheet/types.js';
import {SheetSession, parseInput} from './session.js';
import {readDelimited, writeDelimited} from './delimited.js';

export function rangeTransfer(session: SheetSession, columns = 702) {
  let copied: {
    token: string;
    cells: {address: string; input: CellInput; value: CellInput}[][];
  } | null = null;
  const matrix = (range: string) => {
    const [start, end = start] = range.split(':').map(parseAddress);
    const b = rangeBounds(start, end);
    return Array.from({length: b.rows}, (_, row) =>
      Array.from({length: b.columns}, (_, column) =>
        addressName({...start, row: b.top + row, column: b.left + column}),
      ),
    );
  };
  const value = (sheet: string, address: string) => {
    const result = session.book.getValue(sheet, address);
    return isCellError(result) ? result.code : result;
  };
  const shifted = (input: CellInput, from: string, to: string) => {
    if (!input || typeof input !== 'object') return input;
    const a = parseAddress(from),
      b = parseAddress(to);
    return {
      formula: formatExpression(
        shiftExpression(
          parseFormula(input.formula),
          b.row - a.row,
          b.column - a.column,
        ),
      ),
    };
  };
  return {
    copy(sheet: string, range: string, clipboard: DataTransfer) {
      const cells = matrix(range);
      copied = {
        token: crypto.randomUUID(),
        cells: cells.map(row =>
          row.map(address => ({
            address,
            input: session.book.getCell(sheet, address),
            value: value(sheet, address),
          })),
        ),
      };
      clipboard.setData(
        'text/plain',
        writeDelimited(
          cells.map(row => row.map(address => value(sheet, address))),
          '\t',
        ),
      );
      clipboard.setData('application/x-formatted-range', copied.token);
    },
    paste(
      sheet: string,
      target: string,
      clipboard: DataTransfer,
      valuesOnly: boolean,
    ) {
      const rows = readDelimited(clipboard.getData('text/plain'), '\t');
      const start = parseAddress(target);
      if (
        start.row + rows.length - 1 > limits.rows ||
        start.column + rows[0].length - 1 > columns
      )
        throw new Error(
          'Вставка выходит за границы сетки / Paste exceeds grid bounds',
        );
      const own =
        copied?.token === clipboard.getData('application/x-formatted-range');
      session.writeBatch(
        rows.flatMap((row, r) =>
          row.map((text, c) => {
            const address = addressName({
              ...start,
              row: start.row + r,
              column: start.column + c,
            });
            const original = own ? copied?.cells[r]?.[c] : null;
            return {
              sheet,
              address,
              input: original
                ? valuesOnly
                  ? original.value
                  : shifted(original.input, original.address, address)
                : valuesOnly && /^[=']/.test(text)
                  ? text
                  : parseInput(text),
            };
          }),
        ),
      );
    },
    clear(sheet: string, range: string) {
      session.writeBatch(
        matrix(range)
          .flat()
          .map(address => ({sheet, address, input: null})),
      );
    },
    values(sheet: string, range: string) {
      session.writeBatch(
        matrix(range)
          .flat()
          .map(address => ({sheet, address, input: value(sheet, address)})),
      );
    },
    fill(sheet: string, range: string) {
      const rows = matrix(range);
      const first = rows[0].map(address =>
        session.book.getCell(sheet, address),
      );
      session.writeBatch(
        rows.slice(1).flatMap(row =>
          row.map((address, c) => ({
            sheet,
            address,
            input: shifted(first[c], rows[0][c], address),
          })),
        ),
      );
    },
  };
}
