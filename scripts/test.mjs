import {spawn} from 'node:child_process';
import path from 'node:path';
import {discoverTests} from './test-paths.mjs';

const product = process.argv[2];
if (product && !['formatted', 'sheets', 'studio'].includes(product)) {
  throw new Error('Unknown product');
}
const files = (await discoverTests(name => name.endsWith('.test.js'))).filter(
  file => !product || file.startsWith(product + path.sep),
);
if (!files.length) throw new Error('No tests found');
const child = spawn(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  env: process.env,
});
child.on('error', error => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', code => {
  process.exitCode = code ?? 1;
});
