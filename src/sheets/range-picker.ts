import {parseAddress, rangeBounds, columnName} from '../spreadsheet/address.js';

export function rangeReference(sheet: string, first: string, last: string) {
  const bounds = rangeBounds(parseAddress(first), parseAddress(last));
  const cell = (row: number, column: number) => `$${columnName(column)}$${row}`;
  const start = cell(bounds.top, bounds.left);
  const end = cell(
    bounds.top + bounds.rows - 1,
    bounds.left + bounds.columns - 1,
  );
  return `'${sheet.replaceAll("'", "''")}'.${start}${start === end ? '' : ':' + end}`;
}

export function createRangePicker(grid: HTMLElement, sheet: () => string) {
  let finish: ((reference: string | null) => void) | null = null;
  let anchor = '';
  let end = '';
  let pointer = -1;
  let frame = 0;
  let x = 0;
  let y = 0;
  let freeKeys = false;
  let suppressClick = false;
  const viewport = grid.parentElement!;
  const clear = () =>
    grid
      .querySelectorAll('.range-cell')
      .forEach(cell => cell.classList.remove('range-cell'));
  const stop = () => {
    finish = null;
    cancelAnimationFrame(frame);
    if (grid.hasPointerCapture(pointer)) grid.releasePointerCapture(pointer);
    pointer = -1;
    anchor = end = '';
    clear();
    grid.classList.remove('picking-range');
  };
  const paint = () => {
    if (!anchor || !end) return;
    const start = parseAddress(anchor),
      last = parseAddress(end);
    grid.querySelectorAll<HTMLElement>('[data-cell]').forEach(cell => {
      const ref = parseAddress(cell.dataset.cell!);
      cell.classList.toggle(
        'range-cell',
        ref.row >= Math.min(start.row, last.row) &&
          ref.row <= Math.max(start.row, last.row) &&
          ref.column >= Math.min(start.column, last.column) &&
          ref.column <= Math.max(start.column, last.column),
      );
    });
  };
  const rowHeaderWidth = () =>
    parseFloat(getComputedStyle(grid).getPropertyValue('--row-header-width')) ||
    44;
  const update = () => {
    const rect = viewport.getBoundingClientRect();
    const hit = document
      .elementFromPoint(
        Math.max(
          rect.left + rowHeaderWidth() + 2,
          Math.min(x, rect.right - 18),
        ),
        Math.max(rect.top + 29, Math.min(y, rect.bottom - 18)),
      )
      ?.closest<HTMLElement>('[data-cell]');
    if (hit && grid.contains(hit) && hit.dataset.cell !== end) {
      end = hit.dataset.cell!;
      paint();
    }
  };
  const track = () => {
    const rect = viewport.getBoundingClientRect();
    const dx =
      x < rect.left + rowHeaderWidth() + 8 ? -12 : x > rect.right - 24 ? 12 : 0;
    const dy = y < rect.top + 35 ? -12 : y > rect.bottom - 24 ? 12 : 0;
    viewport.scrollBy(dx, dy);
    update();
    frame = requestAnimationFrame(track);
  };
  grid.addEventListener(
    'pointerdown',
    event => {
      suppressClick = false;
      if (!finish || event.button !== 0 || pointer !== -1) return;
      const hit = (event.target as Element).closest<HTMLElement>('[data-cell]');
      if (!hit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      anchor = end = hit.dataset.cell!;
      pointer = event.pointerId;
      x = event.clientX;
      y = event.clientY;
      grid.setPointerCapture(pointer);
      paint();
      frame = requestAnimationFrame(track);
    },
    true,
  );
  grid.addEventListener('pointermove', event => {
    if (event.pointerId === pointer) {
      x = event.clientX;
      y = event.clientY;
      update();
    }
  });
  grid.addEventListener(
    'pointerup',
    event => {
      if (!finish || event.pointerId !== pointer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      x = event.clientX;
      y = event.clientY;
      update();
      const done = finish;
      let reference;
      try {
        reference = rangeReference(sheet(), anchor, end);
      } catch {
        cancel();
        return;
      }
      suppressClick = true;
      stop();
      done(reference);
    },
    true,
  );
  const cancel = () => {
    const done = finish;
    stop();
    done?.(null);
  };
  grid.addEventListener('pointercancel', event => {
    if (event.pointerId === pointer) cancel();
  });
  grid.addEventListener('lostpointercapture', () => {
    if (finish && pointer !== -1) cancel();
  });
  grid.addEventListener(
    'click',
    event => {
      if (finish || (suppressClick && event.isTrusted)) {
        suppressClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  document.addEventListener(
    'keydown',
    event => {
      if (!finish || (freeKeys && event.key !== 'Escape')) return;
      if (event.key === 'Tab') return;
      if (
        (event.target as Element).closest('[data-sheet]') &&
        ['Enter', ' '].includes(event.key)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') cancel();
    },
    true,
  );
  grid.addEventListener(
    'paste',
    event => {
      if (finish && !freeKeys) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  return {
    get active() {
      return finish !== null;
    },
    start(done: (reference: string | null) => void, allowKeys = false) {
      stop();
      finish = done;
      freeKeys = allowKeys;
      grid.classList.add('picking-range');
      return stop;
    },
    clear,
    paint,
  };
}
