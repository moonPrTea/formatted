import {type Workbook} from '../../../packages/spreadsheet/src/index.js';
import {type WizardContext} from './wizard-model.js';

export function functionDialog(
  book: Workbook,
  context: () => Omit<WizardContext, 'cells' | 'sheets'>,
  apply: (formula: string, original: WizardContext) => boolean,
  restore: (original: WizardContext) => void,
  pick: (done: (reference: string | null) => void) => () => void,
) {
  let child: Window | null = null;
  let snapshot: WizardContext;
  let stopPicking = () => {};
  let applied = false;
  let cleanup = () => {};
  const lock = (picking: boolean) => {
    document.body.inert = !picking;
    document
      .querySelectorAll<HTMLElement>('header, #formula-bar')
      .forEach(e => (e.inert = picking));
  };
  const endPicking = (reference: string | null) => {
    stopPicking();
    restore(snapshot);
    lock(false);
    child?.postMessage({type: 'range', reference}, location.origin);
  };
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || !child || event.source !== child)
      return;
    if (event.data?.type === 'ready')
      child.postMessage({type: 'init', context: snapshot}, location.origin);
    if (event.data?.type === 'pick') {
      stopPicking();
      lock(true);
      stopPicking = pick(endPicking);
    }
    if (event.data?.type === 'cancel-pick') endPicking(null);
    if (
      event.data?.type === 'apply' &&
      typeof event.data.formula === 'string' &&
      event.data.formula.startsWith('=') &&
      event.data.formula.length <= 4096
    ) {
      applied = apply(event.data.formula, snapshot);
      if (applied) child.close();
    }
  });
  return () => {
    if (child && !child.closed) {
      child.focus();
      return;
    }
    cleanup();
    snapshot = {...context(), sheets: book.getSheetNames(), cells: []};
    applied = false;
    snapshot.cells = book.getInputs();
    child = window.open('wizard.html', 'function-wizard');
    if (!child) return;
    lock(false);
    const timer = setInterval(() => {
      if (child && !child.closed) return;
      cleanup();
    }, 100);
    cleanup = () => {
      clearInterval(timer);
      stopPicking();
      if (!applied) restore(snapshot);
      document.body.inert = false;
      document
        .querySelectorAll<HTMLElement>('header, #formula-bar')
        .forEach(e => (e.inert = false));
      cleanup = () => {};
    };
  };
}
