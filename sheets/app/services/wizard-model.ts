import {
  formatExpression,
  parseFormula,
} from '../../../packages/spreadsheet/src/formula.js';
import {
  type CellChange,
  type FormulaLanguage,
} from '../../../packages/spreadsheet/src/index.js';

export const functions = {
  INDEX: {
    ru: [
      'ИНДЕКС',
      'Возвращает значение по позиции в диапазоне',
      'Диапазон',
      'Номер строки',
      'Номер столбца (необязательно)',
    ],
    en: [
      'INDEX',
      'Returns a value at a position in a range',
      'Range',
      'Row number',
      'Column number (optional)',
    ],
    examples: ['Категории.$A$2:$A$4', 'G2', '1'],
  },
  MATCH: {
    ru: [
      'ПОИСКПОЗ',
      'Находит позицию значения, а не его ID',
      'Искомое значение',
      'Диапазон поиска',
      'Тип сопоставления',
    ],
    en: [
      'MATCH',
      'Finds the position of a value, not its ID',
      'Search value',
      'Search range',
      'Match type',
    ],
    examples: ['C2', 'Категории.$B$2:$B$4', '0'],
  },
};
export type FunctionName = keyof typeof functions;
export interface WizardContext {
  language: FormulaLanguage;
  sheet: string;
  address: string;
  formula: string;
  sheets: string[];
  cells: CellChange[];
}
export function readFunction(source: string, language: FormulaLanguage) {
  const expression = parseFormula(source);
  if (expression.kind === 'call' && Object.hasOwn(functions, expression.name))
    return {
      name: expression.name as FunctionName,
      args: expression.args.map(arg =>
        formatExpression(arg, language).slice(1),
      ),
    };
  // Keep unfinished arguments editable; opening the wizard must not erase a draft.
  const head = /^=\s*(INDEX|MATCH|ИНДЕКС|ПОИСКПОЗ)\s*(\(|$)/iu.exec(source);
  if (!head || source.length > 4096) return null;
  const alias = head[1].toUpperCase();
  const name: FunctionName =
    alias === 'INDEX' || alias === 'ИНДЕКС' ? 'INDEX' : 'MATCH';
  const args: string[] = [];
  let start = head[0].length;
  let depth = 0;
  let quote = '';
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === quote) {
        if (source[i + 1] === quote) i++;
        else quote = '';
      }
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth++;
    else if (char === ')') {
      if (depth) depth--;
      else {
        if (source.slice(i + 1).trim()) return null;
        args.push(source.slice(start, i).trim());
        return {name, args};
      }
    } else if (char === ';' && depth === 0) {
      args.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (start < source.length || args.length)
    args.push(source.slice(start).trim());
  return {name, args};
}
export function buildFunction(
  name: FunctionName,
  args: string[],
  language: FormulaLanguage,
) {
  const parts = args.map(value => value.trim());
  if (name === 'INDEX' && !parts[2]) parts.pop();
  return `=${functions[name][language][0]}(${parts.join(';')})`;
}
