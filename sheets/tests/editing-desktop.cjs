const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {setup} = require('../../build/electron/main.js');
const {openSheets} = require('../../build/sheets/electron/sheets.js');

async function run() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'formatted-editing-'),
  );
  app.setPath('userData', directory);
  await app.whenReady();
  await setup();
  openSheets();
  const window = BrowserWindow.getAllWindows()[0];
  const evaluate = code => window.webContents.executeJavaScript(code);
  const wait = async condition => {
    const deadline = Date.now() + 5000;
    while (!(await condition())) {
      assert.ok(Date.now() < deadline, 'Condition timed out');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  const click = selector =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const key = async (keyCode, modifiers = []) => {
    window.focus();
    window.webContents.sendInputEvent({type: 'keyDown', keyCode, modifiers});
    window.webContents.sendInputEvent({type: 'keyUp', keyCode, modifiers});
    await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
  };
  const type = text => window.webContents.insertText(text);
  await wait(() => evaluate('!!document.querySelector("[data-cell=A1]")'));
  await click('[data-cell="J2"]');
  await key('=');
  await type('ИНД');
  assert.equal(await evaluate('document.activeElement.id'), 'cell-editor');
  assert.equal(
    await evaluate('document.querySelector("#cell-editor").value'),
    '=ИНД',
  );
  assert.equal(
    await evaluate('document.querySelector("#formula").value'),
    '=ИНД',
  );
  assert.equal(
    await evaluate('document.querySelector("#formula-hint").hidden'),
    false,
  );
  await key('Tab');
  const shortcutMutations = await evaluate(`(async () => {
    const field = document.activeElement;
    const popup = document.querySelector('#formula-hint');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const mutations = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(popup, {subtree: true, childList: true, attributes: true});
    for (const key of ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Fn', ' ']) {
      const options = {key, bubbles: true, cancelable: true, ctrlKey: key === ' '};
      const down = new KeyboardEvent('keydown', options);
      field.dispatchEvent(down);
      if (down.defaultPrevented) throw new Error('Layout shortcut was intercepted');
      field.dispatchEvent(new KeyboardEvent('keyup', options));
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    observer.disconnect();
    return mutations.length;
  })()`);
  assert.equal(shortcutMutations, 0, 'Layout keys must not rebuild hints');
  assert.equal(
    await evaluate('document.querySelector("#cell-editor").value'),
    '=ИНДЕКС(',
  );
  await type('Категории.A2:A4;');
  assert.equal(
    await evaluate('document.querySelector("#formula-hint b").textContent'),
    '; Номер строки',
  );
  await fs.writeFile(
    path.join(directory, 'inline-hint.png'),
    (await window.webContents.capturePage()).toPNG(),
  );
  await type('2)');
  await key('Enter');
  assert.equal(
    await evaluate('document.querySelector("[data-cell=J2]").textContent'),
    '25',
  );
  await key('F2');
  await type('+1');
  await key('Escape');
  assert.equal(
    await evaluate('document.querySelector("[data-cell=J2]").textContent'),
    '25',
  );
  await key('F2');
  await type('+1');
  await key('Enter');
  assert.equal(
    await evaluate('document.querySelector("[data-cell=J2]").textContent'),
    '26',
  );
  await click('#undo');
  assert.equal(
    await evaluate('document.querySelector("[data-cell=J2]").textContent'),
    '25',
  );
  console.log(
    '1. Inline input, bilingual completion, arguments, Enter, F2, Escape and undo',
  );
  await evaluate(
    `const f=document.querySelector('#formula'); f.focus(); f.value='=ПОИСК'; f.setSelectionRange(6,6); f.dispatchEvent(new Event('input',{bubbles:true}));`,
  );
  assert.equal(
    await evaluate('document.querySelector("#cell-editor").value'),
    '=ПОИСК',
  );
  await click('#formula-hint button');
  assert.equal(
    await evaluate('document.querySelector("#formula").value'),
    '=ПОИСКПОЗ(',
  );
  await key('Escape');
  for (const [width, zoom] of [
    [640, 1],
    [640, 2],
    [1200, 1],
  ]) {
    window.setContentSize(width, 600);
    window.webContents.setZoomFactor(zoom);
    await click('[data-cell="A3"]');
    await key('=');
    await type('INDEX(');
    await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
    assert.equal(
      await evaluate(
        `(() => { const r=document.querySelector('#formula-hint').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight; })()`,
      ),
      true,
    );
    await fs.writeFile(
      path.join(directory, `hint-${width}-${zoom}.png`),
      (await window.webContents.capturePage()).toPNG(),
    );
    await key('Escape');
  }
  console.log(
    '2. Formula bar synchronization, mouse completion, narrow layouts and 200% zoom',
  );
  console.log('Screenshots:', directory);
  window.webContents.debugger.attach('1.3');
  const drag = async (from, to, cancel = false) => {
    const point = cell =>
      evaluate(
        `(() => {const r=document.querySelector('[data-cell="${cell}"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
      );
    await evaluate(
      'document.querySelector("#grid-scroll").scrollLeft=0;document.querySelector("#grid-scroll").scrollTop=0',
    );
    const a = await point(from),
      b = await point(to);
    for (const [type, p, buttons] of [
      ['mouseMoved', a, 0],
      ['mousePressed', a, 1],
      ['mouseMoved', b, 1],
      ['mouseReleased', b, 0],
    ]) {
      if (cancel && type === 'mouseReleased') await key('Escape');
      await window.webContents.debugger.sendCommand(
        'Input.dispatchMouseEvent',
        {type, ...p, button: 'left', buttons, clickCount: 1},
      );
    }
    await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
  };
  await click('[data-cell="J3"]');
  await key('=');
  await type('ИНДЕКС(');
  await click('[data-sheet="Категории"]');
  await drag('A2', 'A4');
  assert.equal(
    await evaluate('document.querySelector("#selection").textContent'),
    'Практика, J3',
  );
  assert.equal(
    await evaluate('document.querySelector("#formula").value'),
    "=ИНДЕКС('Категории'.A2:A4",
  );
  await type(';2)');
  await key('Enter');
  assert.equal(
    await evaluate('document.querySelector("[data-cell=J3]").textContent'),
    '25',
  );
  await click('[data-cell="J4"]');
  await key('=');
  await drag('G2', 'G2');
  assert.equal(
    await evaluate('document.querySelector("#cell-editor").value'),
    '=G2',
  );
  await key('Enter');
  assert.equal(
    await evaluate('document.querySelector("[data-cell=J4]").textContent'),
    '3',
  );
  console.log(
    '3. Direct cell and range references preserve the formula target across sheets',
  );
  await click('[data-cell="J5"]');
  await key('=');
  await type('ИНДЕКС(');
  await drag('A2', 'A4', true);
  assert.equal(
    await evaluate('document.querySelector("#formula").value'),
    '=ИНДЕКС(',
  );
  assert.equal(
    await evaluate('document.querySelector("#selection").textContent'),
    'Практика, J5',
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".range-cell").length'),
    0,
  );
  await key('Escape');
  await click('[data-cell="A10"]');
  await evaluate(
    `window.clip = new DataTransfer(); window.clip.setData('text/plain',${JSON.stringify('00123\t2\ntext\t4')}); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:window.clip}));`,
  );
  await key('Right', ['shift']);
  await key('Down', ['shift']);
  assert.equal(
    await evaluate('document.querySelectorAll(".selected-range").length'),
    4,
  );
  await evaluate(
    `window.clip = new DataTransfer(); document.activeElement.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,clipboardData:window.clip}));`,
  );
  await click('[data-cell="F10"]');
  await evaluate(
    `document.activeElement.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:window.clip}));`,
  );
  assert.equal(
    await evaluate('document.querySelector("[data-cell=F10]").textContent'),
    '00123',
  );
  assert.equal(
    await evaluate('document.querySelector("[data-cell=G11]").textContent'),
    '4',
  );
  await click('#undo');
  assert.equal(
    await evaluate('document.querySelector("[data-cell=G11]").textContent'),
    '',
  );
  await drag('G2', 'G4');
  assert.equal(
    await evaluate('document.querySelectorAll(".selected-range").length'),
    3,
  );
  await click('#range-fill');
  assert.match(
    await evaluate('document.querySelector("[data-cell=G4]").textContent'),
    /^3$/,
  );
  console.log(
    '4. Shift and pointer selection, rectangular paste, copy, fill and batch undo',
  );
  window.webContents.debugger.detach();
  app.exit(0);
}
setTimeout(() => app.exit(1), 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
