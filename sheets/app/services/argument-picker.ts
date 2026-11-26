import {query} from '../../../packages/ui/services/dom.js';
import {type FormulaLanguage} from '../../../packages/spreadsheet/src/index.js';

declare global {
  interface Window {
    rangeWindow?: {setPicking: (active: boolean) => void};
  }
}
export function argumentPicker(
  apply: (index: number, reference: string) => void,
) {
  let argument: number | null = null;
  const cancel = () =>
    window.opener?.postMessage({type: 'cancel-pick'}, location.origin);
  query('#cancel-range').onclick = cancel;
  window.addEventListener('message', event => {
    if (
      event.source !== window.opener ||
      event.origin !== location.origin ||
      event.data?.type !== 'range' ||
      argument === null
    )
      return;
    const index = argument;
    argument = null;
    document.body.classList.remove('picking');
    window.rangeWindow?.setPicking(false);
    if (typeof event.data.reference === 'string')
      apply(index, event.data.reference);
    query<HTMLInputElement>(`[data-argument="${index}"]`).focus();
  });
  return {
    get active() {
      return argument !== null;
    },
    cancel,
    button(index: number, language: FormulaLanguage) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pick-range';
      button.dataset.pick = String(index);
      const label =
        language === 'ru'
          ? 'Выбрать диапазон на листе'
          : 'Select a range on the sheet';
      button.title = label;
      button.setAttribute('aria-label', label);
      button.innerHTML =
        '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M8 3H3v5m9-5h5v5M3 12v5h5m9-5v5h-5"/><rect x="7" y="7" width="6" height="6"/></svg>';
      button.onclick = () => {
        argument = index;
        query('#range-instruction').textContent =
          language === 'ru'
            ? 'Выдели ячейки на листе мышью'
            : 'Drag over cells on the sheet';
        query('#cancel-range').textContent =
          language === 'ru' ? 'Отмена' : 'Cancel';
        document.body.classList.add('picking');
        window.opener?.postMessage({type: 'pick'}, location.origin);
        window.rangeWindow?.setPicking(true);
      };
      return button;
    },
  };
}
