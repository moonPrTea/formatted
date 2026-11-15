import {query} from '../dom.js';
import {Workbook, isCellError} from '../spreadsheet/index.js';
import {argumentPicker} from './argument-picker.js';
import {functionList} from './function-list.js';
import {catalog, categories} from './function-catalog.js';
import {
  buildFunction,
  functions,
  readFunction,
  type FunctionName,
  type WizardContext,
} from './wizard-model.js';

const text = {
  ru: [
    'Мастер функций',
    'Поиск функции',
    'Формула',
    'Отмена',
    'Вставить',
    'Результат',
    'Ничего не найдено',
    'Ссылки: A1 или Категории.$B$2:$B$4. Текст заключай в двойные кавычки. Аргументы разделяй точкой с запятой. Для точного ПОИСКПОЗ укажи 0',
    'Проверь аргументы, скобки и разделители ;',
    'Доступны только ИНДЕКС и ПОИСКПОЗ',
    'Значение не найдено в диапазоне, проверь текст и пробелы',
  ],
  en: [
    'Function wizard',
    'Find a function',
    'Formula',
    'Cancel',
    'Insert',
    'Result',
    'No functions found',
    'References: A1 or Категории.$B$2:$B$4. Enclose text in double quotes. Separate arguments with semicolons. Use 0 for an exact MATCH',
    'Check arguments, parentheses and semicolon separators',
    'Only INDEX and MATCH are supported',
    'Value not found in the range; check text and whitespace',
  ],
};
const book = new Workbook();
let context: WizardContext;
let current: FunctionName = 'INDEX';
let selected = 'INDEX';
let list: (name: string) => void = () => {};
let initialized = false;
const drafts = {INDEX: ['', '', ''], MATCH: ['', '', '0']};
const expression = query<HTMLTextAreaElement>('#expression');
const insert = query<HTMLButtonElement>('#insert');
const picker = argumentPicker((index, reference) => {
  drafts[current][index] = reference;
  expression.value = buildFunction(current, drafts[current], context.language);
  fields();
  preview();
});
function preview() {
  insert.disabled = true;
  const result = query('#result');
  const parsed = readFunction(expression.value, context.language);
  if (
    !expression.value.trim() ||
    (parsed && (!parsed.args[0]?.trim() || !parsed.args[1]?.trim()))
  ) {
    result.dataset.error = 'false';
    result.textContent = '';
    return;
  }
  try {
    if (!expression.value.startsWith('=')) throw new Error('=');
    book.setFormula(context.sheet, context.address, expression.value);
    const value = book.getValue(context.sheet, context.address);
    const error = isCellError(value);
    result.dataset.error = String(error);
    result.textContent = `${text[context.language][5]}: ${error ? value.code : String(value ?? '')}`;
    const hint = error ? ['#PARSE!', '#NAME?', '#N/A'].indexOf(value.code) : -1;
    if (hint >= 0)
      result.textContent += `: ${text[context.language][8 + hint]}`;
    insert.disabled = error;
  } catch (error) {
    result.dataset.error = 'true';
    result.textContent = String(error);
  }
}
function fields() {
  query('#function-name').textContent = functions[current][context.language][0];
  query('#support').textContent = '';
  const definition = functions[current];
  query('#description').textContent = definition[context.language][1];
  query('#arguments').replaceChildren(
    ...drafts[current].map((value, index) => {
      const label = document.createElement('label');
      label.textContent = definition[context.language][index + 2];
      const input = document.createElement('input');
      input.value = value;
      input.maxLength = 4096;
      input.spellcheck = false;
      input.placeholder = definition.examples[index];
      input.dataset.argument = String(index);
      input.oninput = () => {
        drafts[current][index] = input.value;
        expression.value = buildFunction(
          current,
          drafts[current],
          context.language,
        );
        preview();
      };
      const row = document.createElement('span');
      row.className = 'argument-field';
      row.append(input, picker.button(index, context.language));
      label.append(row);
      return label;
    }),
  );
}
function describe(name: string) {
  const item = catalog.find(entry => entry.en === name)!;
  selected = name;
  if (name === 'INDEX' || name === 'MATCH') {
    current = name;
    fields();
  } else {
    query('#function-name').textContent = item[context.language];
    query('#description').textContent =
      categories[item.category][context.language === 'ru' ? 0 : 1];
    query('#support').textContent =
      context.language === 'ru'
        ? 'Расчёт этой функции пока недоступен'
        : 'Calculation is not available for this function yet';
    query('#arguments').replaceChildren();
  }
  list(selected);
}
function choose(name: string) {
  describe(name);
  expression.value =
    name === 'INDEX' || name === 'MATCH'
      ? buildFunction(current, drafts[current], context.language)
      : '';
  preview();
}
function readSelection() {
  const parsed = readFunction(expression.value, context.language);
  if (parsed && parsed.args.length <= 3) {
    current = parsed.name;
    selected = current;
    drafts[current] = [0, 1, 2].map(index => parsed.args[index] ?? '');
    fields();
    list(selected);
  } else {
    const name = /^=\s*([\p{L}\p{N}_.]+)\s*\(/u
      .exec(expression.value)?.[1]
      .toUpperCase();
    const item = catalog.find(
      entry => entry.en === name || entry.ru.toUpperCase() === name,
    );
    if (item) describe(item.en);
  }
  preview();
}
expression.oninput = readSelection;
window.addEventListener('message', event => {
  if (
    initialized ||
    event.source !== window.opener ||
    event.origin !== location.origin ||
    event.data?.type !== 'init'
  )
    return;
  initialized = true;
  context = event.data.context as WizardContext;
  document.documentElement.lang = context.language;
  const labels = text[context.language];
  document.title = labels[0];
  ['heading', 'search-label', 'formula-label', 'cancel', 'insert'].forEach(
    (id, i) => (query('#' + id).textContent = labels[i]),
  );
  query('#target').textContent = `${context.sheet}, ${context.address}`;
  query('#help').textContent = labels[7];
  query('#help-label').textContent =
    context.language === 'ru' ? 'Как вводить аргументы' : 'Argument syntax';
  query('#category-label').textContent =
    context.language === 'ru' ? 'Категория' : 'Category';
  list = functionList(context.language, choose);
  for (const sheet of context.sheets) book.addSheet(sheet);
  book.setCells(context.cells);
  expression.value = context.formula.startsWith('=') ? context.formula : '';
  fields();
  selected = current;
  list(selected);
  readSelection();
  query('main').removeAttribute('inert');
  query('#search').focus();
});
query('#cancel').onclick = () => window.close();
insert.onclick = () => {
  if (!insert.disabled)
    window.opener?.postMessage(
      {type: 'apply', formula: expression.value},
      location.origin,
    );
};
document.addEventListener('keydown', event => {
  if (event.isComposing) return;
  if (event.key === 'Escape') {
    if (picker.active) picker.cancel();
    else window.close();
  }
  if (event.key === 'Enter' && event.target === query('#search')) {
    event.preventDefault();
    document.querySelector<HTMLButtonElement>('#functions button')?.click();
  } else if (
    event.key === 'Enter' &&
    event.target instanceof HTMLInputElement
  ) {
    event.preventDefault();
    insert.click();
  }
});
window.opener?.postMessage({type: 'ready'}, location.origin);
