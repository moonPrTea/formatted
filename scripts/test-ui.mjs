import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const available = (await readdir('tests'))
  .filter(
    name =>
      /-desktop\.(cjs|mjs)$/.test(name) ||
      [
        'desktop.cjs',
        'startup.cjs',
        'recovery-restart.cjs',
        'app-exit.cjs',
      ].includes(name),
  )
  .sort();
const selected = process.argv.slice(2);
const suites = selected.length ? selected : available;
if (suites.some(name => !available.includes(name)))
  throw new Error('Unknown UI suite');
const timeout = Number(process.env.UI_TEST_TIMEOUT_MS ?? 180000);
if (!Number.isFinite(timeout) || timeout < 100 || timeout > 600000)
  throw new Error('UI_TEST_TIMEOUT_MS must be between 100 and 600000');
const artifacts = path.resolve(
  process.env.UI_TEST_ARTIFACTS ?? '.ui-test-artifacts',
);
await mkdir(artifacts, {recursive: true});
if (suites.includes('controls-desktop.mjs'))
  await import('../tests/ui-controls/build.mjs');
const results = [];
for (const suite of suites) {
  const directory = path.join(artifacts, suite.replace(/\.(cjs|mjs)$/, ''));
  await mkdir(directory, {recursive: true});
  console.log('\nUI: ' + suite);
  const start = Date.now();
  const result = await new Promise(resolve => {
    const child = spawn(
      ['recovery-restart.cjs', 'app-exit.cjs'].includes(suite)
        ? process.execPath
        : require('electron'),
      [path.resolve('tests', suite)],
      {
        detached: process.platform !== 'win32',
        env: {
          ...process.env,
          TMPDIR: directory,
          TMP: directory,
          TEMP: directory,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '',
      timedOut = false,
      killTimer;
    const stop = signal => {
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') console.error(error);
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop('SIGTERM');
      killTimer = setTimeout(() => stop('SIGKILL'), 2000);
    }, timeout);
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', data => {
        process.stdout.write(data);
        output = (output + data).slice(-2000000);
      });
    child.on('error', error => {
      output += String(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (timedOut) stop('SIGKILL');
      resolve({
        suite,
        code,
        signal,
        timedOut,
        milliseconds: Date.now() - start,
        output,
      });
    });
  });
  await writeFile(path.join(directory, 'output.log'), result.output);
  const {output, ...summary} = result;
  results.push(summary);
  console.log(
    (result.code === 0 && !result.timedOut ? 'PASS ' : 'FAIL ') + suite,
  );
}
await writeFile(
  path.join(artifacts, 'results.json'),
  JSON.stringify(results, null, 2),
);
const failed = results.filter(result => result.code !== 0 || result.timedOut);
console.log(
  '\nUI: ' +
    (results.length - failed.length) +
    '/' +
    results.length +
    ' passed; artifacts: ' +
    artifacts,
);
if (failed.length) process.exitCode = 1;
