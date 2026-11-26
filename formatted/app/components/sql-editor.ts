import {sqlTokens} from '../services/sql-highlight.js';

export function mountSqlEditor(input: HTMLTextAreaElement) {
  const surface = input.closest('.sql-code')!;
  const paint = surface.querySelector<HTMLElement>('.sql-highlight')!;
  const numbers = surface.querySelector<HTMLElement>('.sql-line-numbers')!;
  const scroll = () => {
    paint.scrollTop = input.scrollTop;
    paint.scrollLeft = input.scrollLeft;
    numbers.scrollTop = input.scrollTop;
  };
  const render = () => {
    const fragment = document.createDocumentFragment();
    for (const token of sqlTokens(input.value)) {
      const span = document.createElement('span');
      span.className = `sql-${token.kind}`;
      span.textContent = token.text;
      fragment.append(span);
    }
    fragment.append(document.createTextNode('\n'));
    paint.replaceChildren(fragment);
    numbers.textContent =
      Array.from({length: input.value.split('\n').length}, (_, index) =>
        String(index + 1),
      ).join('\n') + '\n';
    scroll();
  };
  input.addEventListener('input', render);
  input.addEventListener('scroll', scroll);
  render();
}
