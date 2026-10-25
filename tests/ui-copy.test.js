import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';

async function sourceFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = await Promise.all(
    entries.map(entry => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(?:ts|cts|js|html|css)$/.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
}

test('Application text does not contain middle-dot separators', async () => {
  for (const root of ['src', 'electron']) {
    for (const path of await sourceFiles(root)) {
      assert.doesNotMatch(
        await readFile(path, 'utf8'),
        /\u00b7|&middot;|&#0*183;|&#x0*b7;|\\u00b7/i,
        path,
      );
    }
  }
});

test('Difficulty choices use only Light, Medium and Hard labels', async () => {
  const source = await readFile('src/app.ts', 'utf8');
  const select = source.match(/<select name="difficulty">([\s\S]*?)<\/select>/);
  assert.ok(select, 'difficulty selector exists');
  const options = [
    ...select[1].matchAll(
      /<option\s+value="([^"]+)"[\s\S]*?>\s*([^<]+)\s*<\/option>/g,
    ),
  ];
  assert.deepEqual(
    options.map(([, value, label]) => [value, label.trim()]),
    [
      ['basic', 'Light'],
      ['medium', 'Medium'],
      ['advanced', 'Hard'],
    ],
  );
});
