import {rm} from 'node:fs/promises';

for (const directory of [
  'formatted',
  'sheets',
  'studio',
  'packages',
  'scripts',
  'public',
  'src',
  'electron',
  'desktop-tools',
]) {
  await rm(`build/${directory}`, {recursive: true, force: true});
}
