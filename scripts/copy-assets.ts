import {cp, readFile, rm, writeFile} from 'node:fs/promises';
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
for (const name of ['index.html', 'sheets.css', 'wizard.html', 'wizard.css'])
  await cp(`src/sheets/${name}`, `build/src/sheets/${name}`);
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
