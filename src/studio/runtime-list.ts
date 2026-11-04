import type {RuntimeNode, RuntimeEvent} from './runtime-model.js';

type Send = (kind: RuntimeEvent['kind'], value: string | number) => void;
const models = new WeakMap<HTMLElement, RuntimeNode>();
export function makeList(combo: boolean, send: Send) {
  const root = document.createElement('div');
  const list = document.createElement('div');
  list.className = 'wf-options';
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  const choose = (index: number) => {
    const c = models.get(root);
    if (
      root.getAttribute('aria-disabled') === 'true' ||
      !c ||
      index < 0 ||
      index >= c.items.length
    )
      return;
    send('select', index);
    if (combo) {
      list.hidePopover();
      root.querySelector('input')?.focus();
    }
  };
  if (combo) {
    const input = document.createElement('input');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.className = 'wf-combo-input';
    input.oninput = () => send('text', input.value);
    const toggle = document.createElement('button');
    toggle.className = 'wf-combo-arrow';
    toggle.setAttribute('aria-label', 'Открыть список');
    toggle.tabIndex = -1;
    list.popover = 'auto';
    toggle.onclick = () => {
      const r = root.getBoundingClientRect();
      Object.assign(list.style, {
        left: `${r.left}px`,
        top: `${r.bottom}px`,
        width: `${r.width}px`,
        maxHeight: `${Math.max(24, Math.min(180, innerHeight - r.bottom - 4))}px`,
      });
      list.togglePopover();
    };
    list.addEventListener('toggle', () =>
      input.setAttribute(
        'aria-expanded',
        String(list.matches(':popover-open')),
      ),
    );
    root.append(input, toggle);
  } else {
    root.tabIndex = 0;
    root.setAttribute('role', 'listbox');
  }
  root.append(list);
  root.onkeydown = e => {
    const c = models.get(root);
    if (!c) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      choose(
        Math.max(
          0,
          Math.min(
            c.items.length - 1,
            c.selectedIndex + (e.key === 'ArrowDown' ? 1 : -1),
          ),
        ),
      );
    }
  };
  list.addEventListener('mousedown', e => e.preventDefault());
  list.onclick = e => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-option]',
    );
    if (item) choose(Number(item.dataset.option));
  };
  return root;
}
export function updateList(
  root: HTMLElement,
  c: RuntimeNode,
  editable: boolean,
  blocked: boolean,
) {
  models.set(root, c);
  root.setAttribute('aria-disabled', String(blocked));
  const list = root.querySelector<HTMLElement>('.wf-options')!;
  if (list.dataset.items !== JSON.stringify(c.items)) {
    list.dataset.items = JSON.stringify(c.items);
    list.replaceChildren(
      ...c.items.map((text, i) => {
        const option = document.createElement('div');
        option.className = 'wf-option';
        option.textContent = text;
        option.dataset.option = String(i);
        option.setAttribute('role', 'option');
        return option;
      }),
    );
  }
  for (const option of list.children)
    option.setAttribute(
      'aria-selected',
      String(
        Number((option as HTMLElement).dataset.option) === c.selectedIndex,
      ),
    );
  const input = root.querySelector('input');
  if (input) {
    if (editable && input.value !== c.text) input.value = c.text;
    input.disabled = blocked;
    input.readOnly = c.dropDownStyle === 'DropDownList';
    root.querySelector('button')!.disabled = blocked;
  }
  if (blocked && list.matches(':popover-open')) list.hidePopover();
}
