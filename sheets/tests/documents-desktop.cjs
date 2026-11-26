const {app, BrowserWindow, Menu, dialog} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {setup} = require('../../build/formatted/electron/main.js');
const {openSheets} = require('../../build/sheets/electron/sheets.js');

async function run() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'formatted-documents-'),
  );
  app.setPath('userData', directory);
  app.setPath('sessionData', directory);
  await app.whenReady();
  await setup();
  const errors = [];
  app.on('web-contents-created', (_event, contents) => {
    contents.on('console-message', event => {
      if (event.level === 'error') errors.push(event.message);
    });
  });
  const evaluate = (window, code) => window.webContents.executeJavaScript(code);
  const wait = async condition => {
    const deadline = Date.now() + 5000;
    while (!(await condition())) {
      assert.ok(Date.now() < deadline, 'Condition timed out');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  const click = (window, selector) =>
    evaluate(
      window,
      `document.querySelector(${JSON.stringify(selector)}).click()`,
    );
  const input = (window, value) =>
    evaluate(
      window,
      `(() => {
    const field = document.querySelector('#formula');
    field.value = ${JSON.stringify(value)};
    field.dispatchEvent(new Event('input', {bubbles:true}));
  })()`,
    );
  const keys = (window, modifier) => {
    window.focus();
    window.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: 'n',
      modifiers: [modifier],
    });
    window.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode: 'n',
      modifiers: [modifier],
    });
  };
  openSheets();
  const original = BrowserWindow.getAllWindows()[0];
  await wait(() =>
    evaluate(original, '!!document.querySelector("[data-cell=H2]")'),
  );
  let menu;
  let popupWindow;
  const build = Menu.buildFromTemplate;
  Menu.buildFromTemplate = function (template) {
    menu = build.call(Menu, template);
    menu.popup = options => {
      popupWindow = options.window;
    };
    return menu;
  };
  original.focus();
  const point = await evaluate(
    original,
    `(() => {
    const rect = document.querySelector('[data-sheet="Практика"]').getBoundingClientRect();
    return {x:Math.round(rect.x + rect.width / 2), y:Math.round(rect.y + rect.height / 2)};
  })()`,
  );
  original.webContents.sendInputEvent({
    type: 'mouseDown',
    ...point,
    button: 'right',
    clickCount: 1,
  });
  original.webContents.sendInputEvent({
    type: 'mouseUp',
    ...point,
    button: 'right',
    clickCount: 1,
  });
  await wait(() => !!menu);
  assert.equal(popupWindow, original);
  assert.equal(menu.items[0].label, 'Создать новый лист');
  await input(original, '=7+8');
  menu.items[0].click();
  await wait(() =>
    evaluate(
      original,
      'document.querySelectorAll("[data-sheet]").length === 4',
    ),
  );
  assert.equal(
    await evaluate(
      original,
      'document.querySelector("#selection").textContent',
    ),
    'Лист1, A1',
  );
  assert.equal(
    await evaluate(
      original,
      'document.querySelector("[data-cell=A1]").textContent',
    ),
    '',
  );
  await click(original, '[data-sheet="Практика"]');
  assert.equal(
    await evaluate(
      original,
      'document.querySelector("[data-cell=H2]").textContent',
    ),
    '15',
  );
  console.log(
    '1. Right-click opens the native sheet menu; creation preserves and commits the previous draft',
  );
  await input(original, '=99');
  keys(original, 'meta');
  await wait(() => BrowserWindow.getAllWindows().length === 2);
  const fresh = BrowserWindow.getAllWindows().find(
    window => window !== original,
  );
  await wait(() =>
    evaluate(fresh, '!!document.querySelector("[data-cell=A1]")'),
  );
  assert.deepEqual(
    await evaluate(
      fresh,
      '[...document.querySelectorAll("[data-sheet]")].map(e=>e.textContent)',
    ),
    ['Лист1'],
  );
  assert.equal(
    await evaluate(fresh, 'document.querySelector("#selection").textContent'),
    'Лист1, A1',
  );
  assert.equal(
    await evaluate(
      fresh,
      'document.querySelector("[data-cell=H2]").textContent',
    ),
    '',
  );
  assert.equal(
    await evaluate(original, 'document.querySelector("#formula").value'),
    '=99',
  );
  assert.equal(
    await evaluate(
      original,
      'document.querySelector("[data-cell=H2]").textContent',
    ),
    '15',
  );
  await click(fresh, '[data-language="en"]');
  keys(fresh, 'control');
  await wait(() => BrowserWindow.getAllWindows().length === 3);
  const third = BrowserWindow.getAllWindows().find(
    window => window !== original && window !== fresh,
  );
  await wait(() =>
    evaluate(third, '!!document.querySelector("[data-cell=A1]")'),
  );
  assert.equal(await evaluate(third, 'document.documentElement.lang'), 'en');
  assert.equal(
    await evaluate(third, 'document.querySelector("#title").textContent'),
    'Untitled 2',
  );
  assert.equal(
    await evaluate(third, 'document.querySelector("[data-sheet]").textContent'),
    'Sheet1',
  );
  console.log(
    '2. Cmd+N and Ctrl+N create independent blank documents and inherit the language',
  );
  await evaluate(
    third,
    `document.querySelector('[data-sheet]').dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, cancelable:true}))`,
  );
  await wait(() => menu.items[0].label === 'New sheet');
  menu.items[0].click();
  await wait(() =>
    evaluate(third, 'document.querySelectorAll("[data-sheet]").length === 2'),
  );
  assert.equal(
    await evaluate(third, 'document.querySelector("#selection").textContent'),
    'Sheet2, A1',
  );
  await input(third, '=2+3');
  await click(third, '#formula-bar button[type=submit]');
  await click(third, '#function-wizard');
  await wait(() => BrowserWindow.getAllWindows().length === 4);
  const wizard = BrowserWindow.getAllWindows().find(
    window => window.getParentWindow() === third,
  );
  await wait(() => evaluate(wizard, '!!document.querySelector("[data-pick]")'));
  keys(wizard, 'meta');
  await wait(() => BrowserWindow.getAllWindows().length === 5);
  const extra = BrowserWindow.getAllWindows().find(
    window => ![original, fresh, third, wizard].includes(window),
  );
  await wait(() =>
    evaluate(extra, '!!document.querySelector("[data-cell=A1]")'),
  );
  extra.close();
  await wait(() => extra.isDestroyed());
  assert.equal(wizard.isDestroyed(), false);
  await click(wizard, '[data-pick="0"]');
  await wait(() => wizard.getBounds().height < 200);
  await click(wizard, '#cancel-range');
  await wait(() => wizard.getBounds().height >= 400);
  await click(wizard, '#cancel');
  await wait(() => wizard.isDestroyed());
  assert.equal(
    await evaluate(
      third,
      'document.querySelector("[data-cell=A1]").textContent',
    ),
    '5',
  );
  console.log('3. Sheet menus and range selection work in a second document');
  third.setContentSize(640, 480);
  await evaluate(
    third,
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
  );
  assert.equal(
    await evaluate(third, 'document.documentElement.scrollWidth <= innerWidth'),
    true,
  );
  await fs.writeFile(
    path.join(directory, 'new-document.png'),
    (await third.webContents.capturePage()).toPNG(),
  );
  let confirmations = 0;
  const sheetMenu = async (window, name, action) => {
    menu = null;
    await evaluate(
      window,
      `document.querySelectorAll('[data-sheet]').forEach(tab => {
      if (tab.dataset.sheet === ${JSON.stringify(name)}) tab.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true}));
    })`,
    );
    await wait(() => !!menu);
    if (action !== undefined) {
      menu.items[action].click();
      await wait(() =>
        evaluate(window, 'document.querySelector("#sheet-dialog").open'),
      );
    }
  };
  const rename = async (window, value) => {
    await evaluate(
      window,
      `document.querySelector('#sheet-name').value = ${JSON.stringify(value)}`,
    );
    await click(window, '#sheet-dialog-apply');
  };
  await sheetMenu(original, 'Категории', 1);
  original.focus();
  original.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Escape'});
  original.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Escape'});
  await wait(() =>
    evaluate(original, '!document.querySelector("#sheet-dialog").open'),
  );
  assert.equal(
    await evaluate(original, 'document.querySelector("#formula").value'),
    '=99',
  );
  await sheetMenu(original, 'Категории', 1);
  await rename(original, 'Практика');
  assert.ok(
    await evaluate(
      original,
      'document.querySelector("#sheet-dialog-error").textContent',
    ),
  );
  await rename(original, '   ');
  assert.equal(
    await evaluate(original, 'document.querySelector("#sheet-dialog").open'),
    true,
  );
  await fs.writeFile(
    path.join(directory, 'rename-error.png'),
    (await original.webContents.capturePage()).toPNG(),
  );
  const value = await evaluate(
    original,
    'document.querySelector("[data-cell=H3]").textContent',
  );
  await rename(original, "Справочник 'категорий'");
  assert.equal(
    await evaluate(
      original,
      'document.querySelector("[data-cell=H3]").textContent',
    ),
    value,
  );
  assert.equal(
    await evaluate(
      original,
      'document.querySelector("#selection").textContent',
    ),
    'Практика, H2',
  );
  await sheetMenu(original, "Справочник 'категорий'", 3);
  assert.equal(
    await evaluate(original, 'document.activeElement.id'),
    'sheet-dialog-cancel',
  );
  await click(original, '#sheet-dialog-cancel');
  assert.equal(
    await evaluate(
      original,
      'document.querySelectorAll("[data-sheet]").length',
    ),
    4,
  );
  await sheetMenu(original, "Справочник 'категорий'", 3);
  await click(original, '#sheet-dialog-apply');
  assert.equal(
    await evaluate(
      original,
      'document.querySelector("[data-cell=H3]").textContent',
    ),
    '#REF!',
  );
  console.log(
    '4. Rename updates references, invalid names are blocked, Escape preserves drafts and deletion requires confirmation',
  );
  await sheetMenu(third, 'Sheet2', 1);
  assert.equal(
    await evaluate(
      third,
      'document.querySelector("#sheet-dialog-title").textContent',
    ),
    'Rename sheet',
  );
  await rename(third, 'Notes');
  assert.equal(
    await evaluate(third, 'document.querySelector("#selection").textContent'),
    'Notes, A1',
  );
  await sheetMenu(third, 'Notes', 3);
  await fs.writeFile(
    path.join(directory, 'delete-narrow.png'),
    (await third.webContents.capturePage()).toPNG(),
  );
  assert.equal(
    await evaluate(
      third,
      'document.documentElement.scrollWidth <= innerWidth && document.querySelector("#sheet-dialog").scrollWidth <= document.querySelector("#sheet-dialog").clientWidth',
    ),
    true,
  );
  await click(third, '#sheet-dialog-apply');
  assert.equal(
    await evaluate(third, 'document.querySelector("#selection").textContent'),
    'Sheet1, A1',
  );
  await sheetMenu(third, 'Sheet1');
  assert.equal(menu.items[3].enabled, false);
  menu.items[3].click();
  await evaluate(third, 'new Promise(resolve => setTimeout(resolve, 50))');
  assert.equal(
    await evaluate(third, 'document.querySelector("#sheet-dialog").open'),
    false,
  );
  assert.equal(
    await evaluate(third, 'document.querySelectorAll("[data-sheet]").length'),
    1,
  );
  console.log(
    '5. Active-sheet deletion selects a survivor, last-sheet deletion is disabled and guarded in the renderer',
  );
  let confirmation;
  const recoveryDirectory = path.join(directory, 'sheet-recovery');
  await fs.rename(recoveryDirectory, recoveryDirectory + '-backup');
  await fs.writeFile(
    recoveryDirectory,
    'Simulated unavailable recovery directory',
  );
  dialog.showMessageBoxSync = (window, options) => {
    confirmations++;
    confirmation = {window, options};
    return 0;
  };
  for (const [window, language, change] of [
    [third, 'en', false],
    [original, 'ru', false],
    [third, 'ru', true],
    [third, 'en', true],
  ]) {
    if (change) await click(window, `[data-language="${language}"]`);
    const count = confirmations;
    window.close();
    await wait(() => confirmations === count + 1);
    assert.equal(window.isDestroyed(), false);
    assert.equal(confirmation.window, window);
    assert.deepEqual(
      confirmation.options.buttons,
      language === 'ru' ? ['Остаться', 'Закрыть'] : ['Stay', 'Close'],
    );
    assert.equal(
      confirmation.options.message,
      language === 'ru' ? 'Изменения не сохранены' : 'Unsaved changes',
    );
    assert.equal(
      confirmation.options.detail,
      language === 'ru'
        ? 'Не удалось записать копию восстановления. Не закрывай окно: сохрани книгу в файл'
        : 'Recovery could not be written. Keep this window open and save the workbook to a file',
    );
    assert.equal(confirmation.options.cancelId, 0);
  }
  await evaluate(third, 'window.sheetDesktop.setLanguage("invalid")');
  third.close();
  await wait(() => confirmations === 5);
  assert.equal(confirmation.options.message, 'Unsaved changes');
  dialog.showMessageBoxSync = () => 1;
  third.close();
  await wait(() => third.isDestroyed());
  original.focus();
  await wait(() => original.isFocused());
  openSheets();
  assert.equal(BrowserWindow.getAllWindows().length, 2);
  assert.equal(original.isDestroyed(), false);
  console.log(
    '6. Closing one document keeps others alive and asks before discarding edits',
  );
  assert.deepEqual(errors, []);
  console.log('Screenshot:', directory);
  app.exit(0);
}
setTimeout(() => app.exit(1), 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
