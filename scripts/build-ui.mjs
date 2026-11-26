import {build} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import {rm} from 'node:fs/promises';

for (const output of ['build/src/ui-assets', 'build/src/sheets/ui-assets'])
  await rm(path.resolve(output), {recursive: true, force: true});

const renderers = [
  {root: 'src', output: 'build/src', pages: {app: 'index.html'}},
  {
    root: 'sheets/app',
    output: 'build/src/sheets',
    pages: {sheets: 'index.html', wizard: 'wizard.html'},
  },
];
for (const renderer of renderers) {
  await build({
    configFile: false,
    root: path.resolve(renderer.root),
    base: './',
    publicDir: false,
    plugins: [react(), tailwindcss()],
    build: {
      outDir: path.resolve(renderer.output),
      emptyOutDir: false,
      assetsInlineLimit: 0,
      target: 'chrome140',
      rolldownOptions: {
        input: Object.fromEntries(
          Object.entries(renderer.pages).map(([name, file]) => [
            name,
            path.resolve(renderer.root, file),
          ]),
        ),
        output: {
          entryFileNames: 'ui-assets/[name]-[hash].js',
          chunkFileNames: 'ui-assets/[name]-[hash].js',
          assetFileNames: 'ui-assets/[name]-[hash][extname]',
        },
      },
    },
  });
}
