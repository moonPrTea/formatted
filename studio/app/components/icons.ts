const paths = {
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  save: '<path d="M6 3.5h10l4.5 4.5v10.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z"/><path d="M8 3.5V9h8V3.5M8 20.5V14h8v6.5"/>',
  export:
    '<path d="M12 15V3.5m-4 4 4-4 4 4M4.5 13v5.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13"/>',
  restart: '<path d="M4.5 9a8 8 0 1 1 .5 7M4.5 4v5h5"/>',
  code: '<path d="M14 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9.5Zm0 0v6h6M8 13h8M8 17h6"/>',
  designer:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M9 9v10.5"/>',
  terminal:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="m7 9 3 3-3 3m6 0h4"/>',
  package:
    '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M3.5 7 6 3.5h12L20.5 7M4 7h16M9 11h6"/>',
  text: '<path d="M5 7V4.5h14V7M12 4.5v15M8.5 19.5h7"/>',
  input:
    '<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M7.5 9v6m-1.5-6h3m-3 6h3m3-3h5"/>',
  button:
    '<rect x="3.5" y="6" width="17" height="12" rx="3"/><path d="M8 12h8"/>',
  radio:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  combo:
    '<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M7 12h4m3-1 2 2 2-2"/>',
  list: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M10 8h6m-6 4h6m-6 4h6M7 8h.01M7 12h.01M7 16h.01"/>',
  panel:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9 4.5v15"/>',
  group:
    '<path d="M8 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M10 5h3"/><rect x="7.5" y="10" width="9" height="6.5" rx="1"/>',
  progress:
    '<rect x="3.5" y="8" width="17" height="8" rx="2"/><path d="M7 11v2m3-2v2m3-2v2"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9h17M9 9v11.5M15 9v11.5M3.5 15h17"/>',
  check:
    '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.5 2.5L16 9"/>',
  image:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m4 17 5-5 3 3 3.5-4 5 5"/>',
  run: '<path d="M7 5.5a1 1 0 0 1 1.5-.86l10 6.5a1 1 0 0 1 0 1.72l-10 6.5A1 1 0 0 1 7 18.5Z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  project:
    '<path d="M3.5 7V6a2 2 0 0 1 2-2h4l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
  controls:
    '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="2"/><path d="M14 17.5h7m-3.5-3.5v7"/>',
  properties:
    '<path d="M4 7h3m5 0h8M4 17h8m5 0h3"/><circle cx="9.5" cy="7" r="2.5"/><circle cx="14.5" cy="17" r="2.5"/>',
  problems: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5M12 16h.01"/>',
  theme: '<path d="M20 13.5A8.5 8.5 0 0 1 10.5 4a8.5 8.5 0 1 0 9.5 9.5Z"/>',
  close: '<path d="m7 7 10 10M7 17 17 7"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  form: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9h17M7 6.75h.01M10 6.75h.01M7 13h5M7 16h9"/>',
  file: '<path d="M14 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9.5Zm0 0v6h6M8 13h8m-8 4h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minimize: '<path d="M5 12h14"/>',
  maximize: '<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>',
} as const;
export function icon(name: keyof typeof paths): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'studio-icon');
  svg.dataset.symbol = name;
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  // Static, application-owned SVG paths only; no project data enters markup.
  svg.innerHTML = paths[name];
  return svg;
}
export function mountIcons() {
  document.querySelectorAll<HTMLElement>('[data-icon]').forEach(element => {
    const name = element.dataset.icon as keyof typeof paths;
    if (Object.hasOwn(paths, name)) element.replaceChildren(icon(name));
    if (element.hasAttribute('aria-label'))
      element.title = element.getAttribute('aria-label')!;
  });
}
