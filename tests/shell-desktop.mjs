import {app, BrowserWindow, nativeTheme} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setup} from '../build/electron/main.js';

const directory = mkdtempSync(path.join(os.tmpdir(), 'formatted-shell-'));
app.setPath('userData', directory);
app.setPath('sessionData', directory);

async function run() {
  await app.whenReady();
  nativeTheme.themeSource = 'light';
  await setup();
  const window = new BrowserWindow({
    show: false,
    width: 1440,
    height: 960,
    webPreferences: {
      preload: path.resolve('build/electron/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.webContents.setBackgroundThrottling(false);
  const errors = [];
  window.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });
  const evaluate = async code => {
    try {
      return await window.webContents.executeJavaScript(code);
    } catch (error) {
      throw new Error(`${code}\n${error.message}\n${errors.join('\n')}`);
    }
  };
  const wait = async code => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await (typeof code === 'function' ? code() : evaluate(code))) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Condition timed out: ${code}\n${errors.join('\n')}`);
  };
  const click = selector =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const capture = async name => {
    await evaluate(`Promise.allSettled(document.getAnimations()
      .filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime))
      .map(animation => animation.finished))`);
    await fs.writeFile(
      path.join(directory, name + '.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
  };
  await window.loadURL('forma://app/index.html');
  await wait('document.querySelector("h1")?.textContent === "Главная"');
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand(
    'Emulation.setFocusEmulationEnabled',
    {enabled: true},
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".dashboard-modules .card").length',
    ),
    3,
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".learning-row").length'),
    2,
  );
  assert.equal(
    await evaluate('document.querySelector("#toast").checkVisibility()'),
    false,
  );
  await click('[data-action=toggle-sidebar]');
  await wait(
    'document.querySelector("[data-action=toggle-sidebar]").getAttribute("aria-expanded") === "false"',
  );
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector(".sidebar")).display',
    ),
    'none',
  );
  window.setContentSize(1200, 360);
  await wait('innerWidth === 1200 && innerHeight === 360');
  await evaluate('document.querySelector(".rail [data-view=history]").focus()');
  await wait(`(() => {
    const rail = document.querySelector('.rail');
    const button = document.querySelector('.rail [data-view=history]');
    const bounds = button.getBoundingClientRect();
    const viewport = rail.getBoundingClientRect();
    return viewport.width === 64 && bounds.width === 40 &&
      bounds.top >= viewport.top && bounds.bottom <= viewport.bottom &&
      document.documentElement.scrollHeight <= innerHeight;
  })()`);
  await click('.rail [data-view=history]');
  await wait('document.querySelector("#main").dataset.screen === "history"');
  await click('.rail [data-view=home]');
  await wait('document.querySelector("h1")?.textContent === "Главная"');
  await capture('collapsed-short-window');
  window.setContentSize(1440, 960);
  await wait('innerWidth === 1440 && innerHeight === 960');
  await click('[data-action=toggle-sidebar]');
  await click('.nav-group-heading');
  await wait('document.querySelector(".nav-group-items").hidden');
  await click('.nav-group-heading');
  await click('.dashboard-modules [data-view=generator]');
  await wait('!!document.querySelector("#generator-form")');
  await click('[data-action=nav-back]');
  await wait('document.querySelector("h1")?.textContent === "Главная"');

  for (const mode of ['light', 'dark']) {
    await click('.window-status [aria-label=Настройки]');
    await wait('!!document.querySelector(".modal__dialog")');
    await click(`[data-theme-choice=${mode}]`);
    await wait(
      `document.documentElement.dataset.theme === '${mode}' && !document.documentElement.hasAttribute('data-theme-switching')`,
    );
    await wait(() =>
      window
        .getBackgroundColor()
        .toLowerCase()
        .endsWith(mode === 'dark' ? '09090b' : 'fafafa'),
    );
    await click('.modal__close-trigger');
    await wait('!document.querySelector(".modal__dialog")');
    for (const width of [1440, 900, 390]) {
      window.setContentSize(width, 900);
      await wait(`innerWidth === ${width}`);
      assert.equal(
        await evaluate(`(() => {
        const main = document.querySelector('#main');
        const style = getComputedStyle(main);
        const rect = main.getBoundingClientRect();
        return document.documentElement.scrollWidth <= innerWidth && main.scrollWidth <= main.clientWidth &&
          parseFloat(style.paddingLeft) >= 16 && rect.right <= innerWidth;
      })()`),
        true,
        `Page fits ${mode}/${width}`,
      );
      await capture(`${mode}-${width}`);
    }
    await click('.window-status [aria-label=Настройки]');
    await wait('!!document.querySelector(".modal__dialog")');
    await capture(`${mode}-settings-390`);
    assert.equal(
      await evaluate(`(() => {
      const dialog = document.querySelector('.modal__dialog').getBoundingClientRect();
      const panel = document.querySelector('.environment-panel');
      return dialog.left >= 0 && dialog.right <= innerWidth && dialog.top >= 0 && dialog.bottom <= innerHeight &&
        panel.scrollWidth <= panel.clientWidth;
    })()`),
      true,
    );
    await click('.modal__close-trigger');
    await wait('!document.querySelector(".modal__dialog")');
  }
  window.setContentSize(1440, 960);
  await wait('innerWidth === 1440');
  const point = await evaluate(`(() => {
    const button = document.querySelector('.dashboard-modules .button--primary');
    const rect = button.getBoundingClientRect();
    return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
  })()`);
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    ...point,
  });
  await wait(
    'document.querySelector(".dashboard-modules .button--primary").hasAttribute("data-hovered")',
  );
  assert.notEqual(
    await evaluate(
      'getComputedStyle(document.querySelector(".dashboard-modules .button--primary")).color',
    ),
    await evaluate(
      'getComputedStyle(document.querySelector(".dashboard-modules .button--primary")).backgroundColor',
    ),
  );
  await capture('primary-hover');
  assert.deepEqual(errors, []);
  console.log(
    `Dashboard, grouped navigation, settings, responsive themes and hover passed: ${directory}`,
  );
  app.exit(0);
}
setTimeout(() => {
  console.error('Shell UI test exceeded 60 seconds');
  app.exit(1);
}, 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
