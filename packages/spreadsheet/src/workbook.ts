import {
  addressName,
  cellKey,
  parseAddress,
  rangeBounds,
  sheetKey,
  type Reference,
} from './address.js';
import {evaluate} from './evaluate.js';
import {changeSheetReferences} from './sheet-references.js';
import {
  formatExpression,
  parseFormula,
  shiftExpression,
  type Expression,
} from './formula.js';
import {
  cellError,
  FormulaFault,
  isCellError,
  limits,
  type CellInput,
  type FormulaLanguage,
  type Value,
} from './types.js';

interface Cell {
  input: CellInput;
  expression?: Expression;
  dependencies: Set<string>;
}

export interface CellChange {
  sheet: string;
  address: string;
  input: CellInput;
}

export class Workbook {
  private sheets = new Map<string, string>();
  private cells = new Map<string, Cell>();
  private dependents = new Map<string, Set<string>>();
  private cache = new Map<string, Value>();
  private dependencyCount = 0;
  private evaluations = 0;

  addSheet(name: string): void {
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 100 ||
      [...name].some(char => char.charCodeAt(0) < 32)
    )
      throw new TypeError('Invalid sheet name');
    if (this.sheets.has(sheetKey(name)))
      throw new Error('Sheet already exists');
    if (this.sheets.size >= limits.sheets)
      throw new RangeError('Sheet limit exceeded');
    this.sheets.set(sheetKey(name), name);
    this.cache.clear();
  }

  getSheetNames(): string[] {
    return [...this.sheets.values()];
  }

  getInputs(): CellChange[] {
    return [...this.cells].map(([key, cell]) => {
      const [sheet, row, column] = JSON.parse(key) as [string, number, number];
      return {
        sheet: this.sheets.get(sheet)!,
        address: addressName({
          row,
          column,
          rowAbsolute: false,
          columnAbsolute: false,
        }),
        input:
          typeof cell.input === 'object' && cell.input !== null
            ? {...cell.input}
            : cell.input,
      };
    });
  }

  renameSheet(name: string, newName: string): void {
    const validation = new Workbook();
    validation.addSheet(newName);
    if (
      sheetKey(name) !== sheetKey(newName) &&
      this.sheets.has(sheetKey(newName))
    )
      throw new Error('Sheet already exists');
    this.changeSheet(name, newName);
  }

  deleteSheet(name: string): void {
    if (this.sheets.size <= 1) throw new Error('Cannot delete the last sheet');
    this.changeSheet(name);
  }

  private changeSheet(name: string, newName?: string) {
    const key = sheetKey(name);
    if (!this.sheets.has(key)) throw new Error('Unknown sheet');
    const next = new Workbook();
    for (const [id, title] of this.sheets) {
      if (id !== key) next.addSheet(title);
      else if (newName !== undefined) next.addSheet(newName);
    }
    for (const [id, cell] of this.cells) {
      const [source, row, column] = JSON.parse(id) as [string, number, number];
      if (source === key && newName === undefined) continue;
      const target = source === key ? newName! : this.sheets.get(source)!;
      const expression = cell.expression
        ? changeSheetReferences(cell.expression, name, newName)
        : undefined;
      const input =
        expression &&
        JSON.stringify(expression) !== JSON.stringify(cell.expression)
          ? {formula: formatExpression(expression)}
          : cell.input;
      const dependencies = expression
        ? next.references(target, expression)
        : new Set<string>();
      const targetKey = JSON.stringify([sheetKey(target), row, column]);
      next.cells.set(targetKey, {input, expression, dependencies});
      next.dependencyCount += dependencies.size;
      for (const dependency of dependencies) {
        if (!next.dependents.has(dependency))
          next.dependents.set(dependency, new Set());
        next.dependents.get(dependency)!.add(targetKey);
      }
    }
    this.sheets = next.sheets;
    this.cells = next.cells;
    this.dependents = next.dependents;
    this.dependencyCount = next.dependencyCount;
    this.cache.clear();
  }

  setCell(sheet: string, address: string, input: CellInput): void {
    this.setCells([{sheet, address, input}]);
  }

  setFormula(sheet: string, address: string, formula: string): void {
    this.setCell(sheet, address, {formula});
  }

  setCells(changes: readonly CellChange[]): void {
    if (changes.length > limits.cells)
      throw new RangeError('Batch limit exceeded');
    const pending = new Map<string, {sheet: string; input: CellInput}>();
    for (const change of changes) {
      const key = this.key(change.sheet, change.address);
      const input = this.validateInput(change.input);
      pending.set(key, {sheet: change.sheet, input});
    }
    let size = this.cells.size;
    let edges = this.dependencyCount;
    for (const [key, {input}] of pending) {
      size += Number(input !== null) - Number(this.cells.has(key));
      edges -= this.cells.get(key)?.dependencies.size ?? 0;
    }
    if (size > limits.cells) throw new RangeError('Workbook capacity exceeded');
    const prepared = new Map<string, Cell>();
    for (const [key, {sheet, input}] of pending) {
      const expression =
        typeof input === 'object' && input !== null
          ? parseFormula(input.formula)
          : undefined;
      let dependencies = new Set<string>();
      let parsed = expression;
      if (expression) {
        try {
          dependencies = this.references(sheet, expression);
        } catch (error) {
          if (!(error instanceof FormulaFault)) throw error;
          parsed = {kind: 'error', error: cellError(error.code)};
        }
      }
      edges += dependencies.size;
      if (edges > limits.dependencies)
        throw new RangeError('Workbook capacity exceeded');
      prepared.set(key, {input, expression: parsed, dependencies});
    }
    for (const [key, cell] of prepared) {
      for (const dependency of this.cells.get(key)?.dependencies ?? []) {
        const consumers = this.dependents.get(dependency)!;
        consumers.delete(key);
        if (consumers.size === 0) this.dependents.delete(dependency);
      }
      if (cell.input === null) this.cells.delete(key);
      else this.cells.set(key, cell);
      for (const dependency of cell.dependencies) {
        if (!this.dependents.has(dependency))
          this.dependents.set(dependency, new Set());
        this.dependents.get(dependency)!.add(key);
      }
    }
    this.dependencyCount = edges;
    this.invalidate([...prepared.keys()]);
  }

  getCell(sheet: string, address: string): CellInput {
    const input = this.cells.get(this.key(sheet, address))?.input ?? null;
    return typeof input === 'object' && input !== null ? {...input} : input;
  }

  getFormula(
    sheet: string,
    address: string,
    language: FormulaLanguage = 'en',
  ): string | null {
    const cell = this.cells.get(this.key(sheet, address));
    return cell?.expression
      ? formatExpression(cell.expression, language)
      : null;
  }

  getValue(sheet: string, address: string): Value {
    this.key(sheet, address);
    let steps = 0;
    const stack = new Set<string>();
    const step = () => {
      if (++steps > limits.evaluationSteps) throw new FormulaFault('#LIMIT!');
    };
    const read = (currentSheet: string, ref: Reference): Value => {
      step();
      const targetSheet = ref.sheet ?? currentSheet;
      if (!this.sheets.has(sheetKey(targetSheet))) return cellError('#REF!');
      const key = cellKey(targetSheet, ref);
      if (stack.has(key)) return cellError('#CYCLE!');
      if (this.cache.has(key)) return this.cache.get(key)!;
      const cell = this.cells.get(key);
      if (!cell) return null;
      if (!cell.expression) return cell.input as Value;
      if (stack.size >= limits.cellDepth) return cellError('#LIMIT!');
      stack.add(key);
      this.evaluations++;
      const value = evaluate(cell.expression, {
        sheet: targetSheet,
        read: reference => read(targetSheet, reference),
        hasSheet: name => this.sheets.has(sheetKey(name)),
        step,
      });
      stack.delete(key);
      if (!isCellError(value) || value.code !== '#LIMIT!')
        this.cache.set(key, value);
      return value;
    };
    return read(sheet, parseAddress(address));
  }

  copyRange(
    sheet: string,
    range: string,
    targetSheet: string,
    target: string,
  ): void {
    const parts = range.split(':');
    if (parts.length > 2) throw new FormulaFault('#REF!');
    const start = parseAddress(parts[0]);
    const end = parseAddress(parts[1] ?? parts[0]);
    const bounds = rangeBounds(start, end);
    const destination = parseAddress(target);
    if (
      destination.row + bounds.rows - 1 > limits.rows ||
      destination.column + bounds.columns - 1 > limits.columns
    )
      throw new FormulaFault('#REF!');
    this.key(sheet, addressName(start));
    this.key(targetSheet, target);
    const changes: CellChange[] = [];
    for (let row = 0; row < bounds.rows; row++)
      for (let column = 0; column < bounds.columns; column++) {
        const ref = {
          ...start,
          row: bounds.top + row,
          column: bounds.left + column,
        };
        const cell = this.cells.get(cellKey(sheet, ref));
        const input = cell?.expression
          ? {
              formula: formatExpression(
                shiftExpression(
                  cell.expression,
                  destination.row - bounds.top,
                  destination.column - bounds.left,
                ),
              ),
            }
          : (cell?.input ?? null);
        changes.push({
          sheet: targetSheet,
          address: addressName({
            ...destination,
            row: destination.row + row,
            column: destination.column + column,
          }),
          input,
        });
      }
    this.setCells(changes);
  }

  getStats() {
    return {
      cells: this.cells.size,
      dependencies: this.dependencyCount,
      cached: this.cache.size,
      evaluations: this.evaluations,
    };
  }

  private key(sheet: string, address: string) {
    if (!this.sheets.has(sheetKey(sheet))) throw new Error('Unknown sheet');
    return cellKey(sheet, parseAddress(address));
  }

  private validateInput(input: CellInput): CellInput {
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'string' && input.length <= 32_767) return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (
      typeof input === 'object' &&
      input &&
      typeof input.formula === 'string' &&
      input.formula.length <= 32_767
    )
      return {formula: input.formula};
    throw new TypeError('Invalid cell input');
  }

  private references(sheet: string, expression: Expression): Set<string> {
    const result = new Set<string>();
    const visit = (e: Expression) => {
      if (e.kind === 'reference')
        result.add(cellKey(e.ref.sheet ?? sheet, e.ref));
      if (e.kind === 'range') {
        const source = e.start.sheet ?? sheet;
        if (sheetKey(source) !== sheetKey(e.end.sheet ?? source))
          throw new FormulaFault('#REF!');
        const bounds = rangeBounds(e.start, e.end);
        for (let row = 0; row < bounds.rows; row++)
          for (let column = 0; column < bounds.columns; column++) {
            result.add(
              cellKey(source, {
                ...e.start,
                row: bounds.top + row,
                column: bounds.left + column,
              }),
            );
            if (result.size > limits.rangeCells)
              throw new FormulaFault('#LIMIT!');
          }
      }
      if (e.kind === 'call') e.args.forEach(visit);
      if (e.kind === 'unary') visit(e.value);
      if (e.kind === 'binary') {
        visit(e.left);
        visit(e.right);
      }
    };
    visit(expression);
    return result;
  }

  private invalidate(keys: string[]) {
    const seen = new Set(keys);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      this.cache.delete(key);
      for (const dependent of this.dependents.get(key) ?? [])
        if (!seen.has(dependent)) {
          seen.add(dependent);
          keys.push(dependent);
        }
    }
  }
}
