export interface CsvTable {
  headers: string[];
  rows: Record<string, string>[];
}

export function readCsv(text: string, delimiter = ';'): CsvTable {
  if (![';', ','].includes(delimiter) || text.length > 2_000_000)
    throw new Error('CSV: неверный разделитель или файл больше 2 МБ');
  text = text.replace(/^\uFEFF/, '');
  const lines: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  const finish = () => {
    row.push(cell);
    lines.push(row);
    row = [];
    cell = '';
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
      closed = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finish();
    } else if (char === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || char === '"')
        throw new Error('CSV: неверное экранирование кавычек');
      cell += char;
    }
  }
  if (quoted) throw new Error('CSV: незакрытая кавычка');
  if (cell || row.length || closed) finish();
  const headers = lines.shift() ?? [];
  if (
    !headers.length ||
    headers.length > 80 ||
    headers.some(h => !h.trim()) ||
    new Set(headers).size !== headers.length
  )
    throw new Error('CSV: пустые или повторяющиеся заголовки');
  if (lines.length > 10_000 || lines.some(r => r.length !== headers.length))
    throw new Error('CSV: разное число столбцов или больше 10000 строк');
  return {
    headers,
    rows: lines.map(values =>
      Object.fromEntries(headers.map((h, i) => [h, values[i]])),
    ),
  };
}
