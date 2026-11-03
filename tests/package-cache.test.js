import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {publishPackageCache} = require('../build/electron/package-cache.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-cache-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const destination = path.join(root, 'package', '1.0.0');
  const source = path.join(root, 'checked');
  const write = async (folder, value) => {
    await fs.mkdir(folder, {recursive: true});
    await fs.writeFile(path.join(folder, 'value'), value);
  };
  return {root, source, destination, write};
}

test('repeated cache replacements leave no old packages or backups', async t => {
  const {root, source, destination, write} = await fixture(t);
  for (const value of ['first', 'second', 'third']) {
    await write(source, value);
    await publishPackageCache(source, destination);
    assert.equal(
      await fs.readFile(path.join(destination, 'value'), 'utf8'),
      value,
    );
    assert.deepEqual(await fs.readdir(path.dirname(destination)), ['1.0.0']);
  }
  assert.deepEqual(await fs.readdir(root), ['package']);
});

test('failed publication restores the previous usable cache', async t => {
  const {source, destination, write} = await fixture(t);
  await write(destination, 'previous');
  await assert.rejects(publishPackageCache(source, destination), {
    code: 'ENOENT',
  });
  assert.equal(
    await fs.readFile(path.join(destination, 'value'), 'utf8'),
    'previous',
  );
  assert.deepEqual(await fs.readdir(path.dirname(destination)), ['1.0.0']);
});

test('an interrupted replacement recovers its backup before retrying', async t => {
  const {source, destination, write} = await fixture(t);
  await write(destination + '.previous', 'previous');
  await assert.rejects(publishPackageCache(source, destination), {
    code: 'ENOENT',
  });
  assert.equal(
    await fs.readFile(path.join(destination, 'value'), 'utf8'),
    'previous',
  );
  await write(source, 'recovered');
  await publishPackageCache(source, destination);
  assert.deepEqual(await fs.readdir(path.dirname(destination)), ['1.0.0']);
});

test('a stale backup is removed without touching other cached versions', async t => {
  const {source, destination, write} = await fixture(t);
  const otherVersion = path.join(path.dirname(destination), '2.0.0');
  await write(destination, 'current');
  await write(destination + '.previous', 'stale');
  await write(otherVersion, 'unrelated');
  await write(source, 'replacement');
  await publishPackageCache(source, destination);
  assert.deepEqual((await fs.readdir(path.dirname(destination))).sort(), [
    '1.0.0',
    '2.0.0',
  ]);
  assert.equal(
    await fs.readFile(path.join(otherVersion, 'value'), 'utf8'),
    'unrelated',
  );
});
