import {app, BrowserWindow} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setup} from '../build/electron/main.js';

async function run() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'formatted-appearance-'),
  );
  app.setPath('userData', path.join(directory, 'profile'));
  app.setPath('sessionData', path.join(directory, 'profile'));
  await app.whenReady();
  await setup();
  const errors = [];
  const create = () => {
    const window = new BrowserWindow({
      show: false,
      width: 1440,
      height: 960,
      webPreferences: {
        preload: path.resolve('build/electron/preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    window.webContents.setBackgroundThrottling(false);
    window.webContents.on('console-message', event => {
      if (event.level === 'error') errors.push(event.message);
    });
    return window;
  };
  const window = create();
  const js = code => window.webContents.executeJavaScript(code);
  const frame = () =>
    js(
      'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
    );
  const wait = async (contents, condition) => {
    const deadline = Date.now() + 5000;
    while (!(await contents.executeJavaScript(condition))) {
      assert.ok(Date.now() < deadline, condition);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  const click = async selector => {
    await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await frame();
  };
  const capture = async (target, name) => {
    await fs.writeFile(
      path.join(directory, `${name}.png`),
      (await target.webContents.capturePage()).toPNG(),
    );
  };
  const brightSurfaces = `(() => {
    const context = document.createElement('canvas').getContext('2d', {willReadFrequently:true});
    return [...document.querySelectorAll('body *')].filter(element => {
      if (!element.checkVisibility() || element.closest('svg')) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return false;
      context.clearRect(0,0,1,1);
      context.fillStyle = getComputedStyle(element).backgroundColor;
      context.fillRect(0,0,1,1);
      const [r,g,b,a] = context.getImageData(0,0,1,1).data;
      return a > 230 && Math.min(r,g,b) > 220;
    }).map(element => element.tagName + '#' + element.id + '.' + String(element.className).slice(0,80));
  })()`;
  await window.loadURL('forma://app/index.html');
  window.webContents.debugger.attach('1.3');
  const systemTheme = value =>
    window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{name: 'prefers-color-scheme', value}],
    });
  await systemTheme('dark');
  await wait(
    window.webContents,
    'document.documentElement.dataset.theme === "dark"',
  );
  assert.equal(
    await js('document.querySelector("#toast").checkVisibility()'),
    false,
  );
  await frame();
  assert.equal(window.getBackgroundColor().toLowerCase(), '#09090b');
  assert.notEqual(
    await js('getComputedStyle(document.documentElement).backgroundColor'),
    'rgba(0, 0, 0, 0)',
  );
  for (const view of [
    'home',
    'generator',
    'database',
    'lesson',
    'workbook',
    'quiz',
    'practice',
    'history',
  ]) {
    await click(`.sidebar [data-view="${view}"]`);
    assert.deepEqual(
      await js(brightSurfaces),
      [],
      `${view}: bright surfaces in dark theme`,
    );
    if (view === 'generator') {
      await click('[data-ui-value=variant]');
      await js('document.querySelector("[name=seed]").focus()');
      assert.deepEqual(
        await js(brightSurfaces),
        [],
        'Focused input stays dark',
      );
      await click('[data-select-name=domain]');
      assert.deepEqual(
        await js(brightSurfaces),
        [],
        'Open dropdown stays dark',
      );
      await js(
        'document.querySelector("h1").dispatchEvent(new PointerEvent("pointerdown", {bubbles:true}))',
      );
    }
  }
  await click('.sidebar [data-view=database]');
  await capture(window, 'sql-dark');
  assert.equal(
    await js(`(() => {
    const card = document.querySelector('.sql-editor');
    const header = card.querySelector('.card__header').getBoundingClientRect();
    const content = card.querySelector('.card__content').getBoundingClientRect();
    const footer = card.querySelector('.card__footer').getBoundingClientRect();
    return Math.abs(header.left-content.left) < 1 && Math.abs(content.left-footer.left) < 1 &&
      parseFloat(getComputedStyle(card).paddingLeft) === 24 &&
      parseFloat(getComputedStyle(card).gap) <= 24;
  })()`),
    true,
  );
  await click('[data-workspace=database] [data-ui-value=query]');
  await js(`window.appearanceDraft = document.querySelector('#database-sql');
    appearanceDraft.value = 'SELECT 123;';
    appearanceDraft.dispatchEvent(new Event('input', {bubbles:true}));`);
  await systemTheme('light');
  await wait(
    window.webContents,
    'document.documentElement.dataset.theme === "light"',
  );
  assert.equal(
    await js('document.querySelector("#database-sql") === appearanceDraft'),
    true,
  );
  assert.equal(await js('appearanceDraft.value'), 'SELECT 123;');
  assert.equal(await js('localStorage.getItem("formatted.theme")'), null);
  await systemTheme('dark');
  await wait(
    window.webContents,
    'document.documentElement.dataset.theme === "dark"',
  );
  await click('.window-status [aria-label="Настройки"]');
  await click('[data-theme-choice=light]');
  assert.equal(await js('document.documentElement.dataset.theme'), 'light');
  await frame();
  assert.equal(window.getBackgroundColor().toLowerCase(), '#fafafa');
  assert.equal(
    await js('document.documentElement.classList.contains("dark")'),
    false,
  );
  assert.equal(
    await js('document.querySelector("#database-sql") === appearanceDraft'),
    true,
  );
  assert.equal(await js('appearanceDraft.value'), 'SELECT 123;');
  await capture(window, 'settings-light');
  await click('.modal__close-trigger');
  await wait(window.webContents, '!document.querySelector(".modal__dialog")');
  await frame();
  await capture(window, 'sql-light');

  const sheets = create();
  await sheets.loadURL('forma://app/sheets/index.html');
  await wait(sheets.webContents, '!!document.querySelector("[data-cell=H2]")');
  assert.equal(
    await sheets.webContents.executeJavaScript(
      'document.documentElement.dataset.theme',
    ),
    'light',
  );
  await click('.window-status [aria-label="Настройки"]');
  await click('[data-theme-choice=dark]');
  await wait(
    sheets.webContents,
    'document.documentElement.dataset.theme === "dark"',
  );
  await frame();
  assert.equal(sheets.getBackgroundColor().toLowerCase(), '#09090b');
  assert.deepEqual(
    await sheets.webContents.executeJavaScript(brightSurfaces),
    [],
  );
  await capture(sheets, 'tables-dark');
  await click('[data-theme-choice=light]');
  await wait(
    sheets.webContents,
    'document.documentElement.dataset.theme === "light"',
  );
  await click('.modal__close-trigger');
  const readyTheme = new Promise(resolve =>
    window.webContents.once('dom-ready', async () => {
      resolve(
        await js(
          '[document.documentElement.dataset.theme, document.documentElement.classList.contains("light")]',
        ),
      );
    }),
  );
  await window.reload();
  assert.deepEqual(await readyTheme, ['light', true]);
  await wait(window.webContents, '!!document.querySelector("#database-sql")');
  assert.equal(
    await js('document.querySelector("#database-sql").value'),
    'SELECT 123;',
  );
  await click('.window-status [aria-label="Настройки"]');
  await click('[data-theme-choice=dark]');
  await click('.modal__close-trigger');
  await capture(window, 'sql-editor-dark');
  assert.deepEqual(errors, []);
  console.log(
    `Theme synchronization, persisted startup, SQL spacing, no white surfaces and no empty notification passed: ${directory}`,
  );
  app.exit(0);
}
setTimeout(() => app.exit(1), 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
