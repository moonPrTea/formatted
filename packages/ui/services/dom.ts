export function query<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Что-то пошло не так';
}

/** Escapes a value for HTML text or a quoted attribute; does not sanitize URLs. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    character =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[
        character
      ] ?? character,
  );
}

export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  return strings.reduce(
    (result, part, index) =>
      result + part + (index < values.length ? String(values[index]) : ''),
    '',
  );
}
