const {app, BrowserWindow, dialog, Menu} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {setup, createWindow} = require('../build/electron/main.js');
const {openSheets} = require('../build/electron/sheets.js');

async function run() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'formatted-sheets-'));
  await fs.mkdir(path.join(dir, 'profile'), {
    recursive: true,
  });
  app.setPath('userData', path.join(dir, 'profile'));
  app.setPath('sessionData', path.join(dir, 'profile'));
  await app.whenReady();
  await setup();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Edit',
        submenu: [{role: 'undo'}, {role: 'copy'}, {role: 'paste'}],
      },
    ]),
  );
  openSheets();
  const window = BrowserWindow.getAllWindows()[0];
  window.webContents.setBackgroundThrottling(false);
  const errors = [];
  window.webContents.on('console-message', e => {
    if (e.level === 'error') errors.push(e.message);
  });
  await new Promise(resolve =>
    window.webContents.once('did-finish-load', resolve),
  );
  const evaluate = code => window.webContents.executeJavaScript(code);
  const click = selector =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const value = address =>
    evaluate(`document.querySelector('[data-cell="${address}"]').textContent`);
  const frame = () =>
    evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
  const key = async (keyCode, modifiers = []) => {
    window.focus();
    window.webContents.sendInputEvent({type: 'keyDown', keyCode, modifiers});
    if (keyCode === 'Enter')
      window.webContents.sendInputEvent({
        type: 'char',
        keyCode: '\r',
        modifiers,
      });
    window.webContents.sendInputEvent({type: 'keyUp', keyCode, modifiers});
    await frame();
  };
  const input = (selector, text) =>
    evaluate(
      `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); e.value = ${JSON.stringify(text)}; e.dispatchEvent(new Event('input', {bubbles:true})); })()`,
    );
  const write = async (cell, text) => {
    await input('#address', cell);
    await key('Enter');
    await click(`[data-cell="${cell}"]`);
    await input('#formula', text);
    await key('Enter');
  };
  const capture = async name => {
    await frame();
    await fs.writeFile(
      path.join(dir, name + '.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
  };
  let checks = 0;
  const pass = name => console.log(`${++checks}. ${name}`);

  assert.equal(await value('H2'), '40');
  assert.equal(
    await evaluate('document.querySelectorAll("[data-cell]").length'),
    1200,
  );
  assert.equal(await evaluate('typeof require'), 'undefined');
  assert.equal(await evaluate('typeof window.desktop'), 'undefined');
  openSheets();
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  pass('Isolated native window, real engine, single instance');

  for (const [width, height] of [
    [1200, 800],
    [900, 650],
    [640, 480],
    [1920, 900],
  ]) {
    window.setContentSize(width, height);
    await frame();
    const [actualWidth, actualHeight] = await evaluate(
      '[innerWidth, innerHeight]',
    );
    const [contentWidth, contentHeight] = window.getContentSize();
    assert.ok(Math.abs(actualWidth - contentWidth) <= 1);
    assert.ok(Math.abs(actualHeight - contentHeight) <= 1);
    assert.ok(actualWidth > 0 && actualHeight > 0);
    assert.equal(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      true,
    );
    assert.equal(
      await evaluate('document.documentElement.scrollHeight <= innerHeight'),
      true,
    );
    await capture(`layout-${width}`);
  }
  pass('Four viewport sizes without page overflow');

  window.setContentSize(900, 650);
  for (const zoom of [1.25, 1.5, 2]) {
    window.webContents.setZoomFactor(zoom);
    await frame();
    await capture(`zoom-${zoom}`);
    assert.equal(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      true,
    );
  }
  window.webContents.setZoomFactor(1);
  window.setContentSize(640, 480);
  window.webContents.setZoomFactor(2);
  await frame();
  await capture('compact-200-percent');
  assert.ok(
    await evaluate('document.querySelector("#grid-scroll").clientHeight >= 54'),
  );
  assert.equal(
    await evaluate('document.documentElement.scrollWidth <= innerWidth'),
    true,
  );
  window.webContents.setZoomFactor(1);
  window.setContentSize(900, 650);
  pass('125%, 150% and 200% zoom');

  await click('#options > summary');
  assert.equal(await evaluate('document.querySelector("#options").open'), true);
  assert.equal(
    await evaluate(
      'document.querySelector(".options").getBoundingClientRect().right <= innerWidth',
    ),
    true,
  );
  await capture('language-menu');
  await click('[data-language="en"]');
  assert.equal(await evaluate('document.documentElement.lang'), 'en');
  await click('[data-cell="H2"]');
  assert.match(
    await evaluate('document.querySelector("#formula").value'),
    /INDEX/,
  );
  await click('summary');
  await key('Escape');
  assert.equal(
    await evaluate('document.querySelector("#options").open'),
    false,
  );
  pass('Language dropdown, English formulas, Escape');

  await click('[data-cell="B10"]');
  await key('Right');
  assert.equal(await evaluate('document.activeElement.dataset.cell'), 'C10');
  await key('Down');
  assert.equal(await evaluate('document.activeElement.dataset.cell'), 'C11');
  await input('#address', 'L100');
  await key('Enter');
  assert.equal(await evaluate('document.activeElement.dataset.cell'), 'L100');
  await key('Right');
  await key('Down');
  assert.equal(await evaluate('document.activeElement.dataset.cell'), 'L101');
  pass('Keyboard navigation, address entry, grid bounds');

  await write('C2', 'Домашняя');
  assert.equal(await value('G2'), '1');
  assert.equal(await value('H2'), '10');
  await click('[data-sheet="Категории"]');
  await write('A2', '555');
  await click('[data-sheet="Практика"]');
  assert.equal(await value('H2'), '555');
  pass('Editing and cross-sheet recalculation');

  await write('I1', '=1/0');
  assert.equal(await value('I1'), '#DIV/0!');
  await write('I1', '=I1');
  assert.equal(await value('I1'), '#CYCLE!');
  await write('I1', '=1+');
  assert.equal(
    await evaluate('document.querySelector("#formula").value'),
    '=1+',
  );
  await write('I1', '=2+3*4');
  assert.equal(await value('I1'), '14');
  pass('Formula errors, cycles, correction');

  await input('#formula', '999');
  await key('Escape');
  assert.equal(await value('I1'), '14');
  await write('I1', '99');
  await key('Z', [process.platform === 'darwin' ? 'meta' : 'control']);
  assert.equal(await value('I1'), '14');
  await write('I1', '99');
  await click('#undo');
  assert.equal(await value('I1'), '14');
  await click('[data-cell="I1"]');
  await key('Delete');
  assert.equal(await value('I1'), '');
  await click('#undo');
  assert.equal(await value('I1'), '14');
  pass('Cancel, undo and deletion');

  for (const literal of ['00123', "'=1+2", '<img src=x onerror=alert(1)>'])
    await write('J1', literal);
  assert.equal(
    await evaluate('document.querySelector("[data-cell=J1] img")'),
    null,
  );
  await write('J1', "'123");
  await key('F2');
  await key('Enter');
  assert.equal(
    await evaluate('document.querySelector("#formula").value'),
    "'123",
  );
  pass('Literal input, roundtrip and HTML injection');

  await input('#address', 'Z999');
  await key('Enter');
  assert.match(
    await evaluate('document.querySelector("#status").textContent'),
    /A1:L1048576/,
  );
  await click('[data-cell="A1"]');
  assert.equal(
    await evaluate(
      `(() => { const data = new DataTransfer(); data.setData('text/plain', 'a\tb'); const event = new ClipboardEvent('paste', {clipboardData:data, cancelable:true}); document.querySelector('#formula').dispatchEvent(event); return event.defaultPrevented; })()`,
    ),
    true,
  );
  pass('Invalid addresses and multi-cell paste rejection');

  await input('#address', 'L100');
  await key('Enter');
  await frame();
  assert.equal(
    await evaluate('document.querySelector("#grid-scroll").scrollTop > 0'),
    true,
  );
  await capture('scrolled-bottom-right');
  assert.deepEqual(await evaluate('[scrollX, scrollY]'), [0, 0]);
  assert.equal(
    await evaluate(`document.querySelectorAll('td[tabindex="0"]').length`),
    1,
  );
  pass('Scrolling, sticky headers and single keyboard stop');

  window.webContents.debugger.attach('1.3');
  await input('#address', 'A1');
  await key('Enter');
  await window.webContents.debugger.sendCommand(
    'Emulation.setCPUThrottlingRate',
    {rate: 4},
  );
  const timing = await evaluate(
    `(() => { const start = performance.now(); for(let i=0;i<100;i++) document.querySelector('[data-cell="A'+(i+1)+'"]').click(); return performance.now()-start; })()`,
  );
  console.log(
    '100 selections at 4x CPU slowdown, ms:',
    timing,
    'metrics:',
    app
      .getAppMetrics()
      .map(m => ({type: m.type, memory: m.memory, cpu: m.cpu.percentCPUUsage})),
  );
  assert.ok(timing < 10000);
  await window.webContents.debugger.sendCommand(
    'Emulation.setCPUThrottlingRate',
    {rate: 1},
  );
  window.webContents.debugger.detach();
  pass('Bounded grid workload and process resource sample');

  const parent = createWindow();
  await new Promise(resolve =>
    parent.webContents.once('did-finish-load', resolve),
  );
  await parent.webContents.executeJavaScript('window.desktop.openSheets()');
  const blank = BrowserWindow.getAllWindows().find(
    w => w !== window && w !== parent,
  );
  assert.ok(blank, 'Launching a blank workbook preserves the sample workbook');
  if (blank.webContents.isLoading())
    await new Promise(resolve =>
      blank.webContents.once('did-finish-load', resolve),
    );
  assert.equal(
    await blank.webContents.executeJavaScript(
      'document.querySelector("[data-cell=A1]").textContent',
    ),
    '',
  );
  await parent.webContents.executeJavaScript('window.desktop.openSheets()');
  assert.equal(
    BrowserWindow.getAllWindows().length,
    3,
    JSON.stringify(
      BrowserWindow.getAllWindows().map(w => w.webContents.getURL()),
    ),
  );
  pass('Launch from application bridge opens a blank workbook and reuses it');

  let prompts = 0;
  const recovery = path.join(dir, 'profile', 'sheet-recovery');
  await fs.rename(recovery, recovery + '-backup');
  await fs.writeFile(recovery, 'Simulated unavailable recovery directory');
  dialog.showMessageBoxSync = () => {
    prompts++;
    return 0;
  };
  window.close();
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(window.isDestroyed(), false);
  assert.equal(prompts, 1);
  dialog.showMessageBoxSync = () => 1;
  window.close();
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(window.isDestroyed(), true);
  pass('Unsaved-close confirmation: stay and discard');

  assert.deepEqual(errors, []);
  pass('No renderer errors during all scenarios');
  console.log('Screenshots:', dir);
  app.exit(0);
}
setTimeout(() => {
  console.error('Desktop test timed out');
  app.exit(1);
}, 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
