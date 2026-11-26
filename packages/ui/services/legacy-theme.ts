import {accents, readAccent, accentTokens} from './accent.js';
type Theme = 'light' | 'dark' | 'system';
const accentKey = 'formatted.accent';
function accentPreference() {
  try {
    return readAccent(localStorage.getItem(accentKey));
  } catch {
    return 'default';
  }
}
let accent = accentPreference();
let appliedTokens: string[] = [];
const key = 'formatted.theme';
const valid = (value: unknown): value is Theme =>
  value === 'light' || value === 'dark' || value === 'system';
const system = matchMedia('(prefers-color-scheme: dark)');
export function themePreference(): Theme {
  try {
    const value = localStorage.getItem(key);
    return valid(value) ? value : 'light';
  } catch {
    return 'light';
  }
}
let preference = themePreference();
function apply() {
  document.documentElement.dataset.theme =
    preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
  for (const token of appliedTokens)
    document.documentElement.style.removeProperty(token);
  const tokens = accentTokens(
    accent,
    document.documentElement.dataset.theme === 'dark',
  );
  appliedTokens = Object.keys(tokens);
  for (const [token, value] of Object.entries(tokens))
    document.documentElement.style.setProperty(token, value);
  document
    .querySelectorAll<HTMLElement>('[data-accent-controls]')
    .forEach(element => {
      element.innerHTML = accentControls(
        element.dataset.accentControls === 'en',
      );
    });
  document
    .querySelectorAll<HTMLButtonElement>('[data-theme-choice]')
    .forEach(button =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.themeChoice === preference),
      ),
    );
}
function accentControls(english: boolean) {
  const selected = accents.find(item => item.id === accent);
  const custom = english ? 'Custom color' : 'Свой цвет';
  const name = selected ? selected[english ? 'en' : 'ru'] : custom;
  const color = selected?.color ?? accent;
  return `<div class="accent-row"><span>${english ? 'Accent color' : 'Акцентный цвет'}</span>
    <details class="accent-picker"><summary aria-label="${english ? 'Choose accent color' : 'Выбрать акцентный цвет'}"><i data-swatch="${selected?.id ?? 'custom'}" aria-hidden="true"></i>${name}<span aria-hidden="true">⌄</span></summary>
      <div class="accent-options" role="group" aria-label="${english ? 'Colors' : 'Цвета'}">
      ${accents.map(item => `<button type="button" data-accent-choice="${item.id}" aria-pressed="${accent === item.id}"><i data-swatch="${item.id}" aria-hidden="true"></i><span>${item[english ? 'en' : 'ru']}</span><span aria-hidden="true">${accent === item.id ? '✓' : ''}</span></button>`).join('')}
      <label>${custom}<input type="color" data-accent-custom aria-label="${custom}" value="${color}"></label>
      </div></details></div>`;
}
export function themeControls(english = false) {
  const names = english
    ? ['Light', 'Dark', 'System']
    : ['Светлая', 'Тёмная', 'Системная'];
  return `<div class="theme-choices" role="group" aria-label="${english ? 'Appearance' : 'Оформление'}">${(
    ['light', 'dark', 'system'] as const
  )
    .map(
      (mode, i) =>
        `<button type="button" data-theme-choice="${mode}" aria-pressed="${mode === preference}">${names[i]}</button>`,
    )
    .join(
      '',
    )}</div><div data-accent-controls="${english ? 'en' : 'ru'}">${accentControls(english)}</div>`;
}
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  document
    .querySelectorAll<HTMLDetailsElement>('.accent-picker[open]')
    .forEach(picker => {
      if (!picker.contains(event.target as Node)) picker.open = false;
    });
  const choice = event.target.closest<HTMLElement>('[data-accent-choice]');
  if (choice) {
    const parent = choice.closest<HTMLElement>('[data-accent-controls]');
    saveAccent(choice.dataset.accentChoice!);
    parent?.querySelector('summary')?.focus();
    return;
  }
  const mode = event.target.closest<HTMLElement>('[data-theme-choice]')?.dataset
    .themeChoice;
  if (!valid(mode)) return;
  preference = mode;
  try {
    localStorage.setItem(key, mode);
  } catch {
    // The current window still works when persistent storage is unavailable.
    document.dispatchEvent(new Event('theme-storage-error'));
  }
  apply();
});
function saveAccent(value: string) {
  accent = readAccent(value);
  try {
    localStorage.setItem(accentKey, accent);
  } catch {
    document.dispatchEvent(new Event('theme-storage-error'));
  }
  apply();
}
document.addEventListener('change', event => {
  if (
    event.target instanceof HTMLInputElement &&
    event.target.matches('[data-accent-custom]')
  ) {
    const parent = event.target.closest('[data-accent-controls]');
    saveAccent(event.target.value);
    parent?.querySelector('summary')?.focus();
  }
});
function positionAccents() {
  document
    .querySelectorAll<HTMLDetailsElement>('.accent-picker[open]')
    .forEach(picker => {
      const summary = picker.querySelector('summary')!.getBoundingClientRect();
      const popup = picker.querySelector<HTMLElement>('.accent-options')!;
      popup.style.maxHeight = `${Math.min(410, innerHeight - 24)}px`;
      const bounds = popup.getBoundingClientRect();
      popup.style.left = `${Math.max(12, Math.min(summary.right - bounds.width, innerWidth - bounds.width - 12))}px`;
      popup.style.top = `${Math.max(12, Math.min(summary.bottom + 6, innerHeight - bounds.height - 12))}px`;
    });
}
document.addEventListener(
  'toggle',
  event => {
    if (
      event.target instanceof Element &&
      event.target.matches('.accent-picker')
    )
      positionAccents();
  },
  true,
);
window.addEventListener('resize', positionAccents);
document.addEventListener('scroll', positionAccents, true);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  document
    .querySelectorAll<HTMLDetailsElement>('.accent-picker[open]')
    .forEach(picker => {
      picker.open = false;
      picker.querySelector('summary')?.focus();
      event.preventDefault();
    });
});
window.addEventListener('storage', event => {
  if (event.key !== key && event.key !== accentKey && event.key !== null)
    return;
  preference = themePreference();
  accent = accentPreference();
  apply();
});
system.addEventListener('change', apply);
apply();
