import {build} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

execFileSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tests/ui-controls/tsconfig.json'],
  {stdio: 'inherit'},
);
await build({
  configFile: false,
  root: path.resolve('tests/ui-controls'),
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(
      process.env.UI_TEST_ARTIFACTS ?? '.ui-test-artifacts',
      'controls-build',
    ),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: 'chrome140',
  },
});
