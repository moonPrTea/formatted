const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {setup} = require('../build/electron/main.js');
const {openSheets} = require('../build/electron/sheets.js');

async function run() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'formatted-errors-'));
  app.setPath('userData', dir);
  await app.whenReady();
  await setup();
  openSheets();
  const window = BrowserWindow.getAllWindows()[0];
  window.setIgnoreMouseEvents(true);
  window.webContents.setBackgroundThrottling(false);
  const errors = [];
  window.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });
  const evaluate = source => window.webContents.executeJavaScript(source);
  const wait = async condition => {
    const deadline = Date.now() + 5000;
    while (!(await condition())) {
      assert.ok(Date.now() < deadline, 'Condition timed out');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  await wait(() => evaluate('!!document.querySelector("[data-cell=A1]")'));
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand(
    'Emulation.setFocusEmulationEnabled',
    {enabled: true},
  );
  await evaluate(
    `window.trace = []; for (const type of ['pointerover','pointerout','pointerenter','pointerleave','focusin','focusout','scroll','blur','resize']) document.addEventListener(type, e => { window.trace.push([type, e.target.id || e.target.dataset?.cell || e.target.tagName, Math.round(performance.now())]); if(window.trace.length > 60) window.trace.shift(); }, true)`,
  );
  const focus = async () => {
    window.focus();
    await wait(() => window.isFocused());
  };
  const click = async selector => {
    await focus();
    return evaluate(
      `document.querySelector(${JSON.stringify(selector)}).click()`,
    );
  };
  const write = async (cell, value) => {
    await click(`[data-cell="${cell}"]`);
    await evaluate(
      `(() => {const f=document.querySelector('#formula'); f.value=${JSON.stringify(value)}; f.dispatchEvent(new Event('input',{bubbles:true})); f.form.requestSubmit();})()`,
    );
  };
  const hover = async selector => {
    await focus();
    if (selector.startsWith('[data-cell')) {
      await window.webContents.debugger.sendCommand(
        'Input.dispatchMouseEvent',
        {type: 'mouseMoved', x: 5, y: 5},
      );
    }
    const point = await evaluate(
      `(async () => {
        const e=document.querySelector(${JSON.stringify(selector)});
        if(e.matches('[data-cell]')) e.scrollIntoView({block:'nearest',inline:'nearest'});
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const r=e.getBoundingClientRect();
        const grid=e.closest('#grid-scroll'), g=grid?.getBoundingClientRect();
        const left=Math.max(r.left,g ? g.left : 0), top=Math.max(r.top,g ? g.top : 0);
        const right=Math.min(r.right,g ? g.left+grid.clientWidth : innerWidth);
        const bottom=Math.min(r.bottom,g ? g.top+grid.clientHeight : innerHeight);
        if(right<=left || bottom<=top) throw new Error('Hover target is outside the viewport');
        const x=(left+right)/2, y=(top+bottom)/2;
        if(!e.contains(document.elementFromPoint(x,y))) throw new Error('Hover target is obscured');
        return {x,y};
      })()`,
    );
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      ...point,
    });
  };
  const visible = () =>
    evaluate('!document.querySelector("#cell-error-tooltip").hidden');
  const text = () =>
    evaluate('document.querySelector("#cell-error-tooltip").textContent');
  await write('I2', '=ИНДЕКС(B2;2;2);I3');
  await click('[data-cell="H2"]');
  await hover('[data-cell="I2"]');
  await wait(visible);
  assert.match(await text(), /I2: #PARSE!/);
  assert.match(await text(), /Точка с запятой/);
  await fs.writeFile(
    path.join(dir, 'parse-ru.png'),
    (await window.webContents.capturePage()).toPNG(),
  );
  await hover('#cell-error-tooltip');
  await new Promise(resolve => setTimeout(resolve, 180));
  if (!(await visible()))
    console.log(
      'Tooltip transfer diagnostics:',
      await evaluate('window.trace'),
    );
  assert.equal(await visible(), true);
  window.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Escape'});
  window.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Escape'});
  await wait(async () => !(await visible()));
  await evaluate('document.querySelector("[data-cell=I2]").focus()');
  await wait(visible);
  assert.equal(
    await evaluate(
      'document.querySelector("[data-cell=I2]").getAttribute("aria-describedby")',
    ),
    'cell-error-tooltip',
  );
  console.log('1. Hover, accessible focus, pointer transfer and Escape');
  for (const [formula, code] of [
    ['=ИНДЕКС(B2;2;2)', '#REF!'],
    ['=ПОИСКПОЗ("missing";B2:B5;0)', '#N/A'],
    ['=1/0', '#DIV/0!'],
    ['=I2', '#CYCLE!'],
    ['=UNKNOWN(1)', '#NAME?'],
    ['=1+"text"', '#VALUE!'],
    ['=ПОИСКПОЗ(1;A1:A3;1)', '#UNSUPPORTED!'],
  ]) {
    await write('I2', formula);
    await click('[data-cell="H2"]');
    await click('[data-cell="I2"]');
    await wait(visible);
    assert.ok((await text()).includes(code));
  }
  await write('I3', '=1/0');
  await click('[data-cell="I2"]');
  window.webContents.sendInputEvent({type: 'keyDown', keyCode: 'F2'});
  window.webContents.sendInputEvent({type: 'keyUp', keyCode: 'F2'});
  await wait(() => evaluate('!!document.querySelector("#cell-editor")'));
  await hover('[data-cell="I3"]');
  assert.equal(await visible(), false);
  window.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Escape'});
  window.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Escape'});
  await wait(() => evaluate('!document.querySelector("#cell-editor")'));
  await click('[data-language="en"]');
  await click('[data-cell="H2"]');
  await click('[data-cell="I2"]');
  await wait(visible);
  assert.match(await text(), /not supported/);
  await write('I2', '="#PARSE!"');
  await hover('[data-cell="I2"]');
  assert.equal(await visible(), false);
  assert.equal(
    await evaluate(
      'document.querySelector("[data-cell=I2]").hasAttribute("data-error")',
    ),
    false,
  );
  console.log('2. Error categories, RU/EN and clearing stale explanations');
  await write('I99', '=1/0');
  for (const [width, zoom] of [
    [1200, 1],
    [640, 1],
    [640, 2],
  ]) {
    window.setContentSize(width, 720);
    console.log('Tooltip viewport:', width, zoom);
    window.webContents.setZoomFactor(zoom);
    await click('[data-cell="H99"]');
    await evaluate(
      'document.querySelector("[data-cell=I99]").scrollIntoView({block:"end",inline:"end"})',
    );
    await evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
    await hover('[data-cell="I99"]');
    await wait(visible).catch(async error => {
      console.log(
        'Tooltip diagnostics:',
        await evaluate(`({
        trace: window.trace, focus: document.hasFocus(),
        cell: document.querySelector('[data-cell=I99]').getBoundingClientRect().toJSON(),
        popup: document.querySelector('#cell-error-tooltip').outerHTML
      })`),
      );
      throw error;
    });
    assert.equal(
      await evaluate(
        '(() => {const r=document.querySelector("#cell-error-tooltip").getBoundingClientRect(); return r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight;})()',
      ),
      true,
    );
    await fs.writeFile(
      path.join(dir, `tooltip-${width}-${zoom}.png`),
      (await window.webContents.capturePage()).toPNG(),
    );
    await evaluate('document.querySelector("#grid-scroll").scrollTop=0');
    await wait(async () => !(await visible()));
  }
  assert.deepEqual(errors, []);
  console.log('3. Viewport edges, scrolling and 200% zoom; screenshots:', dir);
  app.exit(0);
}
setTimeout(() => app.exit(1), 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
