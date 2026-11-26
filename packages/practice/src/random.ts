import type {Random} from '../../contracts/practice.js';
export function random(seed: string | number) {
  let value = 2166136261;
  for (const char of String(seed))
    value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => {
    value += 0x6d2b79f5;
    let n = Math.imul(value ^ (value >>> 15), 1 | value);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rng: Random, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)];
export const integer = (rng: Random, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));
export function shuffle<T>(rng: Random, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
