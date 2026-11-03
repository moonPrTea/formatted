import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {initialProject} from '../build/src/studio/model.js';
import {selectStudioRuntime} from '../scripts/studio-runtime.mjs';

const require = createRequire(import.meta.url);
const {StudioService} = require('../build/electron/studio-service.cjs');
const executable = path.resolve(
  'build/studio-runtime',
  process.platform === 'win32' ? 'dotnet.exe' : 'dotnet',
);

test(
  'Studio analysis and compilation ignore native binaries in the runtime directory',
  {
    skip:
      !existsSync(executable) && process.env.STUDIO_SERVICE_REQUIRED !== '1',
  },
  async t => {
    const runtime = selectStudioRuntime(
      execFileSync(executable, ['--list-runtimes'], {encoding: 'utf8'}),
    );
    const nativeFile = path.join(
      runtime.directory,
      runtime.version,
      'Studio.NativeFixture.dll',
    );
    await fs.copyFile(executable, nativeFile);
    t.after(() => fs.rm(nativeFile, {force: true}));
    const service = new StudioService(executable, [
      path.resolve('build/studio-backend/Studio.Service.dll'),
    ]);
    t.after(() => service.stop());
    const result = await service.request({
      operation: 'analyze',
      files: initialProject.files,
    });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(
      await service.request({operation: 'package-validate', references: []}),
      true,
    );
    const compiled = await service.request({
      operation: 'compile',
      files: initialProject.files,
    });
    assert.ok(Buffer.from(compiled.assembly, 'base64').length > 1000);
  },
);
