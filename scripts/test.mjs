import {spawn} from 'node:child_process';
import {readdir} from 'node:fs/promises';
import path from 'node:path';

const directories = [
  'tests',
  'formatted/tests',
  'sheets/tests',
  'packages/spreadsheet/tests',
];
const groups = await Promise.all(
  directories.map(async directory =>
    (await readdir(directory))
      .filter(name => name.endsWith('.test.js'))
      .map(name => path.join(directory, name)),
  ),
);
const files = groups.flat().sort();
if (!files.length) throw new Error('No tests found');
const child = spawn(process.execPath, ['--test', ...files], {stdio: 'inherit'});
child.on('error', error => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', code => {
  process.exitCode = code ?? 1;
});
