import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {initialProject} from '../build/src/studio/model.js';

const require = createRequire(import.meta.url);
const {StudioService} = require('../build/electron/studio-service.cjs');
const executable = path.resolve(
  'build/studio-runtime/dotnet' + (process.platform === 'win32' ? '.exe' : ''),
);
test(
  'Deleting a control removes its field, initialization and event subscription, not handler code',
  {
    skip:
      !existsSync(executable) && process.env.STUDIO_SERVICE_REQUIRED !== '1',
  },
  async t => {
    const service = new StudioService(executable, [
      path.resolve('build/studio-backend/Studio.Service.dll'),
    ]);
    t.after(() => service.stop());
    const files = structuredClone(initialProject.files);
    files['LoginForm.cs'] = files['LoginForm.cs'].replace(
      'var login =',
      'var note = "buttonLogin";\n        var login =',
    );
    const removed = await service.request({
      operation: 'edit',
      files,
      edit: {kind: 'delete', name: 'buttonLogin'},
    });
    assert.deepEqual(removed.removed, ['buttonLogin']);
    assert.ok(!removed.files['LoginForm.Designer.cs'].includes('buttonLogin'));
    assert.ok(!removed.files['LoginForm.cs'].includes('buttonLogin.Click'));
    assert.ok(removed.files['LoginForm.cs'].includes('void buttonLogin_Click'));
    assert.ok(removed.files['LoginForm.cs'].includes('"buttonLogin"'));
    const analysis = await service.request({
      operation: 'analyze',
      files: removed.files,
    });
    assert.equal(analysis.form.controls.length, 3);
    assert.equal(analysis.form.editable, true);
    assert.ok(!analysis.diagnostics.some(d => d.severity === 'error'));
    await assert.rejects(
      () =>
        service.request({
          operation: 'edit',
          files,
          edit: {kind: 'delete', name: 'textBoxLogin'},
        }),
      /используется в коде/,
    );
    await assert.rejects(
      () =>
        service.request({
          operation: 'edit',
          files,
          edit: {kind: 'delete', name: 'missing'},
        }),
      /недоступен/,
    );
    assert.ok(files['LoginForm.Designer.cs'].includes('buttonLogin'));
  },
);

test(
  'Deleting a container removes descendants and preserves unrelated fields in a shared declaration',
  {
    skip:
      !existsSync(executable) && process.env.STUDIO_SERVICE_REQUIRED !== '1',
  },
  async t => {
    const service = new StudioService(executable, [
      path.resolve('build/studio-backend/Studio.Service.dll'),
    ]);
    t.after(() => service.stop());
    const files = structuredClone(initialProject.files);
    files['LoginForm.Designer.cs'] = files['LoginForm.Designer.cs']
      .replace(
        'private Label labelHeading = null!;',
        'private Label labelHeading = null!, otherLabel = null!;\n    private Panel panel1 = null!;',
      )
      .replace(
        'labelHeading = new Label();',
        'panel1 = new Panel();\n        panel1.Size = new Size(400, 80);\n        Controls.Add(panel1);\n        labelHeading = new Label();',
      )
      .replace(
        'Controls.Add(labelHeading);',
        'panel1.Controls.Add(labelHeading);',
      );
    const removed = await service.request({
      operation: 'edit',
      files,
      edit: {kind: 'delete', name: 'panel1'},
    });
    assert.deepEqual(
      new Set(removed.removed),
      new Set(['panel1', 'labelHeading']),
    );
    assert.ok(removed.files['LoginForm.Designer.cs'].includes('otherLabel'));
    const analysis = await service.request({
      operation: 'analyze',
      files: removed.files,
    });
    assert.equal(analysis.form.controls.length, 3);
    assert.equal(analysis.form.editable, true);
    assert.ok(!analysis.diagnostics.some(d => d.severity === 'error'));
  },
);
