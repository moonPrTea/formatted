import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  atomicWrite,
  readText,
  digest,
} from '../../build/sheets/electron/sheet-store.js';

test('Atomic file writes replace completely and failed rename preserves the previous target', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formatted-store-'));
  const file = path.join(directory, 'book.formatted');
  atomicWrite(file, 'first');
  atomicWrite(file, 'second');
  assert.equal(readText(file), 'second');
  assert.equal(digest('second'), digest(readText(file)));
  assert.notEqual(digest('first'), digest('second'));
  const blocked = path.join(directory, 'blocked');
  fs.mkdirSync(blocked);
  fs.writeFileSync(path.join(blocked, 'keep'), 'original');
  assert.throws(() => atomicWrite(blocked, 'replacement'));
  assert.equal(fs.readFileSync(path.join(blocked, 'keep'), 'utf8'), 'original');
  assert.equal(
    fs.readdirSync(directory).some(name => name.endsWith('.tmp')),
    false,
  );
  assert.throws(() => readText(blocked));
  const large = path.join(directory, 'large');
  fs.writeFileSync(large, '');
  fs.truncateSync(large, 8 * 1024 * 1024 + 1);
  assert.throws(() => readText(large));
});
