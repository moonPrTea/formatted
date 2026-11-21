import {app, BrowserWindow, ipcMain, nativeTheme} from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setup} from '../build/electron/main.js';

const directory = mkdtempSync(path.join(os.tmpdir(), 'formatted-lesson-'));
app.setPath('userData', directory);
app.setPath('sessionData', directory);

async function run() {
  await app.whenReady();
  await setup();
  const requests = [];
  ipcMain.removeHandler('calc-work');
  ipcMain.handle('calc-work', (_event, step, action) => {
    requests.push([step, action]);
    return {ready: true, passed: true, message: 'Проверка книги завершена'};
  });
  const window = new BrowserWindow({
    show: false,
    width: 1440,
    height: 960,
    webPreferences: {
      preload: path.resolve('build/electron/preload.cjs'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  window.webContents.setBackgroundThrottling(false);
  const errors = [];
  window.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });
  const evaluate = code => window.webContents.executeJavaScript(code);
  const wait = async code => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await evaluate(code)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Condition timed out: ${code}\n${errors.join('\n')}`);
  };
  const click = selector =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const navigate = view =>
    evaluate(
      `[...document.querySelectorAll('[data-view=${view}]')].find(button => button.checkVisibility()).click()`,
    );
  const selectTab = async value => {
    await click(`[role=tab][data-ui-value=${value}]`);
    await wait(
      `document.querySelector('[data-ui-value=${value}]').getAttribute('aria-selected') === 'true'`,
    );
  };
  const fits = () =>
    evaluate(`(() => {
      const main = document.querySelector('#main');
      const panel = document.querySelector('[role=tabpanel]:not([data-inert])');
      return document.documentElement.scrollWidth <= innerWidth &&
        main.scrollWidth <= main.clientWidth && panel.scrollWidth <= panel.clientWidth;
    })()`);
  await window.loadURL('forma://app/index.html');
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand(
    'Emulation.setFocusEmulationEnabled',
    {enabled: true},
  );
  await navigate('lesson');
  await wait('!!document.querySelector(".workspace-sections")');
  assert.equal(await evaluate('document.querySelector(".calc-launch")'), null);
  await selectTab('example');
  await evaluate("document.querySelector('[data-ui-value=example]').focus()");
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'ArrowRight',
    code: 'ArrowRight',
    windowsVirtualKeyCode: 39,
  });
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'ArrowRight',
    code: 'ArrowRight',
    windowsVirtualKeyCode: 39,
  });
  await wait(
    'document.querySelector("[data-ui-value=check]").getAttribute("aria-selected") === "true"',
  );
  await click('[data-action=lesson-step][data-step="4"]');
  await selectTab('check');
  await click('[data-action=lesson-answer][data-answer="0"]');
  await wait(
    'document.querySelector(".lesson-question").textContent.includes("Верно")',
  );
  await selectTab('task');
  await selectTab('check');
  assert.match(
    await evaluate('document.querySelector(".lesson-question").textContent'),
    /Верно/,
  );
  await navigate('workbook');
  await wait('!!document.querySelector("[name=workbook-step]")');
  assert.equal(
    await evaluate('document.querySelector("[name=workbook-step]").value'),
    '4',
  );
  await selectTab('work');
  await click('[data-action=calc-check-work]');
  await wait('document.querySelector(".calc-status").checkVisibility()');
  assert.match(
    await evaluate('document.querySelector(".calc-status").textContent'),
    /Проверка книги завершена/,
  );
  assert.deepEqual(requests, [[4, 'check']]);
  await evaluate(`(() => {
    const select = document.querySelector('[name=workbook-step]');
    select.value = '2'; select.dispatchEvent(new Event('change', {bubbles: true}));
  })()`);
  await navigate('lesson');
  assert.equal(
    await evaluate(
      'document.querySelector(".lesson-step.selected").dataset.step',
    ),
    '2',
  );
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme;
    await wait(`document.documentElement.dataset.theme === '${theme}'`);
    for (const width of [1440, 900, 390]) {
      window.setContentSize(width, 960);
      await wait(`innerWidth === ${width}`);
      for (let step = 0; step < 7; step++) {
        await click(`[data-action=lesson-step][data-step="${step}"]`);
        for (const section of ['task', 'example', 'check']) {
          await selectTab(section);
          assert.equal(
            await fits(),
            true,
            `Lesson ${theme}/${width}/${step}/${section}`,
          );
        }
      }
      await navigate('workbook');
      for (const section of ['editor', 'work', 'examples']) {
        await selectTab(section);
        assert.equal(
          await fits(),
          true,
          `Workbook ${theme}/${width}/${section}`,
        );
      }
      await fs.writeFile(
        path.join(directory, `${theme}-${width}.png`),
        (await window.webContents.capturePage()).toPNG(),
      );
      await navigate('lesson');
    }
  }
  await navigate('practice');
  await evaluate('document.querySelector("#practice-form").requestSubmit()');
  await navigate('workbook');
  assert.equal(
    await evaluate('document.querySelector("#main").dataset.screen'),
    'practice',
  );
  assert.deepEqual(errors, []);
  console.log(
    `Lesson tabs, workbook actions, keyboard, responsive themes and timed restrictions passed: ${directory}`,
  );
  app.exit(0);
}
setTimeout(() => app.exit(1), 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
