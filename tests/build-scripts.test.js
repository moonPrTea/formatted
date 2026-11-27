import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('clean build removes stale output while preserving Studio binaries and source files', async context => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'formatted-clean-build-'));
  context.after(() => rm(root, {recursive: true, force: true}));
  const files = [
    'build/src/old.js',
    'build/electron/old.cjs',
    'build/formatted/app/old.js',
    'build/studio-backend/Studio.Service.dll',
    'build/studio-runtime/dotnet',
    'formatted/app/main.ts',
  ];
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), {recursive: true});
    await writeFile(path.join(root, file), file);
  }
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL('../scripts/clean-build.mjs', import.meta.url))],
    {cwd: root},
  );
  for (const file of files.slice(0, 3))
    await assert.rejects(access(path.join(root, file)), {code: 'ENOENT'});
  for (const file of files.slice(3))
    assert.equal(await readFile(path.join(root, file), 'utf8'), file);
});
