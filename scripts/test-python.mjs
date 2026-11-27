import {spawnSync} from 'node:child_process';

const candidates =
  process.platform === 'win32' ? [['py', '-3'], ['python']] : [['python3']];
const python = candidates.find(
  ([command, ...args]) =>
    spawnSync(command, [...args, '--version']).status === 0,
);
if (!python) throw new Error('Python 3 is not installed');
const [command, ...args] = python;
const result = spawnSync(
  command,
  [
    ...args,
    '-B',
    '-m',
    'unittest',
    'discover',
    '-s',
    'formatted/tests',
    '-p',
    '*_test.py',
  ],
  {stdio: 'inherit'},
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
