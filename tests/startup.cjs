const {app} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
require('../build/electron/main.js');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formatted-startup-'));
app.setPath('userData', directory);
const deadline = setTimeout(() => {
  console.error('The configured app entry did not create a working window');
  app.exit(1);
}, 15000);

app.once('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      assert.equal(window.webContents.getURL(), 'forma://app/index.html');
      assert.match(
        await window.webContents.executeJavaScript(
          'document.querySelector("h1").textContent',
        ),
        /^(От данных - к пониманию|Главная)$/,
      );
      assert.equal(
        await window.webContents.executeJavaScript(
          'typeof window.desktop.openCalcLesson',
        ),
        'function',
      );
      assert.equal(window.isVisible(), true);
      clearTimeout(deadline);
      console.log(
        'Configured application entry creates a visible working window',
      );
      app.quit();
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
});
const entry = require('../package.json').main;
import(pathToFileURL(path.resolve(__dirname, '..', entry)).href).catch(
  error => {
    console.error(error);
    app.exit(1);
  },
);
