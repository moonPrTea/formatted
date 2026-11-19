interface SelectControl {
  select: HTMLSelectElement;
  trigger: HTMLButtonElement;
  options: HTMLOptionElement[];
  labelId: string;
  menuId: string;
  index: number;
  search: string;
  searchAt: number;
  menu: HTMLDivElement;
  items: HTMLDivElement[];
  sync(): void;
}
// Accessible, select-only comboboxes. Native selects remain the source for FormData.
let openControl: SelectControl | null = null;
let serial = 0;

export function closeSelectMenu(restoreFocus = false) {
  if (!openControl) return;
  const {trigger, menu} = openControl;
  openControl = null;
  trigger.setAttribute('aria-expanded', 'false');
  trigger.removeAttribute('aria-activedescendant');
  menu.remove();
  if (restoreFocus && trigger.isConnected) trigger.focus({preventScroll: true});
}

function positionMenu(control: SelectControl) {
  const rect = control.trigger.getBoundingClientRect();
  const below = innerHeight - rect.bottom - 12;
  const above = rect.top - 12;
  // Measure after setting the final width: wrapping changes the menu height.
  // Include borders, otherwise even a short list gets a two-pixel scrollbar.
  control.menu.style.width = `${Math.min(rect.width, innerWidth - 16)}px`;
  control.menu.style.maxHeight = 'none';
  const height = Math.min(
    control.menu.offsetHeight,
    280,
    Math.max(below, above),
  );
  Object.assign(control.menu.style, {
    left: `${Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8))}px`,
    top: `${below >= height ? rect.bottom + 6 : Math.max(8, rect.top - height - 6)}px`,
    width: `${Math.min(rect.width, innerWidth - 16)}px`,
    maxHeight: `${Math.max(44, height)}px`,
  });
}

function highlight(control: SelectControl, index: number) {
  control.index = (index + control.options.length) % control.options.length;
  control.items.forEach((item, i) =>
    item.classList.toggle('highlighted', i === control.index),
  );
  control.trigger.setAttribute(
    'aria-activedescendant',
    control.items[control.index].id,
  );
  const item = control.items[control.index];
  const {menu} = control;
  if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop;
  else if (
    item.offsetTop + item.offsetHeight >
    menu.scrollTop + menu.clientHeight
  )
    menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight;
}

function choose(control: SelectControl, index: number) {
  const value = control.options[index].value;
  const changed = control.select.value !== value;
  closeSelectMenu(true);
  control.select.value = value;
  control.sync();
  if (changed)
    control.select.dispatchEvent(new Event('change', {bubbles: true}));
}

function openMenu(control: SelectControl) {
  if (control.trigger.disabled) return;
  closeSelectMenu();
  const menu = document.createElement('div');
  menu.id = control.menuId;
  menu.className = 'select-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-labelledby', control.labelId);
  // Top-layer popover prevents clipping by cards or scrolling ancestors.
  if ('showPopover' in menu) menu.setAttribute('popover', 'manual');
  control.menu = menu;
  control.items = control.options.map((option, index) => {
    const item = document.createElement('div');
    item.id = `${menu.id}-${index}`;
    item.className = 'select-option';
    item.setAttribute('role', 'option');
    item.setAttribute(
      'aria-selected',
      String(control.select.value === option.value),
    );
    const text = document.createElement('span');
    text.textContent = option.text;
    const check = document.createElement('span');
    check.className = 'select-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = control.select.value === option.value ? '✓' : '';
    item.append(text, check);
    item.addEventListener('pointerdown', event => event.preventDefault());
    item.addEventListener('pointermove', () => highlight(control, index));
    item.addEventListener('click', () => choose(control, index));
    menu.append(item);
    return item;
  });
  // Keep controls in a modal's focus scope while the popover uses the top layer.
  (control.select.closest('dialog') ?? document.body).append(menu);
  if (menu.showPopover) menu.showPopover();
  openControl = control;
  control.trigger.setAttribute('aria-expanded', 'true');
  positionMenu(control);
  highlight(control, Math.max(0, control.select.selectedIndex));
}

export function enhanceSelects(root: ParentNode) {
  for (const select of root.querySelectorAll<HTMLSelectElement>(
    'select:not([data-enhanced]):not([aria-hidden])',
  )) {
    select.dataset.enhanced = 'true';
    const label = select.closest('label')!;
    const id = `select-${++serial}`;
    const labelText = document.createElement('span');
    labelText.id = `${id}-label`;
    for (const node of [...label.childNodes])
      if (node.nodeType === Node.TEXT_NODE) labelText.append(node);
    label.prepend(labelText);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'select-trigger';
    trigger.dataset.selectName = select.name;
    trigger.id = id;
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `${id}-menu`);
    trigger.setAttribute('aria-labelledby', labelText.id);
    // Explicitly associate the visible label with the custom control, not the hidden select.
    label.htmlFor = id;
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.after(trigger);
    const caption = document.createElement('span');
    caption.className = 'select-caption';
    const chevron = document.createElement('span');
    chevron.className = 'select-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    trigger.append(caption, chevron);
    const control: SelectControl = {
      menu: document.createElement('div'),
      items: [],
      select,
      trigger,
      options: [...select.options],
      labelId: labelText.id,
      menuId: `${id}-menu`,
      index: select.selectedIndex,
      search: '',
      searchAt: 0,
      sync() {
        caption.textContent = select.selectedOptions[0]?.text ?? '';
        trigger.disabled = select.disabled;
      },
    };
    control.sync();
    select.addEventListener('change', control.sync);
    trigger.addEventListener('click', () =>
      openControl === control ? closeSelectMenu() : openMenu(control),
    );
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        closeSelectMenu();
        return;
      }
      if (event.key === 'Escape') {
        if (openControl === control) event.preventDefault();
        closeSelectMenu(true);
        return;
      }
      if (
        ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(
          event.key,
        )
      ) {
        event.preventDefault();
        if (openControl !== control) {
          openMenu(control);
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          choose(control, control.index);
          return;
        }
        highlight(
          control,
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? control.options.length - 1
              : control.index + (event.key === 'ArrowDown' ? 1 : -1),
        );
      } else if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        if (openControl !== control) openMenu(control);
        control.search =
          Date.now() - control.searchAt > 700
            ? event.key
            : control.search + event.key;
        control.searchAt = Date.now();
        const index = control.options.findIndex(option =>
          option.text
            .toLocaleLowerCase()
            .startsWith(control.search.toLocaleLowerCase()),
        );
        if (index >= 0) highlight(control, index);
      }
    });
  }
}

document.addEventListener('pointerdown', event => {
  if (
    openControl &&
    !openControl.menu.contains(event.target as Node) &&
    !openControl.trigger.contains(event.target as Node)
  )
    closeSelectMenu();
});
document.addEventListener('focusin', event => {
  if (
    openControl &&
    event.target !== openControl.trigger &&
    !openControl.menu.contains(event.target as Node)
  )
    closeSelectMenu();
});
window.addEventListener('resize', () => closeSelectMenu());
document.addEventListener(
  'scroll',
  event => {
    if (openControl && !openControl.menu.contains(event.target as Node))
      closeSelectMenu();
  },
  true,
);
