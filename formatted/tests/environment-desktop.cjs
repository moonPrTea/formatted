const {app, BrowserWindow, ipcMain} = require('electron');
const assert = require('node:assert/strict');
const {existsSync} = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const main = path.resolve('build/formatted/electron/main.js');
const {setup, createWindow} = require(
  existsSync(main) ? main : main.replace(/\.cjs$/, '.js'),
);

async function run() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'formatted-environment-'),
  );
  app.setPath('userData', directory);
  app.setPath('sessionData', directory);
  await app.whenReady();
  await setup();
  const requests = [];
  ipcMain.removeHandler('setup-page');
  ipcMain.handle('setup-page', (_event, tool) => requests.push(tool));
  for (const name of ['calc-status', 'ai-status']) {
    ipcMain.removeHandler(name);
    ipcMain.handle(name, () => ({message: `${name}: проверено`}));
  }
  const window = createWindow();
  window.setMinimumSize(360, 400);
  window.webContents.setBackgroundThrottling(false);
  const errors = [];
  window.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });
  const js = source => window.webContents.executeJavaScript(source);
  const frame = () =>
    js(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
  const wait = async condition => {
    const deadline = Date.now() + 10000;
    while (!(await condition())) {
      assert.ok(Date.now() < deadline, 'Environment UI did not become ready');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  await new Promise(resolve =>
    window.webContents.once('did-finish-load', resolve),
  );
  await wait(() => js('!!document.querySelector("h1")'));
  if (!(await js('!!document.querySelector(".environment-panel")'))) {
    await js(
      'document.querySelector(".window-status [aria-label=Настройки]").click()',
    );
    await wait(() => js('!!document.querySelector(".environment-panel")'));
  }
  const capture = async name => {
    await frame();
    await fs.writeFile(
      path.join(directory, `${name}.png`),
      (await window.webContents.capturePage()).toPNG(),
    );
  };
  assert.deepEqual(
    await js(
      '[...document.querySelectorAll(".environment-tools strong")].map(element => element.textContent)',
    ),
    ['LibreOffice', 'Python 3.9+', 'Ollama'],
  );
  assert.equal(
    await js('document.querySelector(".environment-status").checkVisibility()'),
    false,
  );
  for (const theme of ['light', 'dark']) {
    await js(
      `document.documentElement.dataset.theme = '${theme}'; document.documentElement.classList.toggle('dark', '${theme}' === 'dark');`,
    );
    for (const width of [1440, 900, 390]) {
      window.setContentSize(width, 900);
      await frame();
      assert.equal(await js('innerWidth'), width);
      assert.equal(
        await js(`(() => {
        const panel = document.querySelector('.environment-panel');
        const rows = [...panel.querySelectorAll('.environment-tools > div')];
        const buttons = rows.map(row => row.querySelector('button').getBoundingClientRect());
        return panel.scrollWidth <= panel.clientWidth && rows.every((row, index) => {
          const rect = row.getBoundingClientRect();
          const button = buttons[index];
          const description = row.querySelector('span').getBoundingClientRect();
          return button.left >= rect.left && button.right <= rect.right + 1 &&
            (!index || rect.top >= rows[index - 1].getBoundingClientRect().bottom) &&
            (${width} > 640 ? Math.abs(button.right - buttons[0].right) < 1 : button.top >= description.bottom && Math.abs(button.width - rect.width) < 1);
        });
      })()`),
        true,
        `Environment rows fit and align at ${width}px in ${theme}`,
      );
      await js(
        'document.querySelector(".environment-panel").scrollIntoView({block:"center"})',
      );
      await capture(`${theme}-${width}`);
    }
  }
  for (const tool of ['calc', 'python', 'ollama']) {
    await js(
      `document.querySelector('[data-action=setup-page][data-tool=${tool}]').click()`,
    );
    await wait(() => Promise.resolve(requests.includes(tool)));
  }
  assert.deepEqual(requests, ['calc', 'python', 'ollama']);
  await js('document.querySelector("[data-action=check-environment]").click()');
  await wait(() =>
    js('!document.querySelector("[data-action=check-environment]").disabled'),
  );
  const status = await js(
    'document.querySelector(".environment-status").textContent',
  );
  assert.match(status, /calc-status: проверено/);
  assert.match(status, /ai-status: проверено/);
  assert.equal(
    await js('document.querySelector(".environment-status").checkVisibility()'),
    true,
  );
  assert.equal(
    await js(
      'getComputedStyle(document.querySelector(".environment-status")).whiteSpace',
    ),
    'pre-line',
  );
  const browser = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await browser.loadURL('forma://app/index.html');
  await wait(() =>
    browser.webContents.executeJavaScript('!!document.querySelector("h1")'),
  );
  const browserJs = source => browser.webContents.executeJavaScript(source);
  if (!(await browserJs('!!document.querySelector(".environment-panel")'))) {
    await browserJs(
      'document.querySelector(".window-status [aria-label=Настройки]").click()',
    );
    await wait(() =>
      browserJs('!!document.querySelector(".environment-panel")'),
    );
  }
  assert.equal(
    await browserJs('document.querySelector(".environment-tools")'),
    null,
  );
  assert.match(
    await browserJs('document.querySelector(".environment-panel").textContent'),
    /Запусти desktop-приложение/,
  );
  assert.deepEqual(errors, []);
  console.log(
    `Environment rows, download actions, diagnostics and browser fallback passed: ${directory}`,
  );
  app.exit(0);
}

setTimeout(() => app.exit(1), 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
