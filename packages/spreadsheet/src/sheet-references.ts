import {sheetKey} from './address.js';
import {formatExpression, parseFormula, type Expression} from './formula.js';
import {cellError, type CellInput} from './types.js';

export function changeSheetReferences(
  expression: Expression,
  oldName: string,
  newName?: string,
): Expression {
  const matches = (name?: string) =>
    name !== undefined && sheetKey(name) === sheetKey(oldName);
  const visit = (e: Expression): Expression => {
    switch (e.kind) {
      case 'reference':
        return !matches(e.ref.sheet)
          ? e
          : newName === undefined
            ? {kind: 'error', error: cellError('#REF!')}
            : {...e, ref: {...e.ref, sheet: newName}};
      case 'range':
        return !matches(e.start.sheet)
          ? e
          : newName === undefined
            ? {kind: 'error', error: cellError('#REF!')}
            : {
                ...e,
                start: {...e.start, sheet: newName},
                end: {...e.end, sheet: newName},
              };
      case 'unary':
        return {...e, value: visit(e.value)};
      case 'binary':
        return {...e, left: visit(e.left), right: visit(e.right)};
      case 'call':
        return {...e, args: e.args.map(visit)};
      default:
        return e;
    }
  };
  return visit(expression);
}

export function changeSheetInput(
  input: CellInput,
  oldName: string,
  newName?: string,
): CellInput {
  if (!input || typeof input !== 'object') return input;
  const expression = parseFormula(input.formula);
  const changed = changeSheetReferences(expression, oldName, newName);
  return JSON.stringify(expression) === JSON.stringify(changed)
    ? input
    : {formula: formatExpression(changed)};
}
