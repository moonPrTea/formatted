import type {StudioApi, PackageReference, PackageResult} from './model.js';
import {icon} from './icons.js';
import {packageIconUrl} from './model.js';
import {enhanceSelects, closeSelectMenu} from '../selects.js';
export function mountPackages(
  api: StudioApi,
  get: () => PackageReference[],
  change: (packages: PackageReference[]) => Promise<void>,
) {
  const dialog = document.getElementById('packages') as HTMLDialogElement;
  const input = document.getElementById('package-query') as HTMLInputElement;
  const results = document.getElementById('package-results')!;
  const status = document.getElementById('package-status')!;
  const metadata = new Map<string, PackageResult>();
  let catalog: PackageResult[] = [];
  let loaded = false;
  let tab: 'search' | 'installed' = 'search',
    request = 0,
    working = false;
  const button = (text: string, action: () => void) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.onclick = action;
    return b;
  };
  const error = (e: unknown) => {
    status.textContent = e instanceof Error ? e.message : String(e);
  };
  function setWorking(value: boolean) {
    working = value;
    results
      .querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select')
      .forEach(control => {
        control.disabled = value;
      });
  }
  async function install(p: PackageReference) {
    if (working) return;
    setWorking(true);
    status.textContent = 'Установка…';
    try {
      await api.packages('install', p);
      await change([
        ...get().filter(item => item.id.toLowerCase() !== p.id.toLowerCase()),
        p,
      ]);
      status.textContent = `${p.id} ${p.version} установлен`;
      if (tab === 'installed') installed();
      else renderCatalog();
    } catch (e) {
      error(e);
    } finally {
      setWorking(false);
      if (tab === 'search') renderCatalog();
    }
  }
  function row(p: PackageReference, description: string) {
    const row = document.createElement('article');
    row.className = 'package-row';
    const mark = document.createElement('div');
    mark.className = 'package-mark';
    mark.append(icon('package'));
    mark.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    body.className = 'package-body';
    const heading = document.createElement('strong');
    heading.textContent = p.id;
    const meta = metadata.get(p.id.toLowerCase());
    const url = packageIconUrl(meta?.iconUrl);
    if (url) {
      const image = new Image();
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => mark.replaceChildren(image);
      image.src = url;
      // Leave the package glyph in place if offline or the icon is unavailable.
    }
    const subtitle = document.createElement('div');
    subtitle.className = 'package-meta';
    subtitle.textContent = [
      meta?.authors,
      p.version,
      meta?.downloads
        ? `${new Intl.NumberFormat('ru', {notation: 'compact'}).format(meta.downloads)} скачиваний`
        : '',
    ]
      .filter(Boolean)
      .join(' — ');
    const detail = document.createElement('p');
    detail.textContent = description || 'Описание отсутствует';
    const actions = document.createElement('div');
    actions.className = 'package-actions';
    body.append(heading, subtitle, detail, actions);
    row.append(mark, body);
    results.append(row);
    return actions;
  }
  function installed() {
    closeSelectMenu();
    results.replaceChildren();
    for (const p of get())
      row(
        p,
        metadata.get(p.id.toLowerCase())?.description ??
          'Добавлен в текущий проект',
      ).append(
        button('Переустановить', () => void install(p)),
        button('Удалить', () => {
          if (working) return;
          setWorking(true);
          void change(get().filter(item => item.id !== p.id))
            .then(installed)
            .catch(error)
            .finally(() => setWorking(false));
        }),
      );
    if (!get().length) results.textContent = 'В проекте пока нет пакетов';
  }
  async function search() {
    const current = ++request;
    status.textContent = 'Поиск на nuget.org…';
    results.setAttribute('aria-busy', 'true');
    try {
      const found = (await api.packages(
        'search',
        input.value.trim(),
      )) as PackageResult[];
      if (current !== request || tab !== 'search') return;
      catalog = found;
      loaded = true;
      for (const p of found) metadata.set(p.id.toLowerCase(), p);
      status.textContent = found.length ? '' : 'Пакеты не найдены';
      renderCatalog();
    } catch (e) {
      if (current === request && tab === 'search') error(e);
    } finally {
      if (current === request) results.setAttribute('aria-busy', 'false');
    }
  }
  function renderCatalog() {
    closeSelectMenu();
    results.replaceChildren();
    for (const p of catalog) {
      const versions = document.createElement('select');
      versions.setAttribute('aria-label', `Версия ${p.id}`);
      versions.disabled = working;
      for (const v of p.versions) versions.add(new Option(v, v));
      const existing = get().find(
        item => item.id.toLowerCase() === p.id.toLowerCase(),
      );
      const action = button(
        'Установить',
        () => void install({id: p.id, version: versions.value}),
      );
      const update = () => {
        const same = existing?.version === versions.value;
        action.textContent = same
          ? 'Установлен'
          : existing
            ? 'Сменить версию'
            : 'Установить';
        action.disabled = working || same;
      };
      versions.onchange = update;
      update();
      const versionLabel = document.createElement('label');
      versionLabel.className = 'package-version';
      versionLabel.append('Версия', versions);
      row(p, p.description).append(versionLabel, action);
    }
    enhanceSelects(results);
  }
  document.getElementById('packages-toggle')!.onclick = () => {
    dialog.showModal();
    if (tab === 'installed') installed();
    else {
      input.focus();
      if (!loaded) void search();
      else renderCatalog();
    }
  };
  const close = document.getElementById('packages-close')!;
  close.replaceChildren(icon('close'));
  close.onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    closeSelectMenu();
    request++;
    results.setAttribute('aria-busy', 'false');
  });
  document.getElementById('package-search')!.onclick = () => void search();
  input.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void search();
    }
  };
  for (const b of dialog.querySelectorAll<HTMLButtonElement>(
    '[data-package-tab]',
  ))
    b.onclick = () => {
      tab = b.dataset.packageTab as typeof tab;
      request++;
      status.textContent = '';
      for (const button of dialog.querySelectorAll('[data-package-tab]'))
        button.setAttribute('aria-pressed', String(button === b));
      document.getElementById('package-searchbar')!.hidden = tab !== 'search';
      results.replaceChildren();
      results.setAttribute('aria-busy', 'false');
      if (tab === 'installed') installed();
      else if (loaded) renderCatalog();
      else void search();
    };
}
