const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const recoverySnapshots = require('./recovery-helper.cjs');

if (!process.argv[2]) {
  const {spawnSync} = require('node:child_process');
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'formatted-restart-'),
  );
  for (const mode of ['write', 'read']) {
    const result = spawnSync(
      require('electron'),
      [__filename, mode, directory],
      {encoding: 'utf8', timeout: 45000},
    );
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    assert.equal(result.status, 0, `${mode} process failed`);
    assert.ok(
      result.stdout.includes(`${mode} complete`),
      `${mode} did not finish its assertions`,
    );
  }
  console.log('Recovery survives a real application restart:', directory);
} else {
  const {app, BrowserWindow} = require('electron');
  const {setup} = require('../../build/formatted/electron/main.js');
  const {
    openSheets,
    restoreSheets,
  } = require('../../build/sheets/electron/sheets.js');
  const mode = process.argv[2],
    directory = process.argv[3];
  app.setPath('userData', directory);
  app.setPath('sessionData', directory);
  const js = (window, code) => window.webContents.executeJavaScript(code);
  const wait = async condition => {
    const until = Date.now() + 15000;
    while (!(await condition())) {
      assert.ok(Date.now() < until, 'Timed out');
      await new Promise(r => setTimeout(r, 40));
    }
  };
  const editors = () =>
    BrowserWindow.getAllWindows().filter(w =>
      w.webContents.getURL().includes('/sheets/index.html'),
    );
  const ready = window =>
    wait(() => js(window, '!!document.querySelector("[data-sheet]")'));
  async function run() {
    await app.whenReady();
    await setup();
    if (mode === 'write') {
      openSheets();
      await wait(() => editors().length === 1);
      const first = editors()[0];
      await ready(first);
      await js(
        first,
        `(() => { const f = document.querySelector('#formula'); f.value = '=75'; f.dispatchEvent(new Event('input')); document.querySelector('#formula-bar button[type=submit]').click(); window.sheetDesktop.newDocument('en'); })()`,
      );
      await wait(() => editors().length === 2);
      const second = editors().find(w => w !== first);
      await ready(second);
      await js(
        second,
        `(() => { const f = document.querySelector('#formula'); f.value = '=INDEX('; f.dispatchEvent(new Event('input')); })()`,
      );
      await wait(() =>
        recoverySnapshots(directory).some(
          snapshot =>
            snapshot.language === 'en' && snapshot.draft?.text === '=INDEX(',
        ),
      );
      assert.equal(
        fs.readdirSync(path.join(directory, 'sheet-recovery')).length,
        2,
      );
      console.log('write complete');
      app.quit();
    } else {
      await restoreSheets();
      await wait(() => editors().length === 2);
      for (const window of editors()) await ready(window);
      const values = await Promise.all(
        editors().map(w =>
          js(
            w,
            `({language: document.documentElement.lang, formula: document.querySelector('#formula').value, h2: document.querySelector('[data-cell=H2]').textContent})`,
          ),
        ),
      );
      assert.ok(values.some(v => v.h2 === '75' && v.language === 'ru'));
      assert.ok(
        values.some(v => v.formula === '=INDEX(' && v.language === 'en'),
      );
      console.log('read complete');
      app.quit();
    }
  }
  setTimeout(() => app.exit(1), 35000);
  run().catch(error => {
    console.error(error);
    app.exit(1);
  });
}
