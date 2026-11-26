import {createElement} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {SelectControl} from '../components/select-control.js';

interface Control {
  host: HTMLElement;
  root: Root;
  close(): void;
}
const controls = new Set<Control>();
let serial = 0;

export function closeSelectMenu() {
  for (const control of controls) control.close();
}

export function enhanceSelects(root: ParentNode) {
  for (const control of controls) {
    if (control.host.isConnected) continue;
    control.root.unmount();
    controls.delete(control);
  }

  for (const select of root.querySelectorAll<HTMLSelectElement>(
    'select:not([data-enhanced]):not([aria-hidden])',
  )) {
    if (
      !select.options.length ||
      select.multiple ||
      select.closest('[data-ui-select], [aria-hidden=true]')
    )
      continue;
    const label = select.labels?.[0];
    const title =
      select.getAttribute('aria-label') ??
      (label
        ? [...label.childNodes]
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent)
            .join('')
            .trim()
        : select.name || select.id);
    const id = `select-${++serial}`;
    select.dataset.enhanced = 'true';
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    if (label) label.htmlFor = id;
    const host = document.createElement('span');
    host.className = 'select-host';
    host.dataset.uiSelect = 'true';
    if (label?.contains(select)) {
      const field = document.createElement('div');
      field.className = 'select-field';
      label.before(field);
      field.append(label, host);
    } else select.after(host);
    const root = createRoot(host, {identifierPrefix: id});
    const control: Control = {host, root, close() {}};
    const registerClose = (close: () => void) => {
      control.close = close;
    };
    controls.add(control);
    flushSync(() =>
      root.render(
        createElement(SelectControl, {select, label: title, id, registerClose}),
      ),
    );
  }
}

export function disposeSelects() {
  for (const control of controls) control.root.unmount();
  controls.clear();
}
