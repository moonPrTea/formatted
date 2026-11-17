import {build} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {rm} from 'node:fs/promises';

await rm(path.resolve('build/src/ui-assets'), {recursive: true, force: true});

await build({
  configFile: false,
  root: path.resolve('src'),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.resolve('build/src'),
    emptyOutDir: false,
    assetsInlineLimit: 0,
    target: 'chrome140',
    rolldownOptions: {
      input: {
        app: path.resolve('src/index.html'),
        sheets: path.resolve('src/sheets/index.html'),
        wizard: path.resolve('src/sheets/wizard.html'),
      },
      output: {
        entryFileNames: 'ui-assets/[name]-[hash].js',
        chunkFileNames: 'ui-assets/[name]-[hash].js',
        assetFileNames: 'ui-assets/[name]-[hash][extname]',
      },
    },
  },
});
