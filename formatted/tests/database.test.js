import test from 'node:test';
import assert from 'node:assert/strict';
import {
  databaseSteps,
  readDatabaseProgress,
} from '../../build/formatted/app/services/database-lesson.js';

test('Database lesson has six bounded knowledge checks, sources and no automatic SQL claim', () => {
  assert.equal(databaseSteps.length, 6);
  for (const step of databaseSteps) {
    assert.equal(step.tasks.length, 3);
    assert.ok(step.tags.length >= 3 && step.tags.length <= 4);
    assert.equal(new Set(step.tags).size, step.tags.length);
    assert.ok(step.correct >= 0 && step.correct < step.answers.length);
    assert.ok(
      step.source.startsWith('https://www.postgresql.org/') ||
        step.source.startsWith('https://www.pgadmin.org/'),
    );
  }
});
test('Database progress restores drafts and rejects invalid indices and excessive text', () => {
  const empty = readDatabaseProgress(null);
  const state = {...empty, step: 5, drafts: ['SELECT 1;'], answers: [1]};
  const restored = readDatabaseProgress(state);
  assert.equal(restored.step, 5);
  assert.equal(restored.drafts[0], 'SELECT 1;');
  assert.equal(restored.answers[0], 1);
  assert.deepEqual(
    readDatabaseProgress({
      step: 99,
      drafts: ['x'.repeat(50001)],
      answers: [-1, 99],
    }),
    empty,
  );
});
