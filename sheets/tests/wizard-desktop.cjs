const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {setup} = require('../../build/formatted/electron/main.js');
const {openSheets} = require('../../build/sheets/electron/sheets.js');
async function run() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'formatted-wizard-'));
  app.setPath('userData', dir);
  app.setPath('sessionData', dir);
  await app.whenReady();
  await setup();
  const errors = [];
  app.on('web-contents-created', (_event, contents) => {
    contents.on('console-message', e => {
      if (e.level === 'error') errors.push(e.message);
    });
  });
  openSheets();
  const editor = BrowserWindow.getAllWindows()[0];
  const evaluate = (w, code) => w.webContents.executeJavaScript(code);
  const click = (w, selector) =>
    evaluate(w, `document.querySelector(${JSON.stringify(selector)}).click()`);
  const wait = async condition => {
    const end = Date.now() + 5000;
    while (!(await condition())) {
      assert.ok(Date.now() < end, 'Condition timed out');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  const input = (w, selector, value) =>
    evaluate(
      w,
      `(() => {const e=document.querySelector(${JSON.stringify(selector)}); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  const value = cell =>
    evaluate(
      editor,
      `document.querySelector('[data-cell="${cell}"]').textContent`,
    );
  const key = async (w, keyCode) => {
    w.focus();
    w.webContents.sendInputEvent({type: 'keyDown', keyCode});
    w.webContents.sendInputEvent({type: 'keyUp', keyCode});
    await new Promise(resolve => setTimeout(resolve, 40));
  };
  await wait(() =>
    evaluate(editor, '!!document.querySelector("[data-cell=H2]")'),
  );
  await click(editor, '[data-cell="I2"]');
  await key(editor, '=');
  await editor.webContents.insertText('2+3*4');
  await key(editor, 'Enter');
  assert.equal(await value('I2'), '14');
  console.log('1. Physical key input and Enter calculate a formula');
  await click(editor, '[data-cell="I2"]');
  await evaluate(
    editor,
    `(() => {const data = new DataTransfer(); data.setData('text/plain', '=ПОИСКПОЗ(C2;Категории.$B$2:$B$4;0)'); document.activeElement.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));})()`,
  );
  assert.equal(await value('I2'), '3');
  console.log('2. Paste event on the selected cell calculates a formula');
  let wizard;
  const closed = async () => {
    await wait(() => wizard.isDestroyed());
    await wait(() => evaluate(editor, '!document.body.inert'));
  };
  const open = async () => {
    await click(editor, '#function-wizard');
    await wait(() => BrowserWindow.getAllWindows().some(w => w !== editor));
    wizard = BrowserWindow.getAllWindows().find(w => w !== editor);
    wizard.webContents.setBackgroundThrottling(false);
    await wait(() =>
      evaluate(wizard, '!!document.querySelector("[data-argument]")'),
    );
  };
  await click(editor, '[data-cell="I3"]');
  await open();
  assert.equal(
    await evaluate(wizard, 'document.querySelector("#expression").value'),
    '',
  );
  assert.equal(
    await evaluate(wizard, 'document.querySelector("#result").textContent'),
    '',
  );
  assert.equal(
    await evaluate(wizard, 'document.querySelector("#result").dataset.error'),
    'false',
  );
  assert.equal(
    await evaluate(wizard, 'document.querySelector("#insert").disabled'),
    true,
  );
  assert.equal(
    await evaluate(
      wizard,
      'document.querySelector("#function-name").textContent',
    ),
    'ИНДЕКС',
  );
  assert.equal(
    await evaluate(wizard, 'document.querySelector(".wizard-help").open'),
    false,
  );
  assert.equal(
    await evaluate(
      wizard,
      'getComputedStyle(document.querySelector("#expression")).fontFamily.includes("monospace")',
    ),
    false,
  );
  await input(wizard, '[data-argument="0"]', 'Категории.A2:A4');
  assert.equal(
    await evaluate(wizard, 'document.querySelector("#result").textContent'),
    '',
  );
  await input(wizard, '[data-argument="1"]', '3');
  assert.match(
    await evaluate(wizard, 'document.querySelector("#result").textContent'),
    /40$/,
  );
  await input(wizard, '#expression', '=1+');
  assert.equal(
    await evaluate(wizard, 'document.querySelector("#result").dataset.error'),
    'true',
  );
  await click(wizard, '#cancel');
  await closed();
  await click(editor, '[data-cell="I2"]');
  await open();
  assert.equal(
    await evaluate(
      wizard,
      `(() => {
      const list = document.querySelector('#functions');
      const style = getComputedStyle(list);
      return style.display === 'flex' && style.flexDirection === 'column' &&
        [...list.querySelectorAll('button')].every(button =>
          button.classList.contains('button--ghost') &&
          parseFloat(getComputedStyle(button).fontSize) === 13);
    })()`,
    ),
    true,
    'The function catalog uses compact rows and HeroUI buttons',
  );
  assert.equal(
    await evaluate(
      wizard,
      `(() => {
      const fields = ['#search', '#expression', '[data-argument]'];
      return fields.every(selector =>
        !getComputedStyle(document.querySelector(selector)).fontFamily.includes('monospace')) &&
        document.querySelector('#insert').classList.contains('button--primary') &&
        document.querySelector('[data-argument]').classList.contains('input');
    })()`,
    ),
    true,
    'Formula and argument controls use the application typography',
  );
  assert.equal(wizard.getParentWindow(), editor);
  assert.equal(wizard.isModal(), false);
  assert.equal(await evaluate(editor, 'document.body.inert'), true);
  assert.equal(await evaluate(wizard, 'typeof require'), 'undefined');
  assert.match(
    await evaluate(wizard, 'document.querySelector("#result").textContent'),
    /3$/,
  );
  console.log(
    '3. Sandboxed wizard initializes and locks the editor outside range selection',
  );
  for (const query of ['index', 'индекс']) {
    await input(wizard, '#search', query);
    assert.equal(
      await evaluate(
        wizard,
        'document.querySelectorAll("[data-function]").length',
      ),
      1,
    );
  }
  await input(wizard, '#search', 'несуществующая');
  await key(wizard, 'Enter');
  assert.equal(wizard.isDestroyed(), false);
  assert.match(
    await evaluate(wizard, 'document.querySelector("#functions").textContent'),
    /не найдено/,
  );
  await input(wizard, '#search', '');
  console.log('4. Bilingual search and empty state');
  await click(wizard, '[data-function="INDEX"]');
  for (const [i, arg] of ['Категории.$A$2:$A$4', 'G2', ''].entries())
    await input(wizard, `[data-argument="${i}"]`, arg);
  assert.match(
    await evaluate(wizard, 'document.querySelector("#result").textContent'),
    /40$/,
  );
  assert.equal(await value('I2'), '3');
  console.log('5. Argument preview is isolated from the workbook');
  await click(wizard, '#insert');
  await closed();
  assert.equal(await value('I2'), '40');
  await click(editor, '#undo');
  assert.equal(await value('I2'), '3');
  console.log('6. Insertion targets the original cell and supports undo');
  await input(editor, '#formula', '=7+8');
  await open();
  await input(wizard, '#expression', '=99');
  await key(wizard, 'Escape');
  await closed();
  assert.equal(
    await evaluate(editor, 'document.querySelector("#formula").value'),
    '=7+8',
  );
  assert.equal(await value('I2'), '3');
  console.log('7. Escape leaves the uncommitted formula intact');
  await open();
  for (const formula of [
    '=1/0',
    '=I2',
    '=1+',
    '=SUM(A1:A2)',
    '=ПОИСКПОЗ("нет";Категории.B2:B4;0)',
  ]) {
    await input(wizard, '#expression', formula);
    assert.equal(
      await evaluate(wizard, 'document.querySelector("#insert").disabled'),
      true,
    );
  }
  await input(
    wizard,
    '#expression',
    '=ИНДЕКС(Категории.A2:A4;ПОИСКПОЗ(C2;Категории.B2:B4;0))',
  );
  assert.equal(
    await evaluate(wizard, 'document.querySelector("#insert").disabled'),
    false,
  );
  assert.match(
    await evaluate(
      wizard,
      `document.querySelector('[data-argument="1"]').value`,
    ),
    /ПОИСКПОЗ/,
  );
  console.log('8. Errors are blocked; nested exam functions are supported');
  for (const [width, height] of [
    [700, 680],
    [360, 400],
    [900, 800],
  ]) {
    wizard.setContentSize(width, height);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(
      await evaluate(
        wizard,
        'document.documentElement.scrollWidth <= innerWidth',
      ),
      true,
    );
    assert.equal(
      await evaluate(
        wizard,
        'document.querySelector("footer").getBoundingClientRect().bottom <= innerHeight',
      ),
      true,
    );
    assert.equal(
      await evaluate(
        wizard,
        `(() => {
        const field = document.querySelector('.argument-field');
        const input = field.querySelector('input').getBoundingClientRect();
        const picker = field.querySelector('button').getBoundingClientRect();
        return Math.abs(input.top - picker.top) < 1 && input.height === picker.height &&
          picker.width === 36 && field.scrollWidth <= field.clientWidth;
      })()`,
      ),
      true,
      `Argument controls align at ${width}px`,
    );
    await fs.writeFile(
      path.join(dir, `wizard-${width}.png`),
      (await wizard.webContents.capturePage()).toPNG(),
    );
  }
  wizard.setContentSize(700, 680);
  wizard.webContents.setZoomFactor(2);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(
    await evaluate(
      wizard,
      'document.documentElement.scrollWidth <= innerWidth',
    ),
    true,
  );
  await fs.writeFile(
    path.join(dir, 'wizard-zoom.png'),
    (await wizard.webContents.capturePage()).toPNG(),
  );
  console.log('9. Window sizes and 200% zoom keep actions accessible');
  await click(wizard, '#cancel');
  await closed();
  await click(editor, '#cancel');
  await click(editor, '[data-language="en"]');
  await open();
  assert.equal(await evaluate(wizard, 'document.title'), 'Function wizard');
  assert.match(
    await evaluate(wizard, 'document.querySelector("#expression").value'),
    /MATCH/,
  );
  await input(wizard, '#expression', '=INDEX(Категории.A2:A4;3)');
  await click(wizard, '#insert');
  await closed();
  assert.equal(await value('I2'), '40');
  console.log('10. English interface and function names');
  await evaluate(editor, 'window.open("https://example.com")');
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  await evaluate(
    editor,
    'window.postMessage({type:"apply",formula:"=999"},location.origin)',
  );
  assert.equal(await value('I2'), '40');
  console.log('11. Untrusted windows and messages are rejected');
  assert.deepEqual(errors, []);
  console.log('Screenshots:', dir);
  app.exit(0);
}
setTimeout(() => app.exit(1), 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
