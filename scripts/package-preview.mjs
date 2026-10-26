import {packager} from '@electron/packager';
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

// Package on the target OS: never cross-package native dependencies.
if (!['darwin', 'win32', 'linux'].includes(process.platform)) {
  throw new Error('Unsupported packaging platform');
}
if (!['arm64', 'x64'].includes(process.arch)) {
  throw new Error('Unsupported packaging architecture');
}
const standalone = await access('electron/launch-studio.cts').then(
  () => true,
  () => false,
);
if (standalone) {
  throw new Error(
    'Standalone Studio/Sheets need suite packaging; this preview packages the committed core app only.',
  );
}
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
await access(manifest.main);
const output = path.resolve('release', `preview-${Date.now()}`);
await mkdir(output, {recursive: true});
const [directory] = await packager({
  dir: '.',
  name: 'formatted',
  out: output,
  platform: process.platform,
  arch: process.arch,
  appBundleId: 'com.formatted.app',
  icon: 'src/assets/forma',
  // Python must read its scripts as real files, not paths inside ASAR.
  asar: false,
  ignore: file =>
    file !== '' && !/^\/(build|node_modules|package\.json)(\/|$)/.test(file),
});
const executable = path.join(
  directory,
  process.platform === 'darwin'
    ? 'formatted.app/Contents/MacOS/formatted'
    : process.platform === 'win32'
      ? 'formatted.exe'
      : 'formatted',
);
await access(executable);
const archive = path.join(
  output,
  `formatted-${manifest.version}-${process.platform}-${process.arch}.tar.gz`,
);
// tar preserves executable permissions and relative macOS framework symlinks.
execFileSync('tar', ['-czf', archive, '-C', output, path.basename(directory)], {
  stdio: 'inherit',
});
const hash = createHash('sha256');
for await (const chunk of createReadStream(archive)) {
  hash.update(chunk);
}
await writeFile(
  `${archive}.sha256`,
  `${hash.digest('hex')}  ${path.basename(archive)}\n`,
);
await writeFile(
  'release/preview.json',
  JSON.stringify({directory, executable, archive}, null, 2),
);
console.log(`Unsigned preview: ${archive}`);
