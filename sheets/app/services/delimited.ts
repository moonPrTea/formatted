export function readDelimited(source: string, delimiter: string): string[][] {
  if (![';', ',', '\t'].includes(delimiter) || source.length > 2_000_000)
    throw new Error('Invalid or oversized data');
  const text = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  let closed = false;
  const field = () => {
    row.push(value);
    value = '';
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += char;
    } else if (char === delimiter) field();
    else if (char === '\n') {
      field();
      rows.push(row);
      row = [];
    } else if (char === '"' && !value && !closed) quoted = true;
    else {
      if (closed || (char === '"' && delimiter !== '\t'))
        throw new Error('Invalid quoting');
      value += char;
    }
  }
  if (quoted) throw new Error('Unclosed quote');
  if (value || row.length || closed || !rows.length) {
    field();
    rows.push(row);
  }
  if (
    rows.some(r => r.length !== rows[0].length) ||
    rows.length * rows[0].length > 20_000
  )
    throw new Error('Invalid table dimensions');
  return rows;
}

export function writeDelimited(rows: unknown[][], delimiter: string) {
  return rows
    .map(row =>
      row
        .map(value => {
          const text = String(value ?? '');
          return text.includes(delimiter) || /["\r\n]/.test(text)
            ? `"${text.replaceAll('"', '""')}"`
            : text;
        })
        .join(delimiter),
    )
    .join('\r\n');
}
