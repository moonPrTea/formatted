import type {
  RuntimeNode,
  RuntimeEvent,
  RuntimeSnapshot,
} from './runtime-model.js';
import {renderGrid} from './runtime-grid.js';
import {makeList, updateList} from './runtime-list.js';
declare global {
  interface Window {
    formRuntime: {
      event(value: RuntimeEvent): void;
      onSnapshot(callback: (value: RuntimeSnapshot) => void): void;
    };
  }
}
const root = document.getElementById('form')!;
const elements = new Map<number, HTMLElement>();
const pending = new Map<number, number>();
let sequence = 0;
function send(
  id: number,
  kind: RuntimeEvent['kind'],
  value?: RuntimeEvent['value'],
) {
  pending.set(id, ++sequence);
  window.formRuntime.event({id, kind, value, seq: sequence});
}
function make(c: RuntimeNode) {
  let element: HTMLElement;
  if (c.type === 'Button') {
    element = document.createElement('button');
    element.onclick = () => send(c.id, 'click');
  } else if (c.type === 'TextBox') {
    const input = document.createElement(c.multiline ? 'textarea' : 'input');
    input.oninput = () => send(c.id, 'text', input.value);
    element = input;
  } else if (['CheckBox', 'RadioButton'].includes(c.type)) {
    element = document.createElement('label');
    const input = document.createElement('input');
    input.type = c.type === 'RadioButton' ? 'radio' : 'checkbox';
    input.onchange = () => send(c.id, 'check', input.checked);
    element.append(input, document.createElement('span'));
  } else if (['ComboBox', 'ListBox'].includes(c.type)) {
    element = makeList(c.type === 'ComboBox', (kind, value) =>
      send(c.id, kind, value),
    );
  } else if (c.type === 'ProgressBar')
    element = document.createElement('progress');
  else if (c.type === 'GroupBox') {
    element = document.createElement('div');
    const caption = document.createElement('span');
    caption.className = 'label';
    element.append(caption);
  } else element = document.createElement('div');
  element.classList.add('control');
  element.dataset.id = String(c.id);
  element.dataset.type = c.type;
  element.dataset.wf = c.type;
  return element;
}
window.formRuntime.onSnapshot(snapshot => {
  const alive = new Set<number>();
  function render(c: RuntimeNode, parent: HTMLElement, disabled: boolean) {
    alive.add(c.id);
    let el = elements.get(c.id);
    if (!el || el.dataset.type !== c.type) {
      el?.remove();
      el = make(c);
      elements.set(c.id, el);
    }
    if (el.parentElement !== parent) parent.append(el);
    el.dataset.name = c.name;
    el.hidden = !c.visible;
    Object.assign(el.style, {
      left: `${c.x}px`,
      top: `${c.y}px`,
      width: `${c.width}px`,
      height: `${c.height}px`,
      backgroundColor: c.backColor,
      color: c.foreColor,
    });
    const blocked = disabled || !c.enabled;
    const editable = (pending.get(c.id) ?? 0) <= snapshot.ack;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (editable && el.value !== c.text) el.value = c.text;
      el.readOnly = c.readOnly;
      el.maxLength = Math.max(0, c.maxLength);
      el.disabled = blocked;
      if (el instanceof HTMLInputElement)
        el.type = c.password ? 'password' : 'text';
    } else if (c.type === 'ComboBox' || c.type === 'ListBox') {
      updateList(el, c, editable, blocked);
    } else if (el instanceof HTMLButtonElement) {
      el.textContent = c.text;
      el.disabled = blocked;
    } else if (el instanceof HTMLLabelElement) {
      const input = el.querySelector('input')!;
      if (editable) input.checked = c.check;
      input.disabled = blocked;
      el.querySelector('span')!.textContent = c.text;
    } else if (el instanceof HTMLProgressElement) {
      el.max = Math.max(1, c.maximum - c.minimum);
      el.value = c.value - c.minimum;
    } else if (c.type === 'GroupBox') {
      el.querySelector(':scope > .label')!.textContent = c.text;
    } else if (c.type === 'Label') el.textContent = c.text;
    else if (c.type === 'DataGridView' && c.grid)
      renderGrid(el, c.grid, blocked, value => send(c.id, 'grid', value));
    for (const child of c.children) render(child, el, blocked);
  }
  root.style.backgroundColor = snapshot.form.backColor;
  for (const child of snapshot.form.children)
    render(child, root, snapshot.disabled || !snapshot.form.enabled);
  for (const [id, element] of elements)
    if (!alive.has(id)) {
      element.remove();
      elements.delete(id);
      pending.delete(id);
    }
  if (snapshot.focus) elements.get(snapshot.focus)?.focus();
});
