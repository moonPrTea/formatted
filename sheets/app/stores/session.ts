import {calcLesson} from '../../../packages/practice/src/calc-lesson.js';
import {changeSheetInput} from '../../../packages/spreadsheet/src/sheet-references.js';
import {
  Workbook,
  type CellChange,
  type CellInput,
  type FormulaLanguage,
} from '../../../packages/spreadsheet/src/index.js';

export const sheetNames = ['Исходник', 'Практика', 'Категории'];
const numeric = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function parseInput(text: string): CellInput {
  if (text.startsWith('=')) return {formula: text};
  if (text.startsWith("'")) return text.slice(1);
  if (text === '') return null;
  if (!numeric.test(text)) return text;
  const number = Number(text);
  if (
    !Number.isFinite(number) ||
    (Number.isInteger(number) && !Number.isSafeInteger(number))
  )
    throw new RangeError(
      'Число вне точного диапазона / Number outside exact range',
    );
  return number;
}

export class SheetSession {
  readonly book: Workbook;
  private history: CellChange[][] = [];
  dirty = false;
  revision = 0;

  constructor(blankSheet?: string, restored?: Workbook) {
    this.book = restored ?? new Workbook();
    if (restored) return;
    if (blankSheet) {
      this.book.addSheet(blankSheet);
      return;
    }
    const fill = (sheet: string, rows: (string | number)[][]) =>
      rows.forEach((row, r) =>
        row.forEach((value, c) =>
          this.book.setCell(
            sheet,
            `${String.fromCharCode(65 + c)}${r + 1}`,
            value,
          ),
        ),
      );
    for (const name of sheetNames) this.book.addSheet(name);
    fill('Исходник', [calcLesson.headers, ...calcLesson.rows]);
    fill('Практика', [
      calcLesson.headers,
      ...calcLesson.rows.map(row => row.map(value => value.trim())),
    ]);
    fill('Категории', [['category_id', 'category'], ...calcLesson.categories]);
    this.book.setCell('Практика', 'G1', 'position');
    this.book.setCell('Практика', 'H1', 'category_id');
    for (let row = 2; row <= 5; row++) {
      this.book.setFormula(
        'Практика',
        `G${row}`,
        `=ПОИСКПОЗ(C${row};Категории.$B$2:$B$4;0)`,
      );
      this.book.setFormula(
        'Практика',
        `H${row}`,
        `=ИНДЕКС(Категории.$A$2:$A$4;G${row})`,
      );
    }
  }

  get canUndo() {
    return this.history.length > 0;
  }

  addSheet(language: FormulaLanguage): string {
    const names = new Set(
      this.book.getSheetNames().map(name => name.toLowerCase()),
    );
    const prefix = language === 'ru' ? 'Лист' : 'Sheet';
    let number = 1;
    while (names.has((prefix + number).toLowerCase())) number++;
    const name = prefix + number;
    this.book.addSheet(name);
    this.revision++;
    this.dirty = true;
    return name;
  }

  source(sheet: string, address: string, language: FormulaLanguage): string {
    const input = this.book.getCell(sheet, address);
    if (input !== null && typeof input === 'object') {
      const localized = this.book.getFormula(sheet, address, language)!;
      return localized.startsWith('=#') ? input.formula : localized;
    }
    if (
      typeof input === 'string' &&
      (input === '' || /^[=']/.test(input) || numeric.test(input))
    )
      return "'" + input;
    return String(input ?? '');
  }

  renameSheet(name: string, newName: string) {
    this.book.renameSheet(name, newName);
    this.revision++;
    this.history = this.history.map(batch =>
      batch.map(change => ({
        ...change,
        sheet:
          change.sheet.toLowerCase() === name.toLowerCase()
            ? newName
            : change.sheet,
        input: changeSheetInput(change.input, name, newName),
      })),
    );
    this.dirty = true;
  }

  deleteSheet(name: string) {
    this.book.deleteSheet(name);
    this.revision++;
    this.history = this.history
      .map(batch =>
        batch
          .filter(change => change.sheet.toLowerCase() !== name.toLowerCase())
          .map(change => ({
            ...change,
            input: changeSheetInput(change.input, name),
          })),
      )
      .filter(batch => batch.length);
    this.dirty = true;
  }

  write(sheet: string, address: string, text: string) {
    this.writeBatch([{sheet, address, input: parseInput(text)}]);
  }

  writeBatch(changes: CellChange[]) {
    const previous = changes.map(change => ({
      ...change,
      input: this.book.getCell(change.sheet, change.address),
    }));
    if (JSON.stringify(previous) === JSON.stringify(changes)) return;
    this.book.setCells(changes);
    this.revision++;
    this.history.push(previous);
    if (this.history.length > 100) this.history.shift();
    this.dirty = true;
  }

  undo(): CellChange | undefined {
    const batch = this.history.pop();
    if (batch) {
      this.book.setCells(batch);
      this.revision++;
      this.dirty = true;
    }
    return batch?.[0];
  }
}
