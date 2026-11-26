import {rangeBounds, sheetKey, type Reference} from './address.js';
import type {Expression} from './formula.js';
import {cellError, FormulaFault, isCellError, type Value} from './types.js';

export interface EvaluationContext {
  sheet: string;
  read(ref: Reference): Value;
  hasSheet(name: string): boolean;
  step(): void;
}

export function evaluate(
  expression: Expression,
  context: EvaluationContext,
): Value {
  const range = (e: Expression) => {
    if (e.kind === 'error') throw new FormulaFault(e.error.code);
    if (e.kind !== 'range' && e.kind !== 'reference')
      throw new FormulaFault('#VALUE!');
    const start = e.kind === 'range' ? e.start : e.ref;
    const end = e.kind === 'range' ? e.end : e.ref;
    const sheet = start.sheet ?? context.sheet;
    if (
      !context.hasSheet(sheet) ||
      sheetKey(sheet) !== sheetKey(end.sheet ?? sheet)
    )
      throw new FormulaFault('#REF!');
    const bounds = rangeBounds(start, end);
    return {
      ...bounds,
      get(row: number, column: number) {
        context.step();
        return context.read({
          ...start,
          sheet,
          row: bounds.top + row,
          column: bounds.left + column,
        });
      },
    };
  };
  const checked = (value: Value): Exclude<Value, object> => {
    if (isCellError(value)) throw new FormulaFault(value.code);
    return value;
  };
  const number = (e: Expression): number => {
    const value = checked(visit(e));
    if (value === null) return 0;
    if (typeof value === 'boolean') return Number(value);
    if (typeof value !== 'number') throw new FormulaFault('#VALUE!');
    return value;
  };
  const finite = (value: number) => {
    if (!Number.isFinite(value)) throw new FormulaFault('#NUM!');
    return value;
  };
  const visit = (e: Expression): Value => {
    context.step();
    switch (e.kind) {
      case 'literal':
        return e.value;
      case 'error':
        return e.error;
      case 'reference':
        return context.read(e.ref);
      case 'range':
        throw new FormulaFault('#UNSUPPORTED!');
      case 'unary':
        return finite((e.operator === '-' ? -1 : 1) * number(e.value));
      case 'binary': {
        const left = number(e.left);
        const right = number(e.right);
        if (e.operator === '+') return finite(left + right);
        if (e.operator === '-') return finite(left - right);
        if (e.operator === '*') return finite(left * right);
        if (right === 0) throw new FormulaFault('#DIV/0!');
        return finite(left / right);
      }
      case 'call': {
        if (e.name === 'INDEX') {
          if (e.args.length < 2 || e.args.length > 3)
            throw new FormulaFault('#UNSUPPORTED!');
          const source = range(e.args[0]);
          const row = Math.trunc(number(e.args[1]));
          const column =
            e.args.length === 3 ? Math.trunc(number(e.args[2])) : 1;
          if (row === 0 || column === 0)
            throw new FormulaFault('#UNSUPPORTED!');
          if (
            row < 1 ||
            row > source.rows ||
            column < 1 ||
            column > source.columns
          )
            throw new FormulaFault('#REF!');
          return source.get(row - 1, column - 1);
        }
        if (e.name === 'MATCH') {
          if (e.args.length !== 3) throw new FormulaFault('#UNSUPPORTED!');
          if (number(e.args[2]) !== 0) throw new FormulaFault('#UNSUPPORTED!');
          const sought = checked(visit(e.args[0]));
          const source = range(e.args[1]);
          if (source.rows !== 1 && source.columns !== 1)
            throw new FormulaFault('#VALUE!');
          const normalize = (v: Value) =>
            typeof v === 'string' ? v.toLowerCase() : v;
          for (let i = 0; i < source.rows * source.columns; i++) {
            const candidate = checked(
              source.get(source.rows === 1 ? 0 : i, source.rows === 1 ? i : 0),
            );
            if (normalize(candidate) === normalize(sought)) return i + 1;
          }
          throw new FormulaFault('#N/A');
        }
        throw new FormulaFault('#NAME?');
      }
    }
  };
  try {
    return visit(expression);
  } catch (error) {
    if (!(error instanceof FormulaFault)) throw error;
    return cellError(error.code);
  }
}
