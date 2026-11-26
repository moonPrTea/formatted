export type Scalar = string | number | boolean | null;
export type ErrorCode =
  | '#REF!'
  | '#VALUE!'
  | '#NAME?'
  | '#N/A'
  | '#DIV/0!'
  | '#NUM!'
  | '#CYCLE!'
  | '#LIMIT!'
  | '#PARSE!'
  | '#UNSUPPORTED!';

export interface CellError {
  readonly kind: 'error';
  readonly code: ErrorCode;
}

export type Value = Scalar | CellError;
export type CellInput = Scalar | {formula: string};
export type FormulaLanguage = 'en' | 'ru';

export const limits = Object.freeze({
  rows: 1_048_576,
  columns: 16_384,
  sheets: 128,
  cells: 20_000,
  rangeCells: 10_000,
  dependencies: 200_000,
  formulaLength: 4096,
  tokens: 512,
  nesting: 64,
  cellDepth: 128,
  evaluationSteps: 100_000,
});

export const cellError = (code: ErrorCode): CellError =>
  Object.freeze({kind: 'error', code});

export function isCellError(value: unknown): value is CellError {
  return (
    !!value &&
    typeof value === 'object' &&
    'kind' in value &&
    value.kind === 'error'
  );
}

export class FormulaFault extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}
