const {app, BrowserWindow, dialog, ipcMain} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const recoverySnapshots = require('./recovery-helper.cjs');
const os = require('node:os');
const {setup} = require('../build/electron/main.cjs');
const {openSheets, restoreSheets} = require('../build/electron/sheets.cjs');
app.on('window-all-closed', () => {});

async function run() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'formatted-files-'),
  );
  app.setPath('userData', directory);
  app.setPath('sessionData', directory);
  await app.whenReady();
  await setup();
  const errors = [];
  app.on('web-contents-created', (_event, contents) =>
    contents.on('console-message', event => {
      if (event.level === 'error') errors.push(event.message);
    }),
  );
  const js = (w, code) => w.webContents.executeJavaScript(code);
  const wait = async condition => {
    const until = Date.now() + 10000;
    while (!(await condition())) {
      assert.ok(Date.now() < until, 'Timed out');
      await new Promise(r => setTimeout(r, 30));
    }
  };
  const ready = w =>
    wait(() => js(w, '!!document.querySelector("[data-sheet]")'));
  const click = (w, selector) =>
    js(w, `document.querySelector(${JSON.stringify(selector)}).click()`);
  const input = (w, text) =>
    js(
      w,
      `(() => { const f = document.querySelector('#formula'); f.value = ${JSON.stringify(text)}; f.dispatchEvent(new Event('input', {bubbles:true})); })()`,
    );
  const recovery = async () => {
    try {
      return await fs.readdir(path.join(directory, 'sheet-recovery'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  };
  openSheets();
  let window = BrowserWindow.getAllWindows()[0];
  await ready(window);
  const target = path.join(directory, 'Учебная книга.formatted');
  dialog.showSaveDialog = async () => ({canceled: false, filePath: target});
  await input(window, '=ИНДЕКС(Категории.A2:A4;2)');
  await click(window, '#file-save');
  await wait(() =>
    js(
      window,
      'document.querySelector("#title").textContent === "Учебная книга.formatted"',
    ),
  );
  const saved = JSON.parse(await fs.readFile(target, 'utf8'));
  assert.equal(saved.sheets.length, 3);
  assert.equal(
    saved.cells.find(c => c.sheet === 'Практика' && c.address === 'H2').input
      .formula,
    '=ИНДЕКС(Категории.A2:A4;2)',
  );
  // Hold an actual recovery rename after its .tmp file has been written.
  // Even a clean document must drain this write before its window closes.
  const rename = fs.rename;
  let releaseWrite;
  const writeGate = new Promise(resolve => {
    releaseWrite = resolve;
  });
  let writeStarted = false;
  fs.rename = async (from, to) => {
    if (path.dirname(to) === path.join(directory, 'sheet-recovery')) {
      writeStarted = true;
      await writeGate;
    }
    return rename(from, to);
  };
  let finalCheckpoint = false;
  const onCheckpoint = event => {
    if (event.sender === window.webContents) finalCheckpoint = true;
  };
  ipcMain.on('sheet-checkpoint', onCheckpoint);
  const cleanSnapshot = JSON.stringify({
    document: saved,
    language: 'ru',
    sheet: 'Практика',
    address: 'A2',
    dirty: false,
  });
  void js(
    window,
    `window.sheetDesktop.checkpointAsync(${JSON.stringify(cleanSnapshot)})`,
  ).catch(() => {}); // Closing the renderer may discard the IPC response.
  try {
    await wait(() => writeStarted);
    assert.ok((await recovery()).some(name => name.endsWith('.tmp')));
    window.close();
    await wait(() => finalCheckpoint || window.isDestroyed());
    assert.equal(
      finalCheckpoint,
      true,
      'clean close requests a final checkpoint',
    );
    assert.equal(
      window.isDestroyed(),
      false,
      'close waits for the pending write',
    );
    releaseWrite();
    await wait(() => window.isDestroyed());
    assert.deepEqual(await recovery(), []);
  } finally {
    releaseWrite();
    fs.rename = rename;
    ipcMain.removeListener('sheet-checkpoint', onCheckpoint);
  }
  openSheets();
  window = BrowserWindow.getAllWindows()[0];
  await ready(window);
  dialog.showOpenDialog = async () => ({canceled: false, filePaths: [target]});
  await click(window, '#file-open');
  await wait(() => BrowserWindow.getAllWindows().length === 2);
  let loaded = BrowserWindow.getAllWindows().find(w => w !== window);
  await ready(loaded);
  await click(loaded, '[data-sheet="Практика"]');
  assert.equal(
    await js(loaded, 'document.querySelector("[data-cell=H2]").textContent'),
    '25',
  );
  await click(loaded, '[data-cell=H2]');
  await input(loaded, '=42');
  await click(loaded, '#file-save');
  await wait(async () =>
    JSON.parse(await fs.readFile(target, 'utf8')).cells.some(
      c =>
        c.sheet === 'Практика' &&
        c.address === 'H2' &&
        c.input.formula === '=42',
    ),
  );
  await fs.writeFile(target, 'external change');
  await input(loaded, '=43');
  await click(loaded, '#file-save');
  await wait(() =>
    js(
      loaded,
      'document.querySelector("#status").textContent.includes("Файл изменён")',
    ),
  );
  assert.equal(await fs.readFile(target, 'utf8'), 'external change');
  console.log(
    '1. Save/open retains formulas, overwrites safely and detects external modifications',
  );
  dialog.showSaveDialog = async () => ({canceled: true});
  await click(loaded, '#file-save-as');
  assert.ok(
    await js(
      loaded,
      'document.querySelector("#title").textContent.startsWith("*")',
    ),
  );
  await click(loaded, '[data-language=en]');
  await input(loaded, '=INDEX(');
  loaded.close();
  await wait(() => loaded.isDestroyed());
  window.close();
  await wait(() => window.isDestroyed());
  assert.equal((await recovery()).length, 1);
  await restoreSheets();
  loaded = BrowserWindow.getAllWindows()[0];
  await ready(loaded);
  assert.equal(await js(loaded, 'document.documentElement.lang'), 'en');
  assert.equal(
    await js(loaded, 'document.querySelector("#formula").value'),
    '=INDEX(',
  );
  assert.equal(
    await js(loaded, 'document.querySelector("#cell-editor").value'),
    '=INDEX(',
  );
  console.log(
    '2. Closing and recovering keeps the last unconfirmed formula and language',
  );
  await click(loaded, '#cancel');
  // Simulate loss of a renderer without beforeunload; disk checkpoints must suffice.
  await input(loaded, '=123');
  await click(loaded, '#formula-bar button[type=submit]');
  await wait(() =>
    recoverySnapshots(directory).some(snapshot =>
      snapshot.document.cells.some(
        cell => cell.address === 'H2' && cell.input?.formula === '=123',
      ),
    ),
  );
  loaded.destroy();
  await restoreSheets();
  loaded = BrowserWindow.getAllWindows()[0];
  await ready(loaded);
  assert.equal(
    await js(loaded, 'document.querySelector("[data-cell=H2]").textContent'),
    '123',
  );
  dialog.showOpenDialog = async () => ({canceled: false, filePaths: [target]});
  // An already open file is focused rather than loaded twice.
  await click(loaded, '#file-open');
  await new Promise(r => setTimeout(r, 100));
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  const bad = path.join(directory, 'broken.formatted');
  await fs.writeFile(bad, '{}');
  dialog.showOpenDialog = async () => ({canceled: false, filePaths: [bad]});
  await click(loaded, '#file-open');
  await wait(() =>
    js(
      loaded,
      'document.querySelector("#status").textContent.includes("Could not")',
    ),
  );
  assert.equal(
    await js(loaded, 'document.querySelector("[data-cell=H2]").textContent'),
    '123',
  );
  for (const width of [1200, 640]) {
    loaded.setContentSize(width, 600);
    await js(
      loaded,
      'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
    );
    assert.equal(
      await js(loaded, 'document.documentElement.scrollWidth <= innerWidth'),
      true,
    );
    await fs.writeFile(
      path.join(directory, `files-${width}.png`),
      (await loaded.webContents.capturePage()).toPNG(),
    );
  }
  console.log(
    '3. Renderer loss, invalid input, duplicate-open and narrow-window checks passed',
  );
  assert.deepEqual(errors, []);
  console.log('Screenshots:', directory);
  app.exit(0);
}
setTimeout(() => app.exit(1), 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
