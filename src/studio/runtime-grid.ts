import type {RuntimeGrid} from './runtime-model.js';

const signatures = new WeakMap<HTMLElement, string>();
const blockedGrids = new WeakMap<HTMLElement, boolean>();
export function renderGrid(
  root: HTMLElement,
  grid: RuntimeGrid,
  blocked: boolean,
  send: (value: string) => void,
) {
  blockedGrids.set(root, blocked);
  root.setAttribute('role', 'grid');
  root.setAttribute('aria-disabled', String(blocked));
  const event = (action: string, row = 0, column = 0, text?: string) => {
    if (!blockedGrids.get(root))
      send(JSON.stringify({action, row, column, text}));
  };
  const signature = JSON.stringify({
    ...grid,
    selected: null,
    currentColumn: -1,
    blocked,
  });
  if (
    signatures.get(root) !== signature &&
    (!root.querySelector('input:focus') || blocked)
  ) {
    signatures.set(root, signature);
    root.replaceChildren();
    const table = document.createElement('table');
    table.className = grid.fill ? 'wf-grid-fill' : '';
    const visible = grid.columns
      .map((c, i) => ({...c, index: i}))
      .filter(c => c.visible);
    if (grid.headers && visible.length) {
      const head = table.createTHead().insertRow();
      if (grid.rowHeaders) head.append(document.createElement('th'));
      for (const column of visible) {
        const cell = document.createElement('th');
        cell.textContent = column.header;
        cell.style.width = `${Math.max(20, Math.min(2000, column.width))}px`;
        head.append(cell);
      }
    }
    const body = table.createTBody();
    for (const row of grid.rows) {
      const tr = body.insertRow();
      tr.dataset.row = String(row.id);
      if (grid.rowHeaders) {
        const th = document.createElement('th');
        th.textContent = '';
        tr.append(th);
      }
      for (const column of visible) {
        const value = row.cells[column.index];
        if (!value) continue;
        const td = tr.insertCell();
        td.textContent = value.text;
        td.tabIndex = blocked ? -1 : 0;
        td.setAttribute('role', 'gridcell');
        td.dataset.column = String(column.index);
        td.onclick = () => event('click', row.id, column.index);
        const edit = () => {
          if (blocked || value.readOnly || td.querySelector('input')) return;
          const input = document.createElement('input');
          input.value = value.text;
          input.setAttribute('aria-label', column.header);
          td.replaceChildren(input);
          let done = false;
          const finish = (save: boolean) => {
            if (done) return;
            done = true;
            td.textContent = value.text;
            if (save) event('edit', row.id, column.index, input.value);
            td.focus();
          };
          input.onblur = () => finish(true);
          input.onkeydown = e => {
            e.stopPropagation();
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault();
              finish(e.key === 'Enter');
            }
          };
          input.focus();
          input.select();
        };
        td.ondblclick = () => {
          event('double', row.id, column.index);
          edit();
        };
        td.onkeydown = e => {
          if (e.key === 'F2' || e.key === 'Enter') {
            e.preventDefault();
            edit();
          }
          if (e.key === 'Delete' && grid.delete) {
            e.preventDefault();
            event('delete', row.id, column.index);
          }
        };
      }
    }
    if (grid.add) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = visible.length + Number(grid.rowHeaders);
      const add = document.createElement('button');
      add.textContent = '*';
      add.title = 'Добавить строку';
      add.disabled = blocked;
      add.onclick = () => event('add');
      cell.append(add);
    }
    root.append(table);
    if (grid.error) {
      const error = document.createElement('div');
      error.className = 'wf-grid-error';
      error.setAttribute('role', 'alert');
      error.textContent = grid.error;
      root.append(error);
    }
  }
  root.querySelectorAll<HTMLTableRowElement>('tr[data-row]').forEach(row => {
    row.classList.toggle(
      'wf-selected',
      Number(row.dataset.row) === grid.selected,
    );
    row.querySelectorAll<HTMLElement>('[data-column]').forEach(cell => {
      cell.setAttribute(
        'aria-selected',
        String(
          Number(row.dataset.row) === grid.selected &&
            Number(cell.dataset.column) === grid.currentColumn,
        ),
      );
    });
  });
}
