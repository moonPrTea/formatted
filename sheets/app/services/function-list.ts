import {enhanceControls} from '../../../packages/ui/services/controls.js';
import {query} from '../../../packages/ui/services/dom.js';
import {categories, findFunctions} from './function-catalog.js';
import {type FormulaLanguage} from '../../../packages/spreadsheet/src/index.js';

export function functionList(
  language: FormulaLanguage,
  select: (name: string) => void,
) {
  const search = query<HTMLInputElement>('#search');
  const category = query<HTMLSelectElement>('#category');
  const list = query('#functions');
  const option = (value: string, name: string) => new Option(name, value);
  category.replaceChildren(
    option('', language === 'ru' ? 'Все категории' : 'All categories'),
    ...Object.entries(categories).map(([id, names]) =>
      option(id, names[language === 'ru' ? 0 : 1]),
    ),
  );
  let selected = 'INDEX';
  const render = () => {
    const matches = findFunctions(search.value, category.value, language);
    const hasSelected = matches.some(item => item.en === selected);
    list.replaceChildren(
      ...matches.map((item, i) => {
        const button = document.createElement('button');
        button.textContent = item[language];
        button.setAttribute('aria-description', item.en);
        button.dataset.function = item.en;
        button.setAttribute('aria-pressed', String(item.en === selected));
        button.tabIndex =
          item.en === selected || (i === 0 && !hasSelected) ? 0 : -1;
        button.onclick = () => select(item.en);
        button.ondblclick = () =>
          document.querySelector<HTMLInputElement>('[data-argument]')?.focus();
        return button;
      }),
    );
    if (!matches.length)
      list.textContent =
        language === 'ru' ? 'Ничего не найдено' : 'No functions found';
    query('#function-count').textContent =
      language === 'ru'
        ? `Найдено: ${matches.length}`
        : `Found: ${matches.length}`;
    enhanceControls(list);
  };
  search.oninput = category.onchange = render;
  list.onkeydown = event => {
    const buttons = [...list.querySelectorAll('button')];
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const index = {
      ArrowDown: current + 1,
      ArrowUp: current - 1,
      Home: 0,
      End: buttons.length - 1,
    }[event.key];
    if (index === undefined || !buttons.length) return;
    event.preventDefault();
    const next = buttons[Math.max(0, Math.min(index, buttons.length - 1))];
    buttons.forEach(button => (button.tabIndex = button === next ? 0 : -1));
    next.focus({preventScroll: true});
    next.scrollIntoView({
      block: 'nearest',
      container: 'nearest',
    } as ScrollIntoViewOptions);
  };
  render();
  return (name: string) => {
    selected = name;
    const buttons = [...list.querySelectorAll('button')];
    const active =
      buttons.find(button => button.dataset.function === name) ?? buttons[0];
    buttons.forEach(button => {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.function === name),
      );
      button.tabIndex = button === active ? 0 : -1;
    });
    list.querySelector('[aria-pressed="true"]')?.scrollIntoView({
      block: 'nearest',
      container: 'nearest',
    } as ScrollIntoViewOptions);
  };
}
