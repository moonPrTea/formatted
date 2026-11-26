export const accents = [
  {id: 'default', ru: 'По умолчанию', en: 'Default', color: '#808080'},
  {id: 'blue', ru: 'Синий', en: 'Blue', color: '#3875ee'},
  {id: 'green', ru: 'Зелёный', en: 'Green', color: '#00a889'},
  {id: 'yellow', ru: 'Жёлтый', en: 'Yellow', color: '#ffd43b'},
  {id: 'pink', ru: 'Розовый', en: 'Pink', color: '#ef6da8'},
  {id: 'orange', ru: 'Оранжевый', en: 'Orange', color: '#ff8266'},
  {id: 'purple', ru: 'Фиолетовый', en: 'Purple', color: '#a259ee'},
  {id: 'white', ru: 'Белый', en: 'White', color: '#ffffff'},
] as const;
export function readAccent(value: unknown): string {
  return typeof value === 'string' &&
    (accents.some(item => item.id === value) || /^#[\da-f]{6}$/i.test(value))
    ? value.toLowerCase()
    : 'default';
}
const rgb = (hex: string) =>
  [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export function contrast(a: string, b: string) {
  const luminance = (hex: string) =>
    rgb(hex)
      .map(n => {
        const c = n / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mix(a: string, b: string, amount: number) {
  const target = rgb(b);
  return (
    '#' +
    rgb(a)
      .map((c, i) =>
        Math.round(c + (target[i] - c) * amount)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
export function accentTokens(
  value: string,
  dark: boolean,
): Record<string, string> {
  value = readAccent(value);
  if (value === 'default') return {};
  const color = accents.find(item => item.id === value)?.color ?? value;
  const panel = dark ? '#202020' : '#ffffff';
  const ink = dark ? '#e9e9e9' : '#171a23';
  const soft = mix(panel, color, dark ? 0.18 : 0.12);
  let edge = color;
  for (let step = 1; step <= 20 && contrast(edge, panel) < 3; step++)
    edge = mix(color, ink, step / 20);
  let text = color;
  for (let step = 1; step <= 20 && contrast(text, soft) < 4.5; step++)
    text = mix(color, ink, step / 20);
  return {
    '--accent': color,
    '--on-accent':
      contrast(color, '#000000') > contrast(color, '#ffffff')
        ? '#000000'
        : '#ffffff',
    '--accent-strong': text,
    '--accent-soft': soft,
    '--accent-hover': mix(color, ink, 0.08),
    '--ui-focus': edge,
    '--ui-selection': soft,
    '--ui-selection-edge': edge,
    '--cell-selection': soft,
    '--cell-selection-edge': edge,
  };
}
