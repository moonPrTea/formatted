const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const root = process.env.FORMATTED_PACKAGE || path.resolve(__dirname, '..');
const {setup} = require(path.join(root, 'build/electron/main.cjs'));
const {openSheets} = require(path.join(root, 'build/electron/sheets.cjs'));

async function run() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'formatted-ranges-'));
  app.setPath('userData', dir);
  app.setPath('sessionData', dir);
  await app.whenReady();
  await setup();
  const errors = [];
  app.on('web-contents-created', (_event, contents) => {
    contents.on('console-message', event => {
      if (event.level === 'error') errors.push(event.message);
    });
  });
  openSheets();
  const editor = BrowserWindow.getAllWindows()[0];
  editor.setIgnoreMouseEvents(true);
  editor.webContents.setBackgroundThrottling(false);
  editor.webContents.debugger.attach('1.3');
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
  const input = (window, selector, value) =>
    evaluate(
      window,
      `(() => {const field = document.querySelector(${JSON.stringify(selector)}); field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', {bubbles:true}));})()`,
    );
  const key = (window, keyCode) => {
    window.focus();
    window.webContents.sendInputEvent({type: 'keyDown', keyCode});
    if (keyCode === 'Enter')
      window.webContents.sendInputEvent({type: 'char', keyCode: '\r'});
    window.webContents.sendInputEvent({type: 'keyUp', keyCode});
  };
  const screenshot = async (window, name) => {
    await evaluate(
      window,
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
    await fs.writeFile(
      path.join(dir, name + '.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
  };
  await wait(() =>
    evaluate(editor, '!!document.querySelector("[data-cell=H2]")'),
  );
  let wizard;
  const open = async () => {
    await click(editor, '#function-wizard');
    await wait(() => BrowserWindow.getAllWindows().length === 2);
    wizard = BrowserWindow.getAllWindows().find(window => window !== editor);
    wizard.setIgnoreMouseEvents(true);
    wizard.webContents.setBackgroundThrottling(false);
    await wait(() =>
      evaluate(
        wizard,
        'document.querySelectorAll("[data-function]").length === 530',
      ),
    );
  };
  const closed = async () => {
    await wait(() => wizard.isDestroyed());
    await wait(() =>
      evaluate(
        editor,
        '!document.body.inert && !document.querySelector("header").inert',
      ),
    );
  };
  const picking = async index => {
    await click(wizard, `[data-pick="${index}"]`);
    await wait(() =>
      evaluate(
        editor,
        'document.querySelector("#grid").classList.contains("picking-range")',
      ),
    );
    await wait(() => wizard.getBounds().height < 200);
    await wait(() => editor.isFocused());
    await evaluate(
      editor,
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
    assert.equal(
      await evaluate(editor, 'document.querySelector("header").inert'),
      true,
    );
  };
  const restored = async () => {
    await wait(() => wizard.getBounds().height >= 400);
    await wait(() =>
      evaluate(wizard, '!document.body.classList.contains("picking")'),
    );
    await wait(() => wizard.isFocused());
    assert.equal(await evaluate(editor, 'document.body.inert'), true);
    assert.equal(
      await evaluate(editor, 'document.querySelectorAll(".range-cell").length'),
      0,
    );
  };
  const point = cell =>
    evaluate(
      editor,
      `(() => {
    const rect = document.querySelector('[data-cell="${cell}"]').getBoundingClientRect();
    return {x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2)};
  })()`,
    );
  let pressed = false;
  let mouseQueue = Promise.resolve();
  const mouse = (type, position) => {
    if (type === 'mouseDown') pressed = true;
    if (type === 'mouseUp') pressed = false;
    const command = {
      type: {
        mouseMove: 'mouseMoved',
        mouseDown: 'mousePressed',
        mouseUp: 'mouseReleased',
      }[type],
      ...position,
      button: 'left',
      clickCount: 1,
      buttons: pressed ? 1 : 0,
    };
    mouseQueue = mouseQueue.then(() =>
      editor.webContents.debugger.sendCommand(
        'Input.dispatchMouseEvent',
        command,
      ),
    );
    return mouseQueue;
  };
  const drag = async (first, last, count) => {
    editor.focus();
    await wait(() => editor.isFocused());
    await wait(() => evaluate(editor, 'document.hasFocus()'));
    // Native focus/resize and sheet replacement must reach the compositor
    // before CDP uses coordinates from the new grid.
    await evaluate(
      editor,
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
    await editor.webContents.capturePage();
    const from = await point(first);
    await mouse('mouseMove', from);
    await mouse('mouseDown', from);
    await wait(() =>
      evaluate(
        editor,
        `document.querySelector('[data-cell="${first}"]').classList.contains('range-cell')`,
      ),
    );
    const to = await point(last);
    await mouse('mouseMove', to);
    await wait(
      async () =>
        (await evaluate(
          editor,
          'document.querySelectorAll(".range-cell").length',
        )) === count,
    );
    await screenshot(editor, `range-${first}-${last}`);
    await mouse('mouseUp', await point(last));
    await restored();
  };
  const argument = index =>
    evaluate(
      wizard,
      `document.querySelector('[data-argument="${index}"]').value`,
    );
  await open();
  const bounds = wizard.getBounds();
  await evaluate(wizard, 'window.rangeWindow.setPicking("invalid")');
  assert.deepEqual(wizard.getBounds(), bounds);
  await evaluate(wizard, 'window.open("https://example.com")');
  assert.equal(BrowserWindow.getAllWindows().length, 2);
  await screenshot(wizard, 'catalog');
  await input(wizard, '#search', 'сумм');
  await click(wizard, '[data-function="SUM"]');
  assert.match(
    await evaluate(wizard, 'document.querySelector("#support").textContent'),
    /Только каталог/,
  );
  assert.equal(
    await evaluate(wizard, 'document.querySelector("#insert").disabled'),
    true,
  );
  assert.equal(
    await evaluate(
      wizard,
      'document.querySelectorAll("[data-argument]").length',
    ),
    0,
  );
  await screenshot(wizard, 'unsupported');
  await evaluate(
    wizard,
    `const category = document.querySelector('#category'); category.value = 'LOGIC'; category.dispatchEvent(new Event('change'));`,
  );
  assert.equal(
    await evaluate(
      wizard,
      'document.querySelectorAll("[data-function]").length',
    ),
    0,
  );
  await input(wizard, '#search', '');
  assert.equal(
    await evaluate(wizard, '!!document.querySelector("[data-function=IF]")'),
    true,
  );
  await evaluate(
    wizard,
    `category.value = ''; category.dispatchEvent(new Event('change'));`,
  );
  await click(wizard, '[data-function="INDEX"]');
  await input(wizard, '#expression', '=СУММ(A1:A2)');
  assert.match(
    await evaluate(wizard, 'document.querySelector("#support").textContent'),
    /Только каталог/,
  );
  await input(wizard, '#search', 'INDEX');
  await evaluate(wizard, 'document.querySelector("#functions button").focus()');
  key(wizard, 'Enter');
  await wait(() =>
    evaluate(wizard, '!!document.querySelector("[data-argument]")'),
  );
  assert.equal(
    await evaluate(wizard, 'document.activeElement.dataset.function'),
    'INDEX',
  );
  await input(wizard, '#search', '');
  console.log(
    '1. Complete catalog, bilingual search, category filter and unsupported state',
  );
  await picking(0);
  await screenshot(wizard, 'compact');
  await click(editor, '[data-sheet="Категории"]');
  await drag('B4', 'A2', 6);
  assert.equal(await argument(0), "'Категории'.$A$2:$B$4");
  assert.equal(
    await evaluate(editor, 'document.querySelector("#selection").textContent'),
    'Практика, H2',
  );
  assert.equal(
    await evaluate(
      editor,
      'document.querySelector("[data-cell=H2]").textContent',
    ),
    '40',
  );
  console.log(
    '2. Native reverse drag selects a rectangle across sheets without editing cells',
  );
  await picking(1);
  await drag('G2', 'G2', 1);
  assert.equal(await argument(1), "'Практика'.$G$2");
  await input(wizard, '[data-argument="2"]', '2');
  assert.match(
    await evaluate(wizard, 'document.querySelector("#result").textContent'),
    /Спортивная$/,
  );
  await click(wizard, '#insert');
  await closed();
  assert.equal(
    await evaluate(
      editor,
      'document.querySelector("[data-cell=H2]").textContent',
    ),
    'Спортивная',
  );
  await click(editor, '#undo');
  assert.equal(
    await evaluate(
      editor,
      'document.querySelector("[data-cell=H2]").textContent',
    ),
    '40',
  );
  console.log(
    '3. Single-cell argument, live calculation, original target insertion and undo',
  );
  await input(editor, '#formula', '=7+8');
  await open();
  await picking(0);
  await click(editor, '[data-sheet="Исходник"]');
  key(editor, 'Escape');
  await restored();
  assert.equal(await argument(0), '');
  await picking(0);
  await click(wizard, '#cancel-range');
  await restored();
  await picking(0);
  key(wizard, 'Escape');
  await restored();
  await picking(0);
  await click(editor, '[data-sheet="Категории"]');
  wizard.close();
  await closed();
  assert.equal(
    await evaluate(editor, 'document.querySelector("#formula").value'),
    '=7+8',
  );
  assert.equal(
    await evaluate(editor, 'document.querySelector("#selection").textContent'),
    'Практика, H2',
  );
  console.log(
    '4. Escape in either window, cancel button and native close preserve draft and target',
  );
  await click(editor, '#cancel');
  await open();
  await picking(0);
  editor.focus();
  const from = await point('B2');
  await evaluate(
    editor,
    `document.querySelector('#grid').addEventListener('gotpointercapture', event => document.body.dataset.captured = String(event.pointerId), {once:true})`,
  );
  await mouse('mouseDown', from);
  await mouse('mouseMove', {x: from.x + 1, y: from.y});
  await wait(() =>
    evaluate(editor, 'document.body.dataset.captured !== undefined'),
  );
  const pointerId = await evaluate(
    editor,
    'Number(document.body.dataset.captured)',
  );
  assert.equal(
    await evaluate(
      editor,
      `document.querySelector('#grid').hasPointerCapture(${pointerId})`,
    ),
    true,
  );
  await evaluate(
    editor,
    `document.querySelector('#grid').releasePointerCapture(${pointerId})`,
  );
  await mouse('mouseMove', from);
  await restored();
  await mouse('mouseUp', from);
  assert.equal(await argument(0), "'Категории'.$A$2:$A$4");
  await picking(0);
  await mouse('mouseDown', from);
  const edge = await evaluate(
    editor,
    `(() => {
    const rect = document.querySelector('#grid-scroll').getBoundingClientRect();
    return {x: Math.round(rect.right - 5), y: Math.round(rect.bottom - 5)};
  })()`,
  );
  await mouse('mouseMove', edge);
  await wait(() =>
    evaluate(
      editor,
      'document.querySelector("#grid-scroll").scrollTop > 150 && document.querySelector("#grid-scroll").scrollLeft > 150',
    ),
  );
  await screenshot(editor, 'autoscroll');
  key(editor, 'Escape');
  await restored();
  // A CDP mouse-up can focus the editor again, independently of Escape.
  await mouse('mouseUp', edge);
  assert.equal(await argument(0), "'Категории'.$A$2:$A$4");
  console.log(
    '5. Lost pointer capture cancels safely; edge dragging scrolls in both directions',
  );
  assert.ok(
    await evaluate(
      editor,
      'document.querySelector("#grid-scroll").scrollTop < 100',
    ),
  );
  for (const [width, height] of [
    [360, 400],
    [700, 680],
    [1100, 700],
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
    await picking(0);
    await click(wizard, '#cancel-range');
    await restored();
    assert.deepEqual(wizard.getContentSize(), [width, height]);
    await screenshot(wizard, `layout-${width}`);
  }
  console.log(
    '6. Compact window restores its size at narrow, standard and wide layouts',
  );
  wizard.webContents.setZoomFactor(2);
  await click(wizard, '[data-pick="0"]');
  await wait(() =>
    evaluate(wizard, 'document.body.classList.contains("picking")'),
  );
  await wait(() => wizard.getContentSize()[0] === 840);
  assert.equal(
    await evaluate(
      wizard,
      'document.documentElement.scrollWidth <= innerWidth',
    ),
    true,
  );
  await screenshot(wizard, 'compact-zoom');
  await click(wizard, '#cancel-range');
  await restored();
  wizard.webContents.setZoomFactor(1);
  console.log('7. Compact range selection respects 200% zoom');
  await click(wizard, '#cancel');
  await closed();
  await click(editor, '[data-language="en"]');
  await open();
  await input(wizard, '#search', 'СЖПРОБЕЛЫ');
  assert.equal(
    await evaluate(
      wizard,
      'document.querySelector("[data-function=TRIM]").textContent',
    ),
    'TRIM',
  );
  await screenshot(wizard, 'english');
  console.log('8. English UI still searches Russian names');
  const elapsed = await evaluate(
    wizard,
    `(() => {
    const search = document.querySelector('#search');
    const start = performance.now();
    for (let i = 0; i < 30; i++) {
      search.value = ['sum', 'поиск', ''][i % 3];
      search.dispatchEvent(new Event('input', {bubbles: true}));
    }
    return performance.now() - start;
  })()`,
  );
  assert.equal(
    await evaluate(
      wizard,
      'document.querySelectorAll("[data-function]").length',
    ),
    530,
  );
  console.log('30 catalog searches, ms:', elapsed);
  assert.deepEqual(errors, []);
  console.log('Screenshots:', dir);
  app.exit(0);
}
setTimeout(() => app.exit(1), 90000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
