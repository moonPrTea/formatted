import {app, BrowserWindow} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setup} from '../build/electron/main.js';

async function run() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'formatted-hover-'),
  );
  app.setPath('userData', directory);
  await app.whenReady();
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
  await window.loadURL('forma://app/index.html');
  window.webContents.debugger.attach('1.3');
  const js = code => window.webContents.executeJavaScript(code);
  const frame = () =>
    js(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
  const click = async selector => {
    await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await frame();
  };
  const mouse = (type, point, extra = {}) =>
    window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type,
      ...point,
      ...extra,
    });
  const capture = async name => {
    await js(`Promise.allSettled(document.getAnimations()
      .filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime))
      .map(animation => animation.finished))`);
    await frame();
    await fs.writeFile(
      path.join(directory, `${name}.png`),
      (await window.webContents.capturePage()).toPNG(),
    );
  };
  const colorState = selector =>
    js(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    const style = getComputedStyle(button);
    const context = document.createElement('canvas').getContext('2d');
    const rgb = color => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = values => values.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const background = rgb(style.backgroundColor);
    const a = luminance(background), b = luminance(rgb(style.color));
    return {background, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), hovered: button.matches(':hover'), label: button.textContent.trim()};
  })()`);
  const checkBlue = async (selector, state) => {
    const result = await colorState(selector);
    assert.ok(
      result.background[2] > result.background[0] + 60,
      JSON.stringify({state, ...result}),
    );
    assert.ok(result.contrast >= 4.5, JSON.stringify({state, ...result}));
    assert.ok(result.label.length > 0);
  };
  for (const theme of ['dark', 'light']) {
    await js(
      `localStorage.setItem('formatted.theme', '${theme}'); window.dispatchEvent(new StorageEvent('storage', {key:'formatted.theme'}));`,
    );
    await click('.sidebar [data-view=home]');
    const selector = '.dashboard-modules .button--primary';
    await mouse('mouseMoved', {x: 5, y: 5});
    await frame();
    await checkBlue(selector, `${theme}: normal`);
    const point = await js(`(() => {
      const rect = document.querySelector('${selector}').getBoundingClientRect();
      return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    })()`);
    await mouse('mouseMoved', point);
    await js('new Promise(resolve => setTimeout(resolve, 160))');
    assert.equal((await colorState(selector)).hovered, true);
    await checkBlue(selector, `${theme}: hover`);
    await capture(`home-hover-${theme}`);
    await mouse('mousePressed', point, {
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await frame();
    await checkBlue(selector, `${theme}: pressed`);
    await mouse('mouseMoved', {x: 5, y: 5}, {buttons: 1});
    await mouse('mouseReleased', {x: 5, y: 5}, {button: 'left', clickCount: 1});
    await click('.sidebar [data-view=lesson]');
    for (const step of [1, 3]) {
      await click(`[data-action=lesson-step][data-step="${step}"]`);
      await click('[data-workspace=lesson] [data-ui-value=task]');
      assert.equal(
        await js(`(() => {
        const panel = document.querySelector('.lesson-body .workspace-section');
        const children = [...panel.children].filter(child => child.checkVisibility());
        return children.every((child, index) => !index || child.getBoundingClientRect().top - children[index-1].getBoundingClientRect().bottom <= 20);
      })()`),
        true,
        `Step ${step + 1}: compact content gaps`,
      );
      await capture(`lesson-${step + 1}-${theme}`);
    }
    await click('[data-workspace=lesson] [data-ui-value=check]');
    assert.equal(
      await js(
        'document.querySelector(".lesson-body").getBoundingClientRect().height < 360',
      ),
      true,
      'Check panel fits its content',
    );
    await capture(`lesson-check-${theme}`);
  }
  assert.deepEqual(errors, []);
  console.log(
    `Pointer hover, pressed states, text contrast and compact Calc lessons passed: ${directory}`,
  );
  app.exit(0);
}

setTimeout(() => app.exit(1), 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
