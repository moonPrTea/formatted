import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {initialProject, readProject} from '../build/src/studio/model.js';

const require = createRequire(import.meta.url);
const {StudioService} = require('../build/electron/studio-service.cjs');
const executable = path.resolve(
  'build/studio-runtime/dotnet' + (process.platform === 'win32' ? '.exe' : ''),
);
test(
  'Mac runtime executes C# events, MessageBox and modal forms in a separate process',
  {
    skip:
      !existsSync(executable) && process.env.STUDIO_SERVICE_REQUIRED !== '1',
    timeout: 60000,
  },
  async t => {
    const backend = path.resolve('build/studio-backend/Studio.Service.dll');
    const service = new StudioService(executable, [backend]);
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'studio-runtime-test-'),
    );
    let child;
    t.after(async () => {
      service.stop();
      child?.kill();
      await fs.rm(directory, {recursive: true, force: true});
    });
    const files = {...initialProject.files};
    files['LoginForm.cs'] =
      `using System; using System.Data; using System.Windows.Forms; namespace ChudoObuv;
      public partial class LoginForm : Form {
        public LoginForm() { InitializeComponent(); buttonLogin.Click += Login; textBoxLogin.TextChanged += (_, _) => labelHeading.Text = textBoxLogin.Text; }
        private void Login(object? sender, EventArgs e) {
          if (string.IsNullOrEmpty(textBoxLogin.Text)) { MessageBox.Show("Введите логин"); return; }
          using var second = new Form { Text = "Вторая форма" };
          var close = new Button { Text = "Закрыть", Name = "closeButton" }; close.Click += (_, _) => second.Close();
          second.Controls.Add(close);
          var table = new DataTable(); table.Columns.Add("code"); table.Columns.Add("price", typeof(decimal)); table.Rows.Add("00101", 100m);
          var grid = new DataGridView {Name = "grid", DataSource = table}; grid.Columns[0].ReadOnly = true;
          grid.CellValueChanged += (_, e) => second.Text = table.Rows[e.RowIndex][e.ColumnIndex].ToString(); second.Controls.Add(grid);
          bool cancel = true; second.FormClosing += (_, e) => { if (cancel) { e.Cancel = true; cancel = false; second.Text = "Отмена закрытия"; } };
          second.ShowDialog(); labelHeading.Text = "Закрыто";
        }
      }`;
    const compiled = await service.request({operation: 'compile', files});
    const binary = path.join(directory, 'StudioUser.dll');
    await fs.writeFile(binary, Buffer.from(compiled.assembly, 'base64'));
    child = spawn(executable, [backend, '--run', binary], {stdio: 'pipe'});
    let stderr = '';
    child.stderr.on('data', data => (stderr += data.toString()));
    const packets = [];
    createInterface({input: child.stdout}).on('line', line =>
      packets.push(JSON.parse(line)),
    );
    async function packet(predicate) {
      const end = Date.now() + 10000;
      while (true) {
        const index = packets.findIndex(predicate);
        if (index >= 0) return packets.splice(index, 1)[0];
        assert.ok(
          Date.now() < end && child.exitCode === null,
          stderr || 'runtime packet timeout',
        );
        await new Promise(r => setTimeout(r, 20));
      }
    }
    const send = value => child.stdin.write(JSON.stringify(value) + '\n');
    const start = await packet(p => p.kind === 'forms');
    const main = start.forms[0],
      button = main.children.find(c => c.name === 'buttonLogin'),
      text = main.children.find(c => c.name === 'textBoxLogin');
    send({kind: 'click', id: button.id, seq: 1});
    const message = await packet(p => p.kind === 'message');
    assert.equal(message.text, 'Введите логин');
    send({kind: 'dialog', id: message.id, value: 'OK'});
    send({kind: 'text', id: text.id, value: 'Маша', seq: 2});
    await packet(
      p =>
        p.kind === 'forms' &&
        p.forms[0]?.children.some(
          c => c.name === 'labelHeading' && c.text === 'Маша',
        ),
    );
    send({kind: 'click', id: button.id, seq: 3});
    const opened = await packet(
      p => p.kind === 'forms' && p.forms.length === 2,
    );
    const second = opened.forms[1];
    assert.equal(opened.modal, second.id);
    assert.equal(second.text, 'Вторая форма');
    assert.deepEqual(
      [second.children[0].width, second.children[0].height],
      [75, 23],
      'C# new Button() uses the same default size as the toolbox',
    );
    const grid = second.children.find(c => c.name === 'grid');
    assert.deepEqual(
      grid.grid.columns.map(c => c.name),
      ['code', 'price'],
    );
    assert.equal(grid.grid.rows[0].cells[0].text, '00101');
    const editCell = (column, text) =>
      send({
        kind: 'grid',
        id: grid.id,
        value: JSON.stringify({
          action: 'edit',
          row: grid.grid.rows[0].id,
          column,
          text,
        }),
      });
    editCell(1, '125');
    await packet(p => p.kind === 'forms' && p.forms[1]?.text === '125');
    editCell(1, 'not-a-number');
    const invalid = await packet(
      p =>
        p.kind === 'forms' &&
        p.forms[1]?.children.find(c => c.name === 'grid')?.grid.error,
    );
    assert.equal(
      invalid.forms[1].children.find(c => c.name === 'grid').grid.rows[0]
        .cells[1].text,
      '125',
    );
    editCell(0, 'changed');
    const readonly = await packet(
      p =>
        p.kind === 'forms' &&
        p.forms[1]?.children.find(c => c.name === 'grid')?.grid.error === '',
    );
    assert.equal(
      readonly.forms[1].children.find(c => c.name === 'grid').grid.rows[0]
        .cells[0].text,
      '00101',
    );
    send({kind: 'close', id: second.id});
    await packet(p => p.kind === 'close-result' && p.id === second.id);
    await packet(
      p => p.kind === 'forms' && p.forms[1]?.text === 'Отмена закрытия',
    );
    send({kind: 'click', id: second.children[0].id, seq: 4});
    await packet(
      p =>
        p.kind === 'forms' &&
        p.forms.length === 1 &&
        p.forms[0].children.some(c => c.text === 'Закрыто'),
    );
    const exited = new Promise(resolve => child.once('exit', resolve));
    send({kind: 'close', id: main.id});
    assert.equal(await exited, 0);
    await assert.rejects(
      () =>
        service.request({
          operation: 'compile',
          files: {
            ...files,
            'Program.cs':
              'using System.Windows.Forms; class MainApp { static void Main() { Application.Run(new DataGridView()); } }',
          },
        }),
      /Mac runtime/,
    );
  },
);
test(
  'Control rename updates symbols across files, not unrelated strings or locals',
  {
    skip:
      !existsSync(executable) && process.env.STUDIO_SERVICE_REQUIRED !== '1',
    timeout: 60000,
  },
  async t => {
    const service = new StudioService(executable, [
      path.resolve('build/studio-backend/Studio.Service.dll'),
    ]);
    t.after(() => service.stop());
    const files = {...initialProject.files};
    files['LoginForm.cs'] = files['LoginForm.cs'].replace(
      'var login =',
      '// buttonLogin must remain a comment\n        var buttonLogin = "buttonLogin";\n        _ = buttonLogin;\n        var login =',
    );
    files['LoginForm.Designer.cs'] = files['LoginForm.Designer.cs'].replace(
      'buttonLogin.Text =',
      'buttonLogin.Name = "buttonLogin";\n        buttonLogin.Text =',
    );
    const rename = newName =>
      service.request({
        operation: 'edit',
        files,
        edit: {kind: 'rename', name: 'buttonLogin', newName},
      });
    for (const name of [
      'bad name',
      'class',
      '@class',
      '',
      'textBoxLogin',
      'Text',
      'LoginForm',
      'buttonLogin_Click',
    ])
      await assert.rejects(() => rename(name));
    const result = await rename('loginButton');
    assert.equal(result.name, 'loginButton');
    assert.match(
      result.files['LoginForm.cs'],
      /loginButton.Click \+= buttonLogin_Click/,
    );
    assert.match(
      result.files['LoginForm.cs'],
      /var buttonLogin = "buttonLogin"/,
    );
    assert.match(
      result.files['LoginForm.cs'],
      /\/\/ buttonLogin must remain a comment/,
    );
    assert.match(
      result.files['LoginForm.Designer.cs'],
      /loginButton.Name = "loginButton"/,
    );
    assert.doesNotMatch(result.files['LoginForm.Designer.cs'], /buttonLogin/);
    assert.equal(result.files['Program.cs'], files['Program.cs']);
    const checked = await service.request({
      operation: 'analyze',
      files: result.files,
    });
    assert.equal(
      checked.diagnostics.filter(d => d.severity === 'error').length,
      0,
    );
    assert.equal(checked.form.editable, true);
    assert.ok(checked.form.controls.some(c => c.name === 'loginButton'));
    const inserted = await service.request({
      operation: 'edit',
      files: initialProject.files,
      edit: {kind: 'rename', name: 'buttonLogin', newName: 'кнопкаВхода'},
    });
    assert.match(
      inserted.files['LoginForm.Designer.cs'],
      /this.кнопкаВхода.Name = "кнопкаВхода"/,
    );
    const analyzed = await service.request({
      operation: 'analyze',
      files: inserted.files,
    });
    assert.equal(analyzed.form.editable, true);
    assert.equal(
      analyzed.diagnostics.filter(d => d.severity === 'error').length,
      0,
    );
    await assert.rejects(() =>
      service.request({
        operation: 'edit',
        files: {...files, 'LoginForm.cs': 'broken {'},
        edit: {kind: 'rename', name: 'buttonLogin', newName: 'loginButton'},
      }),
    );
  },
);
test('Studio validates its project format without accepting missing or oversized files', () => {
  assert.deepEqual(readProject(initialProject), initialProject);
  assert.throws(() => readProject({...initialProject, version: 2}));
  assert.throws(() => readProject({...initialProject, files: {}}));
  for (const packages of [
    {},
    [{id: '../bad', version: '1.0.0'}],
    [{id: 'Ok', version: '../bad'}],
    [
      {id: 'Ok', version: '1.0.0'},
      {id: 'ok', version: '2.0.0'},
    ],
  ])
    assert.throws(() => readProject({...initialProject, packages}));
  assert.deepEqual(
    readProject({
      ...initialProject,
      packages: [{id: 'Newtonsoft.Json', version: '13.0.3'}],
    }).packages,
    [{id: 'Newtonsoft.Json', version: '13.0.3'}],
  );
  assert.throws(() =>
    readProject({
      ...initialProject,
      files: {...initialProject.files, 'Program.cs': 'x'.repeat(100001)},
    }),
  );
});

test(
  'toolbox creates type-specific WinForms defaults without changing existing controls',
  {
    skip:
      !existsSync(executable) && process.env.STUDIO_SERVICE_REQUIRED !== '1',
    timeout: 60000,
  },
  async t => {
    const service = new StudioService(executable, [
      path.resolve('build/studio-backend/Studio.Service.dll'),
    ]);
    t.after(() => service.stop());
    const sizes = {
      Button: [75, 23],
      Label: [100, 23],
      TextBox: [100, 23],
      CheckBox: [104, 24],
      RadioButton: [104, 24],
      ComboBox: [121, 23],
      ListBox: [120, 96],
      PictureBox: [100, 50],
      Panel: [200, 100],
      GroupBox: [200, 100],
      DataGridView: [240, 150],
      ProgressBar: [100, 23],
    };
    const initial = await service.request({
      operation: 'analyze',
      files: initialProject.files,
    });
    for (const [type, size] of Object.entries(sizes)) {
      const files = {...initialProject.files};
      const added = await service.request({
        operation: 'edit',
        files,
        edit: {kind: 'add', type},
      });
      files['LoginForm.Designer.cs'] = added.source;
      const result = await service.request({operation: 'analyze', files});
      assert.equal(result.form.editable, true, type);
      assert.deepEqual(result.diagnostics, [], type);
      assert.deepEqual(result.form.controls.slice(0, 4), initial.form.controls);
      const control = result.form.controls.find(c => c.name === added.name);
      assert.deepEqual([control.width, control.height], size, type);
      assert.equal(
        control.text,
        ['Button', 'Label', 'CheckBox', 'RadioButton', 'GroupBox'].includes(
          type,
        )
          ? added.name
          : '',
        type,
      );
      assert.ok(added.source.includes(`${added.name}.Name = "${added.name}";`));
      assert.ok(control.x + control.width <= result.form.width);
      assert.ok(control.y + control.height <= result.form.height);
      if (type === 'Button') {
        assert.ok(
          initial.form.controls.every(
            c =>
              control.x >= c.x + c.width ||
              control.x + control.width <= c.x ||
              control.y >= c.y + c.height ||
              control.y + control.height <= c.y,
          ),
        );
        const next = await service.request({
          operation: 'edit',
          files,
          edit: {kind: 'add', type},
        });
        files['LoginForm.Designer.cs'] = next.source;
        const updated = await service.request({operation: 'analyze', files});
        const second = updated.form.controls.find(c => c.name === next.name);
        assert.notDeepEqual([second.x, second.y], [control.x, control.y]);
      }
    }
  },
);

test(
  'Roslyn completion and lossless designer synchronization',
  {
    skip:
      !existsSync(executable) && process.env.STUDIO_SERVICE_REQUIRED !== '1',
    timeout: 60000,
  },
  async t => {
    const service = new StudioService(executable, [
      path.resolve('build/studio-backend/Studio.Service.dll'),
    ]);
    t.after(() => service.stop());
    const files = {...initialProject.files};
    const analyze = () => service.request({operation: 'analyze', files});
    const edit = async edit => {
      const result = await service.request({operation: 'edit', files, edit});
      files['LoginForm.Designer.cs'] = result.source;
      return result;
    };
    const initial = await analyze();
    assert.deepEqual(initial.diagnostics, []);
    assert.equal(initial.form.editable, true);
    assert.equal(initial.form.controls.length, 4);
    const originalHandCode = files['LoginForm.cs'];
    files['LoginForm.cs'] = originalHandCode.replace(
      'var login = textBoxLogin.Text.Trim();',
      'var login = textBoxLogin.Text.Trim();\n        buttonLogin.',
    );
    const completed = await service.request({
      operation: 'complete',
      files,
      file: 'LoginForm.cs',
      position:
        files['LoginForm.cs'].indexOf('buttonLogin.\n') + 'buttonLogin.'.length,
    });
    assert.ok(completed.items.some(item => item.label === 'BackColor'));
    assert.ok(completed.items.some(item => item.label === 'Click'));
    files['LoginForm.cs'] = originalHandCode.replace(
      'var login = textBoxLogin.Text.Trim();',
      'var customName = textBoxLogin.Text;\n        customName.',
    );
    const typed = await service.request({
      operation: 'complete',
      files,
      file: 'LoginForm.cs',
      position:
        files['LoginForm.cs'].indexOf('customName.\n') + 'customName.'.length,
    });
    assert.ok(typed.items.some(item => item.label === 'Contains'));
    files['LoginForm.cs'] = originalHandCode;
    files['LoginForm.Designer.cs'] = files['LoginForm.Designer.cs'].replace(
      'buttonLogin.Text = "Войти";',
      'buttonLogin.Text = "Войти"; // keep my comment',
    );
    await edit({
      kind: 'property',
      name: 'buttonLogin',
      property: 'Text',
      value: 'Привет "C#"\nnext',
    });
    assert.ok(files['LoginForm.Designer.cs'].includes('// keep my comment'));
    assert.equal(files['LoginForm.cs'], originalHandCode);
    assert.equal(
      (await analyze()).form.controls.find(c => c.name === 'buttonLogin').text,
      'Привет "C#"\nnext',
    );
    await edit({
      kind: 'geometry',
      name: 'buttonLogin',
      x: 40,
      y: 200,
      width: 150,
      height: 32,
    });
    let result = await analyze();
    assert.deepEqual(result.diagnostics, []);
    assert.equal(
      result.form.controls.find(c => c.name === 'buttonLogin').x,
      40,
    );
    const added = await edit({kind: 'add', type: 'CheckBox'});
    await edit({
      kind: 'property',
      name: added.name,
      property: 'Checked',
      value: true,
    });
    result = await analyze();
    assert.deepEqual(result.diagnostics, []);
    assert.equal(
      result.form.controls.find(c => c.name === added.name).checked,
      true,
    );
    const valid = files['LoginForm.Designer.cs'];
    for (const unsupported of [
      'ApplyStyles();',
      'buttonLogin.Dock = DockStyle.Fill;',
      'if (true) buttonLogin.Text = "dynamic";',
      'buttonLogin.Click += (_, _) => { buttonLogin.Text = "clicked"; };',
    ]) {
      files['LoginForm.Designer.cs'] = valid.replace(
        'this.ClientSize',
        unsupported + '\n        this.ClientSize',
      );
      assert.equal((await analyze()).form.editable, false, unsupported);
      await assert.rejects(() =>
        edit({
          kind: 'property',
          name: 'buttonLogin',
          property: 'Text',
          value: 'must not change',
        }),
      );
    }
    files['LoginForm.Designer.cs'] = valid.replace(
      'buttonLogin.Text =',
      'buttonLogin.Text = =',
    );
    result = await analyze();
    assert.equal(result.form.editable, false);
    assert.ok(result.diagnostics.some(d => d.severity === 'error'));
    files['LoginForm.Designer.cs'] = valid;
    await assert.rejects(() =>
      edit({
        kind: 'geometry',
        name: 'buttonLogin',
        x: -1,
        y: 0,
        width: 80,
        height: 24,
      }),
    );
    await assert.rejects(() =>
      edit({
        kind: 'property',
        name: 'buttonLogin',
        property: 'Checked',
        value: true,
      }),
    );
    assert.equal((await analyze()).form.editable, true);
  },
);
