import {app, BrowserWindow} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function run() {
  let stage = 'startup';
  const profile = await fs.mkdtemp(
    path.join(os.tmpdir(), 'formatted-controls-'),
  );
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  const deadline = setTimeout(() => {
    console.error('Shared controls test exceeded 30 seconds: ' + stage);
    app.exit(1);
  }, 30000);
  try {
    await app.whenReady();
    console.log('Controls: Electron ready');
    const window = new BrowserWindow({
      show: false,
      width: 1024,
      height: 720,
      webPreferences: {
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
    const wait = async (code, read = evaluate) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await read(code)) return;
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      throw new Error(`Condition timed out: ${code}\n${errors.join('\n')}`);
    };
    const key = async value => {
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: value,
      });
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: value,
      });
    };
    const click = selector =>
      evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const chooseTheme = async mode => {
      await click(`[data-theme-choice="${mode}"]`);
      await wait(`localStorage.getItem('formatted.theme') === '${mode}' &&
        document.querySelector('[data-theme-choice="${mode}"]').getAttribute('aria-pressed') === 'true'`);
      await wait(
        '!document.documentElement.hasAttribute("data-theme-switching")',
      );
    };
    const systemTheme = mode =>
      window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{name: 'prefers-color-scheme', value: mode}],
      });
    const menuOpen =
      'document.querySelector("#difficulty").getAttribute("aria-expanded") === "true"';
    const directory = path.resolve(
      process.env.UI_TEST_ARTIFACTS ?? '.ui-test-artifacts',
    );
    stage = 'load fixture';
    await window.loadFile(path.join(directory, 'controls-build/index.html'));
    console.log('Controls: fixture loaded');
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand(
      'Emulation.setFocusEmulationEnabled',
      {enabled: true},
    );
    stage = 'button and keyboard';
    await wait('document.body.dataset.ready === "true"');
    assert.deepEqual(
      await evaluate(`(() => {
      const button = document.querySelector('#action');
      const style = getComputedStyle(button);
      const icon = button.querySelector('svg').getBoundingClientRect();
      return [style.fontSize, style.paddingLeft, style.gap,
        button.getBoundingClientRect().height, icon.width, icon.height];
    })()`),
      ['14px', '16px', '8px', 40, 16, 16],
    );
    await evaluate(
      'document.querySelector("#action svg").dispatchEvent(new MouseEvent("click", {bubbles:true, cancelable:true}))',
    );
    await evaluate('document.querySelector("#action").focus()');
    await key('Enter');
    await wait('document.body.dataset.presses === "2"');
    assert.equal(await evaluate('document.body.dataset.actions'), '2');
    await click('#disabled-action');
    assert.equal(await evaluate('document.body.dataset.actions'), '2');

    stage = 'select menu';
    await click('#difficulty');
    await wait(menuOpen);
    await wait('document.activeElement?.getAttribute("role") === "option"');
    assert.equal(
      await evaluate('document.querySelectorAll(".select-option").length'),
      3,
    );
    await key('ArrowDown');
    await key('Enter');
    await wait('document.querySelector("#source-select").value === "medium"');
    await wait(`!(${menuOpen})`);
    assert.equal(await evaluate('document.body.dataset.changes'), '1');
    stage = 'select menu';
    await click('#difficulty');
    await wait(menuOpen);
    await wait('document.activeElement?.getAttribute("role") === "option"');
    assert.equal(
      await evaluate(
        'document.querySelector("[role=option][data-key=hard]").getAttribute("aria-disabled")',
      ),
      'true',
    );
    await key('Escape');
    await wait(`!(${menuOpen})`);
    await wait('document.activeElement?.id === "difficulty"');
    stage = 'select menu';
    await click('#difficulty');
    await wait(menuOpen);
    await wait('document.activeElement?.getAttribute("role") === "option"');
    await key('Tab');
    await wait(`!(${menuOpen})`);
    await wait('document.activeElement?.id === "after"');

    await evaluate(
      'document.querySelector("#source-select").add(new Option("Expert", "expert"))',
    );
    await click('#difficulty');
    await wait('document.querySelectorAll(".select-option").length === 4');
    await evaluate('document.dispatchEvent(new Event("controls-close"))');
    await wait(`!(${menuOpen})`);
    await evaluate(
      'const select = document.querySelector("#source-select"); select.value = "expert"; select.dispatchEvent(new Event("change", {bubbles:true}))',
    );
    await wait(
      'document.querySelector("#difficulty").textContent.includes("Expert")',
    );
    await evaluate('document.querySelector("#source-select").disabled = true');
    await wait('document.querySelector("#difficulty").disabled');
    await evaluate('document.querySelector("#source-select").disabled = false');
    await wait('!document.querySelector("#difficulty").disabled');

    for (const mode of ['light', 'dark']) {
      await chooseTheme(mode);
      await wait(`document.documentElement.dataset.theme === '${mode}'`);
      for (const width of [390, 1024]) {
        window.setContentSize(width, 720);
        await click('#difficulty');
        await wait(menuOpen);
        await wait(
          '(() => {const menu = document.querySelector(".select-menu").getBoundingClientRect(); return menu.width > 0 && menu.left >= 0 && menu.right <= innerWidth && menu.top >= 0 && menu.bottom <= innerHeight})()',
        );
        assert.equal(
          await evaluate('document.documentElement.scrollWidth <= innerWidth'),
          true,
        );
        assert.notEqual(
          await evaluate(
            'getComputedStyle(document.querySelector("#action")).color',
          ),
          await evaluate(
            'getComputedStyle(document.querySelector("#action")).backgroundColor',
          ),
        );
        await evaluate(`Promise.allSettled(document.getAnimations()
          .filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime))
          .map(animation => animation.finished))`);
        assert.notEqual(
          await evaluate(
            'getComputedStyle(document.querySelector("#difficulty")).color',
          ),
          await evaluate(
            'getComputedStyle(document.querySelector("#difficulty")).backgroundColor',
          ),
        );
        await fs.writeFile(
          path.join(profile, `${mode}-${width}.png`),
          (await window.webContents.capturePage()).toPNG(),
        );
        await key('Escape');
        await wait(`!(${menuOpen})`);
        assert.equal(
          await evaluate(`(() => {
          const group = document.querySelector('.appearance-modes');
          const bounds = group.getBoundingClientRect();
          return [...group.querySelectorAll('button')].every(button => {
            const rect = button.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right && rect.height === 40;
          });
        })()`),
          true,
        );
        if (width === 390)
          await fs.writeFile(
            path.join(profile, `${mode}-theme.png`),
            (await window.webContents.capturePage()).toPNG(),
          );
      }
    }

    stage = 'system theme';
    await systemTheme('dark');
    await chooseTheme('light');
    assert.equal(
      await evaluate('document.documentElement.dataset.theme'),
      'light',
    );
    await chooseTheme('system');
    await wait('document.documentElement.dataset.theme === "dark"');
    await systemTheme('light');
    await wait('document.documentElement.dataset.theme === "light"');

    stage = 'saved theme';
    await chooseTheme('dark');
    const loaded = new Promise(resolve =>
      window.webContents.once('did-finish-load', resolve),
    );
    window.reload();
    await loaded;
    await wait('document.body.dataset.ready === "true"');
    await wait('document.documentElement.dataset.theme === "dark"');
    assert.equal(
      await evaluate(
        'document.querySelector("[data-theme-choice=dark]").getAttribute("aria-pressed")',
      ),
      'true',
    );

    stage = 'theme across windows';
    const second = new BrowserWindow({
      show: false,
      webPreferences: {sandbox: true},
    });
    second.webContents.setBackgroundThrottling(false);
    await second.loadFile(path.join(directory, 'controls-build/index.html'));
    const secondRead = code => second.webContents.executeJavaScript(code);
    await wait('document.documentElement.dataset.theme === "dark"', secondRead);
    await chooseTheme('light');
    await wait(
      'document.documentElement.dataset.theme === "light"',
      secondRead,
    );
    second.destroy();

    stage = 'keyboard theme choice';
    await evaluate(
      'document.querySelector("[data-theme-choice=dark]").focus()',
    );
    await key('Enter');
    await wait(
      'localStorage.getItem("formatted.theme") === "dark" && document.documentElement.dataset.theme === "dark"',
    );
    assert.deepEqual(errors, []);
    console.log(
      `Shared controls, spacing, saved and system themes, cross-window sync and keyboard passed: ${profile}`,
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    clearTimeout(deadline);
  }
}
run().catch(error => {
  console.error(error);
  app.exit(1);
});
