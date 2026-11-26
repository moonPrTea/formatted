import {columnName, parseAddress, sheetKey, type Reference} from './address.js';
import {
  cellError,
  FormulaFault,
  limits,
  type CellError,
  type FormulaLanguage,
  type Scalar,
} from './types.js';

export type Expression =
  | {kind: 'literal'; value: Scalar}
  | {kind: 'error'; error: CellError}
  | {kind: 'reference'; ref: Reference}
  | {kind: 'range'; start: Reference; end: Reference}
  | {kind: 'unary'; operator: string; value: Expression}
  | {kind: 'binary'; operator: string; left: Expression; right: Expression}
  | {kind: 'call'; name: string; args: Expression[]};

interface Token {
  kind: 'name' | 'string' | 'sheet' | 'number' | 'symbol' | 'error';
  text: string;
}

function tokenize(source: string): Token[] {
  if (source.length > limits.formulaLength) throw new FormulaFault('#LIMIT!');
  if (!source.startsWith('=')) throw new FormulaFault('#PARSE!');
  const tokens: Token[] = [];
  for (let i = 1; i < source.length;) {
    if (/\s/u.test(source[i])) {
      i++;
      continue;
    }
    if (tokens.length >= limits.tokens) throw new FormulaFault('#LIMIT!');
    const char = source[i];
    if (char === '"' || char === "'") {
      let text = '';
      let closed = false;
      for (i++; i < source.length; i++) {
        if (source[i] === char) {
          if (source[i + 1] === char) i++;
          else {
            i++;
            closed = true;
            break;
          }
        }
        text += source[i];
      }
      if (!closed) throw new FormulaFault('#PARSE!');
      tokens.push({kind: char === '"' ? 'string' : 'sheet', text});
      continue;
    }
    const rest = source.slice(i);
    const error =
      /^#(?:REF!|VALUE!|NAME\?|N\/A|DIV\/0!|NUM!|CYCLE!|LIMIT!|PARSE!|UNSUPPORTED!)/.exec(
        rest,
      );
    const number = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[Ee][+-]?\d+)?/.exec(rest);
    const name = /^\$?[\p{L}_][\p{L}\p{N}_$]*/u.exec(rest);
    const match = error ?? number ?? name;
    if (match) {
      tokens.push({
        kind: error ? 'error' : number ? 'number' : 'name',
        text: match[0],
      });
      i += match[0].length;
    } else if ('()+-*/;:.$'.includes(char)) {
      tokens.push({kind: 'symbol', text: char});
      i++;
    } else throw new FormulaFault('#PARSE!');
  }
  return tokens;
}

class Parser {
  private index = 0;
  private depth = 0;

  constructor(private tokens: Token[]) {}

  parse(): Expression {
    const expression = this.expression();
    if (this.index !== this.tokens.length) throw new FormulaFault('#PARSE!');
    return expression;
  }

  private peek(text: string) {
    return (
      this.tokens[this.index]?.kind === 'symbol' &&
      this.tokens[this.index]?.text === text
    );
  }

  private take(): Token {
    const token = this.tokens[this.index++];
    if (!token) throw new FormulaFault('#PARSE!');
    return token;
  }

  private expect(text: string) {
    if (!this.peek(text)) throw new FormulaFault('#PARSE!');
    this.index++;
  }

  private expression(minimum = 0): Expression {
    if (++this.depth > limits.nesting) throw new FormulaFault('#LIMIT!');
    let left = this.primary();
    const precedence: Record<string, number> = {'+': 1, '-': 1, '*': 2, '/': 2};
    while (true) {
      const operator = this.tokens[this.index]?.text;
      const priority =
        this.tokens[this.index]?.kind === 'symbol'
          ? (precedence[operator] ?? 0)
          : 0;
      if (priority <= minimum) break;
      this.index++;
      left = {kind: 'binary', operator, left, right: this.expression(priority)};
    }
    this.depth--;
    return left;
  }

  private reference(token: Token): Reference {
    if (token.kind === 'symbol' && token.text === '$') {
      const sheet = this.take();
      if (sheet.kind !== 'sheet') throw new FormulaFault('#PARSE!');
      this.expect('.');
      return {
        ...this.address(),
        sheet: sheet.text,
        sheetAbsolute: true,
      };
    }
    if (token.kind !== 'name' && token.kind !== 'sheet')
      throw new FormulaFault('#PARSE!');
    if (this.peek('.')) {
      this.index++;
      const sheetAbsolute = token.kind === 'name' && token.text.startsWith('$');
      return {
        ...this.address(),
        sheet: sheetAbsolute ? token.text.slice(1) : token.text,
        sheetAbsolute,
      };
    }
    if (token.kind !== 'name') throw new FormulaFault('#PARSE!');
    return parseAddress(token.text);
  }

  private address(): Reference {
    const token = this.take();
    if (token.kind !== 'name') throw new FormulaFault('#PARSE!');
    return parseAddress(token.text);
  }

  private primary(): Expression {
    const token = this.take();
    if (token.kind === 'symbol' && token.text === '(') {
      const result = this.expression();
      this.expect(')');
      return result;
    }
    if (token.kind === 'symbol' && ['+', '-'].includes(token.text))
      return {kind: 'unary', operator: token.text, value: this.expression(3)};
    if (token.kind === 'number') {
      const value = Number(token.text);
      if (!Number.isFinite(value)) throw new FormulaFault('#NUM!');
      return {kind: 'literal', value};
    }
    if (token.kind === 'string') return {kind: 'literal', value: token.text};
    if (token.kind === 'error')
      return {kind: 'error', error: cellError(token.text as CellError['code'])};
    if (token.kind === 'name' && this.peek('(')) {
      this.index++;
      const args: Expression[] = [];
      if (!this.peek(')')) {
        args.push(this.expression());
        while (this.peek(';')) {
          this.index++;
          args.push(this.expression());
        }
      }
      this.expect(')');
      const name = token.text.toUpperCase();
      return {
        kind: 'call',
        name:
          name === 'ИНДЕКС' ? 'INDEX' : name === 'ПОИСКПОЗ' ? 'MATCH' : name,
        args,
      };
    }
    if (token.kind === 'name' && !this.peek('.')) {
      const name = token.text.toUpperCase();
      if (['TRUE', 'FALSE', 'ИСТИНА', 'ЛОЖЬ'].includes(name))
        return {kind: 'literal', value: name === 'TRUE' || name === 'ИСТИНА'};
      if (!/^\$?[A-Z]{1,3}\$?\d+$/i.test(name))
        throw new FormulaFault('#NAME?');
    }
    const start = this.reference(token);
    if (!this.peek(':')) return {kind: 'reference', ref: start};
    this.index++;
    const end = this.reference(this.take());
    if (
      end.sheet !== undefined &&
      sheetKey(end.sheet) !== sheetKey(start.sheet ?? '')
    )
      throw new FormulaFault('#REF!');
    end.sheet ??= start.sheet;
    return {kind: 'range', start, end};
  }
}

export function parseFormula(source: string): Expression {
  try {
    return new Parser(tokenize(source)).parse();
  } catch (error) {
    if (!(error instanceof FormulaFault)) throw error;
    return {kind: 'error', error: cellError(error.code)};
  }
}

function referenceText(ref: Reference): string {
  const sheet =
    ref.sheet === undefined
      ? ''
      : `${ref.sheetAbsolute ? '$' : ''}'${ref.sheet.replaceAll("'", "''")}'.`;
  return `${sheet}${ref.columnAbsolute ? '$' : ''}${columnName(ref.column)}${ref.rowAbsolute ? '$' : ''}${ref.row}`;
}

export function formatExpression(
  expression: Expression,
  language: FormulaLanguage = 'en',
): string {
  const format = (e: Expression): string => {
    switch (e.kind) {
      case 'literal':
        if (typeof e.value === 'string')
          return `"${e.value.replaceAll('"', '""')}"`;
        if (typeof e.value === 'boolean') return e.value ? 'TRUE' : 'FALSE';
        return String(e.value ?? 0);
      case 'error':
        return e.error.code;
      case 'reference':
        return referenceText(e.ref);
      case 'range':
        return (
          referenceText(e.start) +
          ':' +
          referenceText({...e.end, sheet: undefined})
        );
      case 'unary':
        return `${e.operator}(${format(e.value)})`;
      case 'binary':
        return `(${format(e.left)}${e.operator}${format(e.right)})`;
      case 'call': {
        const name =
          language === 'ru'
            ? (({INDEX: 'ИНДЕКС', MATCH: 'ПОИСКПОЗ'} as Record<string, string>)[
                e.name
              ] ?? e.name)
            : e.name;
        return `${name}(${e.args.map(format).join(';')})`;
      }
    }
  };
  return '=' + format(expression);
}

export function shiftExpression(
  expression: Expression,
  rows: number,
  columns: number,
): Expression {
  const shift = (ref: Reference): Reference => {
    const row = ref.row + (ref.rowAbsolute ? 0 : rows);
    const column = ref.column + (ref.columnAbsolute ? 0 : columns);
    if (row < 1 || row > limits.rows || column < 1 || column > limits.columns)
      throw new FormulaFault('#REF!');
    return {...ref, row, column};
  };
  const visit = (e: Expression): Expression => {
    try {
      switch (e.kind) {
        case 'reference':
          return {...e, ref: shift(e.ref)};
        case 'range':
          return {...e, start: shift(e.start), end: shift(e.end)};
        case 'unary':
          return {...e, value: visit(e.value)};
        case 'binary':
          return {...e, left: visit(e.left), right: visit(e.right)};
        case 'call':
          return {...e, args: e.args.map(visit)};
        default:
          return e;
      }
    } catch (error) {
      if (!(error instanceof FormulaFault)) throw error;
      return {kind: 'error', error: cellError(error.code)};
    }
  };
  return visit(expression);
}
