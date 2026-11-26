const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {setup} = require('../../build/electron/main.js');
const {openSheets} = require('../../build/sheets/electron/sheets.js');

async function run() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'formatted-formula-entry-'),
  );
  app.setPath('userData', directory);
  app.setPath('sessionData', directory);
  await app.whenReady();
  await setup();
  openSheets();
  const editor = BrowserWindow.getAllWindows()[0];
  const js = (window, code) => window.webContents.executeJavaScript(code);
  const wait = async check => {
    const until = Date.now() + 10000;
    while (!(await check())) {
      assert.ok(Date.now() < until, 'Formula entry timed out');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  const click = (window, selector) =>
    js(window, `document.querySelector(${JSON.stringify(selector)}).click()`);
  const key = async (window, keyCode) => {
    window.focus();
    await wait(() => Promise.resolve(window.isFocused()));
    window.webContents.sendInputEvent({type: 'keyDown', keyCode});
    window.webContents.sendInputEvent({type: 'keyUp', keyCode});
    await js(window, 'new Promise(resolve => requestAnimationFrame(resolve))');
  };
  const type = async text => {
    for (const char of text) await editor.webContents.insertText(char);
  };
  const value = cell =>
    js(editor, `document.querySelector('[data-cell="${cell}"]').textContent`);
  const args = wizard =>
    js(
      wizard,
      '[...document.querySelectorAll("[data-argument]")].map(input => input.value)',
    );
  const open = async () => {
    await click(editor, '#function-wizard');
    await wait(() =>
      Promise.resolve(BrowserWindow.getAllWindows().length === 2),
    );
    const wizard = BrowserWindow.getAllWindows().find(
      window => window !== editor,
    );
    await wait(() =>
      js(wizard, 'document.querySelector("main")?.inert === false'),
    );
    return wizard;
  };
  const close = async wizard => {
    await click(wizard, '#cancel');
    await wait(() => Promise.resolve(wizard.isDestroyed()));
    await wait(() => js(editor, '!document.body.inert'));
  };
  await wait(() => js(editor, '!!document.querySelector("[data-cell=H2]")'));

  // Actual input events, not programmatic changes to the formula field.
  await click(editor, '[data-cell=I2]');
  await key(editor, '=');
  await type('ИНДЕКС(Категории.A2:A4;2)');
  await key(editor, 'Enter');
  assert.equal(await value('I2'), '25');
  let wizard = await open();
  assert.deepEqual(await args(wizard), ["'Категории'.A2:A4", '2', '']);
  assert.equal(
    await js(
      wizard,
      'document.querySelector("#functions [aria-pressed=true]").dataset.function',
    ),
    'INDEX',
  );
  await close(wizard);

  // Editing an existing function name and accepting completion must not add ((.
  await js(
    editor,
    `(() => {const f = document.querySelector('#formula'); f.focus(); f.setSelectionRange(1, 7);})()`,
  );
  await type('ИНД');
  await key(editor, 'Tab');
  assert.equal(
    await js(editor, 'document.querySelector("#formula").value'),
    "=ИНДЕКС('Категории'.A2:A4;2)",
  );
  await key(editor, 'Enter');
  assert.equal(await value('I2'), '25');

  await click(editor, '[data-cell=I3]');
  await key(editor, '=');
  await type('ПОИСКПОЗ(C2;Категории.B2:B4;0');
  wizard = await open();
  assert.equal(
    await js(
      wizard,
      'document.querySelector("#functions [aria-pressed=true]").dataset.function',
    ),
    'MATCH',
  );
  assert.deepEqual(await args(wizard), ['C2', 'Категории.B2:B4', '0']);
  await fs.writeFile(
    path.join(directory, 'prefilled-draft.png'),
    (await wizard.webContents.capturePage()).toPNG(),
  );
  await close(wizard);
  assert.equal(
    await js(editor, 'document.querySelector("#formula").value'),
    '=ПОИСКПОЗ(C2;Категории.B2:B4;0',
  );
  wizard = await open();
  await js(
    wizard,
    `document.querySelector('[data-argument="2"]').dispatchEvent(new Event('input'))`,
  );
  assert.equal(
    await js(wizard, 'document.querySelector("#insert").disabled'),
    false,
  );
  await click(wizard, '#insert');
  await wait(() => Promise.resolve(wizard.isDestroyed()));
  await wait(() => js(editor, '!document.body.inert'));
  assert.equal(await value('I3'), '3');

  // English manual entry also opens the matching function, not the INDEX default.
  await click(editor, '[data-cell=I4]');
  await js(
    editor,
    `document.querySelector('#formula').focus(); document.querySelector('#formula').select()`,
  );
  await type('=MATCH(C2;Категории.B2:B4;0)');
  await key(editor, 'Enter');
  assert.equal(await value('I4'), '3');
  wizard = await open();
  assert.equal(
    await js(
      wizard,
      'document.querySelector("#functions [aria-pressed=true]").dataset.function',
    ),
    'MATCH',
  );
  assert.deepEqual(await args(wizard), ['C2', "'Категории'.B2:B4", '0']);
  await close(wizard);
  await click(editor, '[data-cell=I5]');
  await key(editor, '=');
  await type('SUM(A1:A3)');
  wizard = await open();
  assert.equal(
    await js(
      wizard,
      'document.querySelector("#functions [aria-pressed=true]").dataset.function',
    ),
    'SUM',
  );
  assert.equal(
    await js(wizard, 'document.querySelector("#expression").value'),
    '=SUM(A1:A3)',
  );
  assert.equal(
    await js(wizard, 'document.querySelector("#insert").disabled'),
    true,
  );
  await close(wizard);
  console.log(
    'Manual RU/EN entry, completion, committed formulas, drafts and wizard arguments passed:',
    directory,
  );
  app.exit(0);
}
setTimeout(() => app.exit(1), 120000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
