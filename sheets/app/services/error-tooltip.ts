export function errorTooltip(grid: HTMLElement) {
  const popup = document.createElement('aside');
  popup.id = 'cell-error-tooltip';
  popup.setAttribute('role', 'tooltip');
  popup.hidden = true;
  document.body.append(popup);
  let anchor: HTMLElement | null = null;
  let timer = 0;
  const hide = () => {
    clearTimeout(timer);
    anchor?.removeAttribute('aria-describedby');
    anchor = null;
    popup.hidden = true;
  };
  const show = (target: EventTarget | null) => {
    const cell =
      target instanceof Element
        ? target.closest<HTMLElement>('[data-cell]')
        : null;
    if (
      !cell?.dataset.error ||
      grid.querySelector('input') ||
      grid.classList.contains('picking-range') ||
      document.body.inert
    )
      return hide();
    hide();
    anchor = cell;
    const heading = document.createElement('strong');
    heading.textContent = `${cell.dataset.cell}: ${cell.textContent}`;
    const description = document.createElement('p');
    description.textContent = cell.dataset.error;
    popup.replaceChildren(heading, description);
    popup.hidden = false;
    cell.setAttribute('aria-describedby', popup.id);
    const rect = cell.getBoundingClientRect();
    popup.style.left =
      Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8)) +
      'px';
    popup.style.top =
      Math.max(
        8,
        Math.min(
          innerHeight - popup.offsetHeight - 8,
          rect.bottom + popup.offsetHeight + 8 < innerHeight
            ? rect.bottom + 4
            : rect.top - popup.offsetHeight - 4,
        ),
      ) + 'px';
  };
  const leave = () => {
    clearTimeout(timer);
    timer = window.setTimeout(hide, 120);
  };
  grid.addEventListener('pointerover', event => show(event.target));
  grid.addEventListener('pointerout', leave);
  grid.addEventListener('focusin', event => show(event.target));
  grid.addEventListener('focusout', hide);
  popup.addEventListener('pointerenter', () => clearTimeout(timer));
  popup.addEventListener('pointerleave', leave);
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('input', hide, true);
  document.addEventListener(
    'keydown',
    event => {
      if (event.key !== 'Escape' || popup.hidden) return;
      hide();
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  grid.parentElement!.addEventListener('scroll', hide);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
  return {hide};
}
