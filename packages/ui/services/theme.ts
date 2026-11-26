export type ThemePreference = 'light' | 'dark' | 'system';
declare global {
  interface Window {
    windowAppearance?: {setMode(mode: 'light' | 'dark'): void};
  }
}

const key = 'formatted.theme';
const system = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();
const valid = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(key);
    return valid(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

let preference = readPreference();
let paint = 0;

function apply() {
  const mode =
    preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
  const root = document.documentElement;
  window.windowAppearance?.setMode(mode);
  if (root.dataset.theme !== mode) {
    root.dataset.themeSwitching = '';
    root.dataset.theme = mode;
    root.classList.toggle('dark', mode === 'dark');
    root.classList.toggle('light', mode === 'light');
    cancelAnimationFrame(paint);
    paint = requestAnimationFrame(() => {
      paint = requestAnimationFrame(() => {
        delete root.dataset.themeSwitching;
      });
    });
  }
  for (const listener of listeners) listener();
}

export function getThemePreference() {
  return preference;
}

export function setThemePreference(value: ThemePreference) {
  preference = value;
  try {
    localStorage.setItem(key, value);
  } catch {
    document.dispatchEvent(new Event('theme-storage-error'));
  }
  apply();
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

window.addEventListener('storage', event => {
  if (event.key !== key && event.key !== null) return;
  preference = readPreference();
  apply();
});
system.addEventListener('change', () => {
  if (preference === 'system') apply();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  preference = readPreference();
  apply();
});
apply();
