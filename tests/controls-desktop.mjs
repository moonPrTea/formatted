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
    const wait = async code => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(code)) return;
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
      await evaluate(
        `document.documentElement.className = '${mode}'; document.documentElement.dataset.theme = '${mode}'`,
      );
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
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      `Shared buttons, select changes, keyboard, disabled state and responsive themes passed: ${profile}`,
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
