import {addressName, parseAddress} from '../spreadsheet/address.js';

export function gridSelection(
  grid: HTMLElement,
  initial: string,
  select: (key: string) => boolean,
  size = {rows: 100, columns: 12},
  mounted?: Map<string, HTMLTableCellElement>,
  reveal: (key: string) => void = () => {},
) {
  let anchor = initial;
  let end = initial;
  let pointer: number | null = null;
  let suppressClick = false;
  const cells =
    mounted ??
    new Map(
      [...grid.querySelectorAll<HTMLTableCellElement>('[data-cell]')].map(
        cell => [cell.dataset.cell!, cell],
      ),
    );
  const paint = () => {
    const a = parseAddress(anchor),
      b = parseAddress(end);
    for (const [key, cell] of cells) {
      const ref = parseAddress(key);
      cell.classList.toggle(
        'selected-range',
        ref.row >= Math.min(a.row, b.row) &&
          ref.row <= Math.max(a.row, b.row) &&
          ref.column >= Math.min(a.column, b.column) &&
          ref.column <= Math.max(a.column, b.column),
      );
    }
  };
  const extend = (key: string) => {
    if (end === key) return;
    end = key;
    paint();
  };
  grid.addEventListener('pointerdown', event => {
    const target = (event.target as Element).closest<HTMLElement>(
      '[data-cell]',
    );
    if (
      !target ||
      event.button !== 0 ||
      event.target instanceof HTMLInputElement
    )
      return;
    const previous = anchor;
    if (!select(target.dataset.cell!)) return;
    anchor = event.shiftKey ? previous : target.dataset.cell!;
    end = target.dataset.cell!;
    pointer = event.pointerId;
    suppressClick = true;
    grid.setPointerCapture(pointer);
    event.preventDefault();
    paint();
  });
  grid.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    const hit = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-cell]');
    if (hit && grid.contains(hit)) extend(hit.dataset.cell!);
  });
  const stop = () => {
    pointer = null;
  };
  grid.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer) return;
    if (grid.hasPointerCapture(pointer)) grid.releasePointerCapture(pointer);
    stop();
  });
  grid.addEventListener('pointercancel', stop);
  grid.addEventListener('lostpointercapture', stop);
  grid.addEventListener(
    'click',
    event => {
      if (!suppressClick || !event.isTrusted) return;
      suppressClick = false;
      event.stopImmediatePropagation();
    },
    true,
  );
  return {
    reset(key: string) {
      anchor = end = key;
      paint();
    },
    paint,
    get range() {
      return `${anchor}:${end}`;
    },
    move(dx: number, dy: number) {
      const ref = parseAddress(end);
      const key = addressName({
        ...ref,
        row: Math.min(size.rows, Math.max(1, ref.row + dy)),
        column: Math.min(size.columns, Math.max(1, ref.column + dx)),
      });
      reveal(key);
      extend(key);
      grid.querySelector<HTMLElement>(`[data-cell="${key}"]`)?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        container: 'nearest',
      } as ScrollIntoViewOptions);
    },
  };
}
