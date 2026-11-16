const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const {existsSync} = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const compiled = name => {
  const file = path.resolve(`build/electron/${name}.cjs`);
  return existsSync(file) ? file : file.replace(/\.cjs$/, '.js');
};
const {setup} = require(compiled('main'));
const {openSheets} = require(compiled('sheets'));

async function run() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'formatted-sheet-appearance-'),
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
  await openSheets({kind: 'blank'});
  const editor = BrowserWindow.getAllWindows()[0];
  observe(editor);
  const js = (window, code) => window.webContents.executeJavaScript(code);
  const wait = async condition => {
    const deadline = Date.now() + 10000;
    while (!(await condition())) {
      assert.ok(Date.now() < deadline, 'Sheet appearance did not settle');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  const frame = window =>
    js(
      window,
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
  const mode = async (window, value) => {
    await wait(() =>
      js(window, `document.documentElement.dataset.theme === '${value}'`),
    );
    await wait(() =>
      Promise.resolve(
        window.getBackgroundColor().toLowerCase() ===
          (value === 'dark' ? '#09090b' : '#fafafa'),
      ),
    );
    await frame(window);
  };
  const preference = async value => {
    await js(
      editor,
      `localStorage.setItem('formatted.theme', '${value}'); window.dispatchEvent(new StorageEvent('storage', {key:'formatted.theme'}));`,
    );
  };
  const system = async value => {
    await editor.webContents.debugger.sendCommand(
      'Emulation.setEmulatedMedia',
      {features: [{name: 'prefers-color-scheme', value}]},
    );
  };
  await wait(() => js(editor, '!!document.querySelector("[data-cell=A1]")'));
  editor.webContents.debugger.attach('1.3');
  await system('dark');
  await mode(editor, 'dark');
  await system('light');
  await mode(editor, 'light');
  await preference('dark');
  await mode(editor, 'dark');
  await js(editor, 'document.querySelector("#function-wizard").click()');
  await wait(() => Promise.resolve(BrowserWindow.getAllWindows().length === 2));
  const wizard = BrowserWindow.getAllWindows().find(
    window => window !== editor,
  );
  observe(wizard);
  await wait(() => js(wizard, '!!document.querySelector("[data-argument]")'));
  await wait(() => Promise.resolve(wizard.isVisible()));
  await mode(wizard, 'dark');
  const brightSurfaces = `(() => {
    const context = document.createElement('canvas').getContext('2d', {willReadFrequently:true});
    return [...document.querySelectorAll('body *')].filter(element => {
      if (!element.checkVisibility() || element.closest('svg')) return false;
      const bounds = element.getBoundingClientRect();
      if (bounds.width < 8 || bounds.height < 8) return false;
      context.clearRect(0,0,1,1);
      context.fillStyle = getComputedStyle(element).backgroundColor;
      context.fillRect(0,0,1,1);
      const [r,g,b,a] = context.getImageData(0,0,1,1).data;
      return a > 230 && Math.min(r,g,b) > 220;
    }).map(element => element.tagName + '#' + element.id);
  })()`;
  for (const theme of ['dark', 'light', 'dark']) {
    await preference(theme);
    for (const window of [editor, wizard]) {
      await mode(window, theme);
      if (theme === 'dark')
        assert.deepEqual(await js(window, brightSurfaces), []);
      await fs.writeFile(
        path.join(
          directory,
          `${window === editor ? 'sheet' : 'wizard'}-${theme}.png`,
        ),
        (await window.webContents.capturePage()).toPNG(),
      );
    }
    for (let turn = 0; turn < 3; turn++) {
      editor.focus();
      await frame(editor);
      wizard.focus();
      await frame(wizard);
      assert.equal(editor.getBackgroundColor(), wizard.getBackgroundColor());
    }
  }
  await js(editor, 'window.windowAppearance.setMode("invalid")');
  await mode(editor, 'dark');
  await preference('light');
  await mode(editor, 'light');
  await mode(wizard, 'light');
  await js(wizard, 'document.querySelector("#cancel").click()');
  await wait(() => Promise.resolve(wizard.isDestroyed()));
  await js(editor, 'document.querySelector("#function-wizard").click()');
  await wait(() => Promise.resolve(BrowserWindow.getAllWindows().length === 2));
  const reopened = BrowserWindow.getAllWindows().find(
    window => window !== editor,
  );
  observe(reopened);
  await wait(() => js(reopened, '!!document.querySelector("[data-argument]")'));
  await mode(reopened, 'light');
  assert.deepEqual(errors, []);
  console.log(
    `Sheet system themes, native backgrounds, cross-window changes and persisted startup passed: ${directory}`,
  );
  app.exit(0);
}

setTimeout(() => app.exit(1), 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
