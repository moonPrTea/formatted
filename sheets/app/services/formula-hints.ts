import {functions, type FunctionName} from './wizard-model.js';
import {type FormulaLanguage} from '../../../packages/spreadsheet/src/index.js';

const names = Object.keys(functions) as FunctionName[];
const identify = (text: string) =>
  names.find(name =>
    [name, functions[name].ru[0]].includes(text.toUpperCase()),
  );

export function formulaHint(
  text: string,
  caret: number,
  language: FormulaLanguage,
) {
  if (!text.startsWith('=')) return null;
  const prefix = text.slice(0, caret);
  const stack: {name: FunctionName | undefined; argument: number}[] = [];
  let quote = '';
  for (let i = 1; i < prefix.length; i++) {
    const char = prefix[i];
    if (quote) {
      if (char === quote) {
        if (prefix[i + 1] === quote) i++;
        else quote = '';
      }
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(')
      stack.push({
        name: identify(
          /[\p{L}_]+\s*$/u.exec(prefix.slice(0, i))?.[0].trim() ?? '',
        ),
        argument: 0,
      });
    else if (char === ')') stack.pop();
    else if (char === ';' && stack.length) stack[stack.length - 1].argument++;
  }
  if (quote) return null;
  const token = /(?:^=|[+\-*/(;]\s*)([\p{L}_]+)$/u.exec(prefix)?.[1];
  const choices = token
    ? names.filter(name =>
        [name, functions[name].ru[0]].some(alias =>
          alias.startsWith(token.toUpperCase()),
        ),
      )
    : [];
  const active = [...stack].reverse().find(entry => entry.name);
  const name = choices[0] ?? active?.name;
  if (!name) return null;
  const [label, description, ...args] = functions[name][language];
  return {
    label,
    description,
    args,
    argument: choices.length ? -1 : active!.argument,
    completion: choices.length
      ? {
          start: caret - token!.length,
          end: caret + (text[caret] === '(' ? 1 : 0),
          text: label + '(',
        }
      : null,
  };
}
