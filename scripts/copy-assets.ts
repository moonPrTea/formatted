import {cp, mkdir, rm, writeFile} from 'node:fs/promises';
import {calcLesson} from '../packages/practice/src/calc-lesson.js';

for (const name of [
  'calc',
  'main',
  'ollama',
  'sheet-files',
  'sheet-store',
  'sheets',
  'start',
  'package-cache',
  'studio-service',
]) {
  await rm(`build/electron/${name}.cjs`, {force: true});
}

for (const name of ['styles.css', 'workspace.css']) {
  await cp(`formatted/app/assets/css/${name}`, `build/src/${name}`);
}
await mkdir('build/src/assets', {recursive: true});
for (const name of ['forma.svg', 'forma.png', 'forma.ico', 'forma.icns'])
  await cp(`packages/ui/assets/${name}`, `build/src/assets/${name}`);
await cp('packages/ui/assets/css/theme.css', 'build/src/theme.css');
await cp('formatted/desktop-tools', 'build/desktop-tools', {recursive: true});
for (const name of [
  'runtime.html',
  'runtime.css',
  'winforms.css',
  'runtime-grid.css',
]) {
  await cp(`src/studio/${name}`, `build/src/studio/${name}`);
}
await rm('build/src/sheets', {recursive: true, force: true});
await mkdir('build/src/sheets', {recursive: true});
await cp('sheets/app/assets', 'build/src/sheets/assets', {recursive: true});
for (const name of ['index.html', 'wizard.html'])
  await cp(`sheets/app/${name}`, `build/src/sheets/${name}`);
for (const name of [
  'sheet-files.js',
  'sheet-store.js',
  'sheets.js',
  'sheets-preload.cjs',
  'wizard-preload.cjs',
  'calc.js',
  'main.js',
  'ollama.js',
  'preload.cjs',
  'start.js',
])
  await rm(`build/electron/${name}`, {force: true});
for (const name of ['appearance.css', 'appearance.js'])
  await cp(`packages/ui/public/${name}`, `build/src/${name}`);
await mkdir('build/src/ui', {recursive: true});
await cp('packages/ui/assets/css/palette.css', 'build/src/ui/palette.css');
await writeFile(
  'build/desktop-tools/calc-lesson.json',
  JSON.stringify(calcLesson),
);
await cp('formatted/app/index.html', 'build/src/index.html');
