import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {calcLesson} from '../src/core/calc-lesson.js';

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

for (const name of ['styles.css', 'theme.css', 'workspace.css', 'assets']) {
  await cp(`src/${name}`, `build/src/${name}`, {recursive: true});
}
await cp('desktop-tools', 'build/desktop-tools', {recursive: true});
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
])
  await rm(`build/electron/${name}`, {force: true});
for (const name of ['appearance.css', 'appearance.js'])
  await cp(`src/public/${name}`, `build/src/${name}`);
await cp('src/ui/palette.css', 'build/src/ui/palette.css');
await writeFile(
  'build/desktop-tools/calc-lesson.json',
  JSON.stringify(calcLesson),
);
const html = await readFile('src/index.html', 'utf8');
await writeFile(
  'build/src/index.html',
  html.replace('../build/src/app.js', 'app.js'),
);
