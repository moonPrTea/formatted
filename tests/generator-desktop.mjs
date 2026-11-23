import {app, BrowserWindow, ipcMain, nativeTheme} from 'electron';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setup} from '../build/electron/main.js';

const directory = mkdtempSync(path.join(os.tmpdir(), 'formatted-generator-'));
app.setPath('userData', directory);
app.setPath('sessionData', directory);

async function run() {
  await app.whenReady();
  await setup();
  let aiCalls = 0;
  ipcMain.removeHandler('ai-generate');
  ipcMain.handle('ai-generate', () => {
    aiCalls++;
    throw new Error('AI should not run for invalid parameters');
  });
  const window = new BrowserWindow({
    show: false,
    width: 1440,
    height: 960,
    webPreferences: {
      preload: path.resolve('build/electron/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
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
  await window.loadURL('forma://app/index.html');
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand(
    'Emulation.setFocusEmulationEnabled',
    {enabled: true},
  );
  await navigate('generator');
  assert.equal(
    await evaluate('document.querySelectorAll("[role=tab]").length'),
    5,
  );
  await evaluate(
    'document.querySelector("[name=seed]").value = "UNSAVED-DRAFT"',
  );
  await click('[data-select-name=difficulty]');
  await wait('document.activeElement?.getAttribute("role") === "option"');
  await click('[role=option][data-key=advanced]');
  await wait('!document.querySelector(".select-menu")');
  assert.equal(
    await evaluate(
      'new FormData(document.querySelector("#generator-form")).get("difficulty")',
    ),
    'advanced',
  );
  assert.equal(
    await evaluate('document.querySelector("[name=seed]").value'),
    'UNSAVED-DRAFT',
  );
  await click('[data-select-name=delimiter]');
  await wait('document.activeElement?.getAttribute("role") === "option"');
  for (const type of ['keyDown', 'keyUp'])
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type,
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
  await wait('!document.querySelector(".select-menu")');
  await click('[data-select-name=domain]');
  await wait('!!document.querySelector(".select-menu")');
  await navigate('home');
  await wait('!document.querySelector(".select-menu")');
  await navigate('generator');
  await evaluate(
    'document.querySelector("[name=seed]").value = "UNSAVED-DRAFT"',
  );
  await selectTab('ai');
  await evaluate(`(() => {
    const topic = document.querySelector('#ai-topic');
    topic.value = 'Учебная мастерская'; topic.dispatchEvent(new Event('input', {bubbles: true}));
  })()`);
  await selectTab('schema');
  await evaluate(`(async () => {
    const {normalizationModel} = await import('./core/normalization-model.js');
    const {generateDataset} = await import('./core/generator.js');
    const {toCsv} = await import('./core/csv.js');
    const tables = normalizationModel(generateDataset(JSON.parse(localStorage.getItem('forma.v1')).config));
    const transfer = new DataTransfer();
    const schema = tables.map(table => {
      const primaryKey = table.name === 'lines' ? ['order_id', 'line_no'] : table.name === 'bookAuthors' ? ['book_code', 'author_code'] : [table.fields[0]];
      transfer.items.add(new File([toCsv(table.fields, table.rows)], table.name + '.csv', {type: 'text/csv'}));
      return {entity: table.name, file: table.name + '.csv', primaryKey, columns: Object.fromEntries(table.fields.map(field => [field, field])), references: table.parents.map(name => ({table: name, columns: [table.name === 'cohorts' && name === 'users' ? 'teacher_code' : tables.find(parent => parent.name === name).fields[0]]}))};
    });
    transfer.items.add(new File([JSON.stringify(schema)], 'schema.json', {type: 'application/json'}));
    const input = document.querySelector('#normalization-form [name=files]');
    input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles: true}));
  })()`);
  for (const section of ['data', 'rules', 'variant', 'ai', 'schema'])
    await selectTab(section);
  assert.equal(
    await evaluate('document.querySelector("[name=seed]").value'),
    'UNSAVED-DRAFT',
  );
  assert.equal(
    await evaluate('document.querySelector("#ai-topic").value'),
    'Учебная мастерская',
  );
  assert.equal(
    await evaluate(
      'document.querySelector("#normalization-form [name=files]").files.length',
    ),
    13,
  );
  await evaluate(
    'document.querySelector("#normalization-form").requestSubmit()',
  );
  await wait(
    'document.querySelector(".normalization-result").textContent.includes("Проверено 12 таблиц")',
  );
  await selectTab('variant');
  await click('[data-action=show-ai]');
  await wait(
    'document.querySelector("[data-ui-value=ai]").getAttribute("aria-selected") === "true"',
  );
  await evaluate(
    'document.querySelector("[name=seed]").value = "!"; document.querySelector("#ai-form").requestSubmit()',
  );
  await wait(
    'document.querySelector("[data-ui-value=variant]").getAttribute("aria-selected") === "true"',
  );
  assert.equal(aiCalls, 0);
  await evaluate(
    'document.querySelector("[name=seed]").value = "UNSAVED-DRAFT"',
  );
  await evaluate('document.querySelector("[data-ui-value=variant]").focus()');
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
    'document.querySelector("[data-ui-value=data]").getAttribute("aria-selected") === "true"',
  );
  await click('[data-action=csv-next]');
  assert.equal(
    await evaluate('document.querySelector("[name=seed]").value'),
    'UNSAVED-DRAFT',
  );
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme;
    await wait(`document.documentElement.dataset.theme === '${theme}'`);
    for (const width of [1440, 900, 390]) {
      window.setContentSize(width, 960);
      await wait(`innerWidth === ${width}`);
      for (const section of ['variant', 'data', 'schema', 'rules', 'ai']) {
        await selectTab(section);
        assert.equal(
          await evaluate(`(() => {
          const main = document.querySelector('#main');
          const panel = document.querySelector('[role=tabpanel]:not([data-inert])');
          const field = document.querySelector('.number-control');
          const numberFits = '${section}' !== 'variant' || (() => {
            const bounds = field.getBoundingClientRect();
            return [...field.querySelectorAll('button')].every(button => {
              const rect = button.getBoundingClientRect();
              return rect.top >= bounds.top && rect.bottom <= bounds.bottom && rect.right <= bounds.right;
            });
          })();
          return document.documentElement.scrollWidth <= innerWidth && main.scrollWidth <= main.clientWidth && panel.scrollWidth <= panel.clientWidth && numberFits;
        })()`),
          true,
          `${theme}/${width}/${section}`,
        );
      }
    }
  }
  await selectTab('schema');
  assert.match(
    await evaluate(
      'document.querySelector(".normalization-result").textContent',
    ),
    /Проверено 12 таблиц/,
  );
  await navigate('practice');
  await evaluate('document.querySelector("#practice-form").requestSubmit()');
  await navigate('generator');
  assert.equal(
    await evaluate('document.querySelector("[data-ui-value=schema]")'),
    null,
  );
  assert.equal(
    await evaluate(
      'document.querySelector("#generator-form button[type=submit]").disabled',
    ),
    true,
  );
  assert.match(
    await evaluate(
      'document.querySelector(".screen-content > .notice").textContent',
    ),
    /Идёт попытка/,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Generator tabs, drafts, selected files, schema checks, keyboard, AI validation and responsive themes passed',
  );
  app.exit(0);
}
setTimeout(() => app.exit(1), 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
