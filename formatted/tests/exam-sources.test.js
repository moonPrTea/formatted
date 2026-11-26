import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDataset,
  sourceFiles,
  exportFiles,
} from '../../build/packages/practice/src/generator.js';
import {normalizationModel} from '../../build/formatted/app/services/normalization-model.js';

for (const domain of ['retail', 'library', 'courses']) {
  for (const difficulty of ['basic', 'medium', 'advanced']) {
    test(`${domain} ${difficulty}: new source layout retains all 12 relations`, () => {
      const input = {domain, difficulty, seed: 'EXAM-03', size: 60};
      const data = generateDataset(input);
      assert.equal(data.version, 3);
      assert.equal(
        sourceFiles(data).length,
        difficulty === 'basic' ? 4 : difficulty === 'medium' ? 3 : 1,
      );
      const old = generateDataset({...input, generatorVersion: 2});
      assert.deepEqual(normalizationModel(data), normalizationModel(old));
      assert.equal(normalizationModel(data).length, 12);
      // Every source fact survives in the downloadable files, including users without operations.
      const rows = sourceFiles(data).flatMap(source => source.rows);
      for (const source of old.sources)
        for (const row of source.rows) {
          for (const [key, value] of Object.entries(row)) {
            assert.ok(
              rows.some(candidate => candidate[key] === value),
              `${source.name}: missing ${key}=${value}`,
            );
          }
        }
      assert.ok(
        exportFiles(input, ';').some(file => file.name.endsWith('.csv')),
      );
    });
  }
}
