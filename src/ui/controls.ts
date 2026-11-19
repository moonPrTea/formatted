import {buttonVariants, inputVariants} from '@heroui/styles';
import {enhanceSelects} from '../selects.js';

export function enhanceControls(root: ParentNode) {
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    'button:not([data-slot]):not([data-ui]):not(.number-step)',
  )) {
    if (button.closest('#grid')) continue;
    const primary = button.matches('.primary, #insert, #sheet-dialog-apply');
    const ghost = button.matches('.text-button, .lesson-step, [data-function]');
    button.dataset.ui = 'heroui';
    button.className = buttonVariants({
      variant: primary ? 'primary' : ghost ? 'ghost' : 'secondary',
      className: button.className,
    });
    if (button.matches('.answer, .lesson-step, [data-function]'))
      button.classList.add('multiline-button');
  }
  for (const input of root.querySelectorAll<HTMLInputElement>(
    'input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=file])',
  )) {
    if (input.closest('#grid') || input.dataset.slot || input.dataset.ui)
      continue;
    input.dataset.ui = 'heroui';
    input.className = inputVariants({className: input.className});
  }
}

export function observeControls(root: HTMLElement) {
  enhanceControls(root);
  enhanceSelects(root);
  const observer = new MutationObserver(records => {
    let controlsChanged = false;
    for (const record of records) {
      if (record.target instanceof Element && record.target.closest('#grid'))
        continue;
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement) || node.closest('#grid')) continue;
        enhanceControls(node.parentElement ?? node);
        controlsChanged = true;
      }
    }
    if (controlsChanged) enhanceSelects(root);
  });
  observer.observe(root, {childList: true, subtree: true});
  return () => observer.disconnect();
}
