import test from 'node:test';
import assert from 'node:assert/strict';
import {newVariant} from '../../build/formatted/app/services/variants.js';
import {generateDataset} from '../../build/packages/practice/src/generator.js';

test('new variants change every selection condition without changing seeded replay', () => {
  for (const domain of ['retail', 'library', 'courses']) {
    let config = {domain, size: 60, difficulty: 'basic', seed: 'ORIGINAL'};
    let sequence = 0;
    for (let i = 0; i < 12; i++) {
      const before = generateDataset(config);
      const next = newVariant(config, config, () => `NEW-${sequence++}`);
      const after = generateDataset(next);
      assert.notEqual(next.seed, config.seed);
      after.tasks.forEach((task, index) =>
        assert.notEqual(task.prompt, before.tasks[index].prompt),
      );
      assert.notDeepEqual(after.rows, before.rows);
      assert.deepEqual(generateDataset(config), before);
      config = next;
    }
  }
});

test('new variant protects against a repeated random seed', () => {
  const config = {
    domain: 'retail',
    seed: 'SAME',
    size: 20,
    difficulty: 'advanced',
  };
  assert.throws(() => newVariant(config, config, () => 'SAME'), /Не удалось/);
});
