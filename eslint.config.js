import gts from 'gts';

export default [
  {
    files: ['**/*.cts'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
      },
    },
  },
  {ignores: ['node_modules/**', 'build/**', 'release/**', 'tests/**']},
  ...gts.map(config =>
    config.files?.includes('**/*.ts')
      ? {...config, files: ['**/*.ts', '**/*.cts', '**/*.tsx']}
      : config,
  ),
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.cts'],
    languageOptions: {
      parserOptions: {project: ['./tsconfig.json', './tsconfig.renderer.json']},
    },
  },
  {files: ['eslint.config.js'], languageOptions: {sourceType: 'module'}},
];
