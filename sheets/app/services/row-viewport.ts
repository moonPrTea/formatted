import {
  columnName,
  parseAddress,
} from '../../../packages/spreadsheet/src/address.js';
import {limits} from '../../../packages/spreadsheet/src/types.js';

export function rowViewport(
  grid: HTMLTableElement,
  cells: Map<string, HTMLTableCellElement>,
  size: {rows: number; columns: number},
  selected: () => string,
  painted: () => void,
) {
  const viewport = grid.parentElement!;
  const body = grid.createTBody();
  const rows = new Map<number, HTMLTableRowElement>();
  const visibleRows = 100;
  const overscan = 20;
  const rowHeight = 27;
  const maxCanvasHeight = 4_000_000;
  let extent = Math.min(limits.rows, Math.max(visibleRows, size.rows));
  let first = Math.max(1, parseAddress(selected()).row - overscan);
  let rendered: number[] = [];
  let frame = 0;
  const pitch = () => Math.min(rowHeight, maxCanvasHeight / extent);
  const clamp = (row: number) =>
    Math.min(Math.max(1, extent - visibleRows + 1), Math.max(1, row));
  const offset = (row: number) =>
    (row - 1) * pitch() +
    rendered.filter(number => number < row).length * (rowHeight - pitch());
  const rowAt = (position: number) => {
    let top = 0,
      previous = 0;
    for (const row of rendered) {
      const gap = (row - previous - 1) * pitch();
      if (position < top + gap) {
        const count = Math.floor((position - top) / pitch());
        return {
          row: previous + count + 1,
          within: position - top - count * pitch(),
        };
      }
      top += gap;
      if (position < top + rowHeight) return {row, within: position - top};
      top += rowHeight;
      previous = row;
    }
    const count = Math.floor((position - top) / pitch());
    return {
      row: Math.min(extent, previous + count + 1),
      within: position - top - count * pitch(),
    };
  };
  const spacer = (count: number) => {
    const row = document.createElement('tr');
    row.className = 'grid-spacer';
    row.setAttribute('aria-hidden', 'true');
    const cell = row.insertCell();
    cell.colSpan = size.columns + 1;
    cell.style.height = `${count * pitch()}px`;
    return row;
  };
  const create = (row: number) => {
    const element = document.createElement('tr');
    const header = document.createElement('th');
    header.scope = 'row';
    header.textContent = String(row);
    element.append(header);
    for (let column = 1; column <= size.columns; column++) {
      const cell = element.insertCell();
      cell.dataset.cell = `${columnName(column)}${row}`;
      cell.setAttribute('role', 'gridcell');
      cells.set(cell.dataset.cell, cell);
    }
    rows.set(row, element);
    return element;
  };
  function mount() {
    const headerWidth = Math.max(44, String(extent).length * 8 + 16);
    grid.style.setProperty('--row-header-width', `${headerWidth}px`);
    grid.style.width = `${size.columns * 132 + headerWidth}px`;
    first = clamp(first);
    const visible = new Set(
      Array.from(
        {length: Math.min(visibleRows, extent - first + 1)},
        (_, index) => first + index,
      ),
    );
    visible.add(parseAddress(selected()).row);
    rendered = [...visible].sort((a, b) => a - b);
    for (const [number, row] of rows) {
      if (visible.has(number)) continue;
      for (const cell of row.querySelectorAll<HTMLElement>('[data-cell]'))
        cells.delete(cell.dataset.cell!);
      row.remove();
      rows.delete(number);
    }
    for (const gap of body.querySelectorAll('.grid-spacer')) gap.remove();
    let cursor = body.firstChild;
    let previous = 0;
    for (const number of rendered) {
      if (number > previous + 1)
        body.insertBefore(spacer(number - previous - 1), cursor);
      const row = rows.get(number) ?? create(number);
      if (row !== cursor) body.insertBefore(row, cursor);
      cursor = row.nextSibling;
      previous = number;
    }
    if (previous < extent) body.append(spacer(extent - previous));
    grid.setAttribute('aria-rowcount', String(limits.rows));
  }
  mount();
  viewport.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const anchor = rowAt(viewport.scrollTop);
      const nearEnd =
        viewport.scrollTop + viewport.clientHeight >=
        viewport.scrollHeight - 540;
      const grow = nearEnd && extent < limits.rows;
      if (grow) extent = Math.min(limits.rows, extent + visibleRows);
      const next = clamp(anchor.row - overscan);
      if (next === first && !grow) return;
      first = next;
      mount();
      viewport.scrollTop = offset(anchor.row) + anchor.within;
      painted();
    });
  });
  return {
    show(row: number) {
      if (rows.has(row)) return;
      if (row > extent - overscan)
        extent = Math.min(
          limits.rows,
          Math.max(extent + visibleRows, row + visibleRows),
        );
      first = Math.max(1, row - overscan);
      mount();
      viewport.scrollTop = offset(first);
      painted();
    },
  };
}
