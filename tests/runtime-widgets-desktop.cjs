const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function run() {
  app.setPath(
    'userData',
    await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-widgets-')),
  );
  await app.whenReady();
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  const errors = [];
  window.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });
  await window.loadFile(path.join(__dirname, 'runtime-widgets.html'));
  const evaluate = code => window.webContents.executeJavaScript(code);
  assert.equal(await evaluate('typeof window.widgets?.renderGrid'), 'function');
  await evaluate(`
    window.events = [];
    window.root = document.querySelector('#grid');
    window.grid = {
      columns: [
        {name:'name', header:'Name', width:120, visible:true},
        {name:'hidden', header:'Hidden', width:40, visible:false},
        {name:'locked', header:'Locked', width:80, visible:true}
      ],
      rows: [{id:42, cells:[{text:'<img src=x onerror=alert(1)>', readOnly:false}, {text:'secret', readOnly:false}, {text:'fixed', readOnly:true}]}],
      selected:42, currentColumn:0, fill:true, headers:true, rowHeaders:true,
      add:true, delete:true, error:''
    };
    window.paint = blocked => widgets.renderGrid(root, grid, blocked, value => events.push(JSON.parse(value)));
    window.cell = () => root.querySelector('[data-row="42"] [data-column="0"]');
    window.key = (element, name) => element.dispatchEvent(new KeyboardEvent('keydown', {key:name, bubbles:true, cancelable:true}));
    paint(false);
  `);
  assert.equal(await evaluate('!!root.querySelector("img")'), false);
  assert.equal(
    await evaluate('root.querySelectorAll("td[data-column]").length'),
    2,
  );
  assert.equal(await evaluate('cell().getAttribute("aria-selected")'), 'true');
  await evaluate(`
    key(cell(), 'F2');
    root.querySelector('input').value = 'changed';
    key(root.querySelector('input'), 'Enter');
  `);
  assert.deepEqual(await evaluate('events.pop()'), {
    action: 'edit',
    row: 42,
    column: 0,
    text: 'changed',
  });
  await evaluate(
    `key(cell(), 'Enter'); key(root.querySelector('input'), 'Escape')`,
  );
  assert.equal(await evaluate('events.length'), 0);
  await evaluate(`key(root.querySelector('[data-column="2"]'), 'F2')`);
  assert.equal(await evaluate('!!root.querySelector("input")'), false);
  await evaluate(`
    key(cell(), 'F2');
    window.draft = root.querySelector('input');
    draft.value = 'must not be saved';
    draft.focus();
    paint(true);
    key(draft, 'Enter');
    key(cell(), 'Delete');
    cell().click();
    root.querySelector('button').click();
  `);
  assert.equal(
    await evaluate('events.length'),
    0,
    'blocking cancels in-flight edits and all actions',
  );
  assert.equal(await evaluate('root.getAttribute("aria-disabled")'), 'true');
  await evaluate(
    `paint(false); key(cell(), 'Delete'); root.querySelector('button').click()`,
  );
  assert.deepEqual(await evaluate('events.splice(0)'), [
    {action: 'delete', row: 42, column: 0},
    {action: 'add', row: 0, column: 0},
  ]);
  console.log(
    'Grid: escaping, hidden columns, readonly, edit/cancel, blocked draft, delete/add passed',
  );

  await evaluate(`
    window.listModel = {items:['<script>unsafe()</script>', 'Second'], selectedIndex:0, text:'First', dropDownStyle:'DropDownList'};
    window.list = widgets.makeList(false, (kind, value) => events.push({kind, value}));
    document.body.append(list);
    widgets.updateList(list, listModel, true, false);
    key(list, 'ArrowDown');
  `);
  assert.deepEqual(await evaluate('events.pop()'), {kind: 'select', value: 1});
  assert.equal(await evaluate('!!list.querySelector("script")'), false);
  await evaluate(
    `widgets.updateList(list, listModel, true, true); key(list, 'ArrowDown'); list.querySelector('[data-option="1"]').click()`,
  );
  assert.equal(await evaluate('events.length'), 0);
  await evaluate(`
    window.combo = widgets.makeList(true, (kind,value) => events.push({kind,value}));
    document.body.append(combo);
    widgets.updateList(combo, listModel, true, false);
    combo.querySelector('input').value = 'local draft';
    widgets.updateList(combo, {...listModel,text:'old snapshot'}, false, false);
  `);
  assert.equal(
    await evaluate('combo.querySelector("input").value'),
    'local draft',
  );
  assert.equal(await evaluate('combo.querySelector("input").readOnly'), true);
  await evaluate(
    `widgets.updateList(combo, {...listModel,text:'acknowledged'}, true, false)`,
  );
  assert.equal(
    await evaluate('combo.querySelector("input").value'),
    'acknowledged',
  );
  await evaluate(`widgets.updateList(combo, listModel, true, true)`);
  assert.equal(await evaluate('combo.querySelector("input").disabled'), true);
  assert.equal(await evaluate('combo.querySelector("button").disabled'), true);
  await evaluate(`(async () => {
    document.body.insertAdjacentHTML('beforeend', '<main id="form"></main>');
    window.formRuntime = {event: value => events.push(value), onSnapshot: callback => window.snapshot = callback};
    await import('../build/src/studio/runtime.js');
    window.control = {id:7,type:'TextBox',name:'entry',text:'initial',enabled:true,visible:true,children:[],maxLength:100};
    window.form = {enabled:true,backColor:'#ffffff',children:[control]};
    snapshot({form,ack:0});
    window.field = document.querySelector('#form input');
    field.value = 'draft';
    field.dispatchEvent(new Event('input'));
    snapshot({form,ack:0});
  })()`);
  assert.equal(await evaluate('field.value'), 'draft');
  await evaluate(
    `control.text = 'confirmed'; snapshot({form,ack:1,disabled:true})`,
  );
  assert.equal(await evaluate('field.value'), 'confirmed');
  assert.equal(await evaluate('field.disabled'), true);
  await evaluate(`form.children = []; snapshot({form,ack:1})`);
  assert.equal(
    await evaluate('document.querySelector("#form").children.length'),
    0,
  );
  for (const name of [
    'runtime.html',
    'runtime.css',
    'winforms.css',
    'runtime-grid.css',
  ]) {
    await fs.access(path.join(__dirname, '../build/src/studio', name));
  }
  assert.deepEqual(errors, []);
  console.log(
    'Lists: selection, escaping, disabled state, draft preservation and acknowledgement passed',
  );
  app.exit(0);
}
setTimeout(() => app.exit(1), 30000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
