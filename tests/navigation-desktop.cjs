const {app, BrowserWindow, dialog} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const recoverySnapshots = require('./recovery-helper.cjs');
const {setup} = require('../build/electron/main.js');
const {openSheets, restoreSheets} = require('../build/electron/sheets.js');
app.on('window-all-closed', () => {});
async function run() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'formatted-navigation-'));
  app.setPath('userData', dir);
  app.setPath('sessionData', dir);
  await app.whenReady();
  await setup();
  openSheets();
  let window = BrowserWindow.getAllWindows()[0];
  const js = code => window.webContents.executeJavaScript(code);
  const wait = async condition => {
    const end = Date.now() + 10000;
    while (!(await condition())) {
      assert.ok(Date.now() < end, 'Timed out');
      await new Promise(r => setTimeout(r, 25));
    }
  };
  const ready = () =>
    wait(() => js('!!document.querySelector("[data-sheet]")'));
  await ready();
  const metrics = await js(`(async () => {
    let mutations = 0;
    const observer = new MutationObserver(records => mutations += records.length);
    observer.observe(document.querySelector('#grid'), {subtree:true, attributes:true, childList:true});
    const start = performance.now();
    for (let i = 1; i <= 100; i++) document.querySelector('[data-cell=A' + i + ']').click();
    const elapsed = performance.now() - start;
    await Promise.resolve(); observer.disconnect(); return {elapsed, mutations};
  })()`);
  console.log('100 selections:', metrics);
  assert.ok(metrics.mutations < 800, 'Selection must not repaint 1200 cells');
  assert.ok(metrics.elapsed < 500, 'Navigation exceeded budget');
  await js(`document.querySelector('[data-sheet="Категории"]').click();`);
  assert.equal(
    await js('document.querySelector("[data-cell=A1]").textContent'),
    'category_id',
  );
  await js(`document.querySelector('[data-sheet="Практика"]').click();
    document.querySelector('[data-cell=I2]').click();
    const f = document.querySelector('#formula'); f.value = '=ИНДЕКС('; f.dispatchEvent(new Event('input', {bubbles:true}));`);
  const start = Date.now();
  window.close();
  await wait(() => window.isDestroyed());
  console.log('Immediate dirty close:', Date.now() - start, 'ms');
  await restoreSheets();
  window = BrowserWindow.getAllWindows()[0];
  await ready();
  assert.equal(
    await js('document.querySelector("#formula").value'),
    '=ИНДЕКС(',
  );
  // A new input must not block on disk. Its durability is acknowledged separately.
  await js(`document.querySelector('#cancel').click();
    document.querySelector('#formula').value = '=42';
    document.querySelector('#formula').dispatchEvent(new Event('input', {bubbles:true}));
    document.querySelector('#formula-bar button[type=submit]').click();`);
  await wait(() =>
    recoverySnapshots(dir).some(snapshot =>
      snapshot.document.cells.some(
        cell => cell.address === 'I2' && cell.input?.formula === '=42',
      ),
    ),
  );
  const recovery = path.join(dir, 'sheet-recovery');
  await fs.rename(recovery, recovery + '-backup');
  await fs.writeFile(recovery, 'Unavailable');
  let prompts = 0;
  dialog.showMessageBoxSync = () => {
    prompts++;
    return 0;
  };
  window.close();
  await wait(() => prompts === 1);
  assert.equal(window.isDestroyed(), false);
  console.log(
    'Selection, sheet switching, immediate-close recovery and failed-write protection passed',
  );
  app.exit(0);
}
setTimeout(() => app.exit(1), 45000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
