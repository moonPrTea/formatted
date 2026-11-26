const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {setup} = require('../../build/formatted/electron/main.js');
const {
  openSheets,
  restoreSheets,
} = require('../../build/sheets/electron/sheets.js');
app.on('window-all-closed', () => {});

async function run() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'formatted-viewport-'),
  );
  app.setPath('userData', directory);
  app.setPath('sessionData', directory);
  await app.whenReady();
  await setup();
  const errors = [];
  const observe = window => {
    window.webContents.setBackgroundThrottling(false);
    window.webContents.on('console-message', event => {
      if (event.level === 'error') errors.push(event.message);
    });
  };
  openSheets();
  let window = BrowserWindow.getAllWindows()[0];
  observe(window);
  const js = async source => {
    try {
      return await window.webContents.executeJavaScript(source);
    } catch (error) {
      throw new Error(`${source}\n${error.message}\n${errors.join('\n')}`);
    }
  };
  const frame = () =>
    js(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
  const wait = async condition => {
    const deadline = Date.now() + 10000;
    while (!(await condition())) {
      assert.ok(Date.now() < deadline, 'Viewport did not become ready');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  const ready = () => wait(() => js('!!document.querySelector("[data-cell]")'));
  const go = async address => {
    await js(
      `(() => { const field = document.querySelector('#address'); field.focus(); field.value = ${JSON.stringify(address)}; document.querySelector('#formula-bar').requestSubmit(); })()`,
    );
    await frame();
    assert.equal(await js('document.activeElement.dataset.cell'), address);
  };
  const key = async (value, shift = false) => {
    await js(
      `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:${JSON.stringify(value)}, shiftKey:${shift}, bubbles:true, cancelable:true}))`,
    );
    await frame();
  };
  const write = async (address, value) => {
    await go(address);
    await js(
      `(() => { const field = document.querySelector('#formula'); field.focus(); field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('#formula-bar').requestSubmit(); })()`,
    );
    await frame();
  };
  const text = address =>
    js(`document.querySelector('[data-cell="${address}"]').textContent`);
  const bounded = async () =>
    assert.ok(
      await js('document.querySelectorAll("[data-cell]").length <= 1212'),
      'Only visible rows and the active row stay mounted',
    );
  const capture = async name => {
    await frame();
    await fs.writeFile(
      path.join(directory, `${name}.png`),
      (await window.webContents.capturePage()).toPNG(),
    );
  };
  await ready();
  assert.equal(
    await js('document.querySelector("footer").checkVisibility()'),
    false,
  );
  assert.equal(await js('document.querySelector("#scope")'), null);
  await js(
    'document.querySelector("#grid-scroll").scrollTop = document.querySelector("#grid-scroll").scrollHeight',
  );
  await frame();
  assert.equal(await js('!!document.querySelector("[data-cell=A150]")'), true);
  await bounded();
  await go('L100');
  await key('ArrowRight');
  await key('ArrowDown');
  assert.equal(await js('document.activeElement.dataset.cell'), 'L101');
  await write('A5000', '123');
  assert.equal(await text('A5000'), '123');
  assert.equal(
    await js(
      'getComputedStyle(document.querySelector("[data-cell=A5000]")).textAlign',
    ),
    'left',
  );
  await js(
    `(() => { const cell = document.querySelector('[data-cell=A5000]'); cell.dispatchEvent(new MouseEvent('dblclick', {bubbles:true})); const input = document.querySelector('#cell-editor'); input.value = 'draft'; input.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('#grid-scroll').scrollTop = 0; })()`,
  );
  await frame();
  assert.equal(
    await js('document.querySelector("#cell-editor").value'),
    'draft',
  );
  assert.equal(
    await js(
      'getComputedStyle(document.querySelector("#cell-editor")).textAlign',
    ),
    'left',
  );
  await bounded();
  await js('document.querySelector("#cancel").click()');
  for (const zoom of [1, 2]) {
    window.webContents.setZoomFactor(zoom);
    for (const address of ['A100000', 'L1048576']) {
      await go(address);
      await bounded();
      assert.equal(
        await js(`(() => {
        const field = document.querySelector('#address');
        const style = getComputedStyle(field);
        const context = document.createElement('canvas').getContext('2d');
        context.font = style.font;
        return context.measureText(field.value).width <= field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      })()`),
        true,
        'The complete address fits in its field',
      );
      const bounds = await js(`(() => {
        const cell = document.querySelector('[data-cell=${address}]').getBoundingClientRect();
        const viewport = document.querySelector('#grid-scroll').getBoundingClientRect();
        const header = document.querySelector('[data-cell=${address}]').parentElement.firstElementChild;
        return {cell:cell.toJSON(), viewport:viewport.toJSON(), headerWidth:header.clientWidth, headerContent:header.scrollWidth, scroll:document.querySelector('#grid-scroll').scrollTop};
      })()`);
      await capture(`limit-${zoom}-${address}`);
      assert.ok(
        bounds.cell.top >= bounds.viewport.top &&
          bounds.cell.bottom <= bounds.viewport.bottom + 1 &&
          bounds.headerContent <= bounds.headerWidth,
        `${address} remains visible at ${zoom * 100}% zoom: ${JSON.stringify(bounds)}`,
      );
    }
  }
  window.webContents.setZoomFactor(1);
  await write('A50000', '00101');
  await go('A5000');
  assert.equal(await text('A5000'), '123');
  await capture('distant-row');
  await go('L5000');
  await js(
    `(() => { const data = new DataTransfer(); data.setData('text/plain', 'left\tright'); document.activeElement.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data,bubbles:true,cancelable:true})); })()`,
  );
  assert.match(
    await js('document.querySelector("#status").textContent'),
    /границы сетки|grid bounds/,
  );
  assert.equal(await text('L5000'), '');
  await go('A1');
  await js(`(() => {
    const cell = document.activeElement;
    const press = key => cell.dispatchEvent(new KeyboardEvent('keydown', {key,shiftKey:true,bubbles:true,cancelable:true}));
    for (let column = 0; column < 11; column++) press('ArrowRight');
    for (let row = 0; row < 834; row++) press('ArrowDown');
    const data = new DataTransfer();
    cell.dispatchEvent(new ClipboardEvent('copy', {clipboardData:data,bubbles:true,cancelable:true}));
    cell.dispatchEvent(new KeyboardEvent('keydown', {key:'Delete',bubbles:true,cancelable:true}));
  })()`);
  assert.match(
    await js('document.querySelector("#status").textContent'),
    /#LIMIT!/,
  );
  await go('A1');
  assert.equal(await text('A1'), 'product_code');
  await go('B50000');
  await js(
    `(() => { document.activeElement.dispatchEvent(new MouseEvent('dblclick', {bubbles:true})); const input = document.querySelector('#cell-editor'); input.value = '=ИНДЕКС('; input.dispatchEvent(new Event('input', {bubbles:true})); })()`,
  );
  window.close();
  await wait(() => window.isDestroyed());
  await restoreSheets();
  window = BrowserWindow.getAllWindows()[0];
  observe(window);
  await ready();
  assert.equal(await js('document.querySelector("#address").value'), 'B50000');
  assert.equal(
    await js('document.querySelector("#formula").value'),
    '=ИНДЕКС(',
  );
  await bounded();
  await js('document.querySelector("#cancel").click()');
  await go('A50000');
  assert.equal(await text('A50000'), '00101');
  assert.deepEqual(errors, []);
  console.log(
    `Row growth, distant navigation, editing, limits and recovery passed: ${directory}`,
  );
  app.exit(0);
}

setTimeout(() => app.exit(1), 90000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
