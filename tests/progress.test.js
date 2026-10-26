import test from 'node:test';
import assert from 'node:assert/strict';
import {recentProgress, summarizeProgress} from '../build/src/core/progress.js';
import {generateDataset, normalizeConfig} from '../build/src/core/generator.js';
import {finishSession, startSession} from '../build/src/core/session.js';
import {renderHistoryTable} from '../build/src/progress-view.js';

function attempt(startedAt, duration, seed = 'progress') {
  return finishSession(
    startSession(normalizeConfig({seed}), 10, startedAt),
    startedAt + duration,
  );
}

test('empty progress has unknown accuracy and no history rows', () => {
  const progress = {history: [], quizHistory: []};
  assert.deepEqual(summarizeProgress(progress), {
    answered: 0,
    correct: 0,
    accuracy: null,
    minutes: 0,
  });
  assert.deepEqual(recentProgress(progress), []);
});

test('progress weights accuracy by answers and rounds each attempt separately', () => {
  const progress = {
    history: [attempt(1000, 31000), attempt(2000, 31000)],
    quizHistory: [
      {time: 10, topic: 'CSV', total: 1, correct: 1, hints: 0},
      {time: 20, topic: 'SQL', total: 8, correct: 0, hints: 1},
    ],
  };
  assert.deepEqual(summarizeProgress(progress), {
    answered: 9,
    correct: 1,
    accuracy: 11,
    minutes: 2,
  });
});

test('history merges both attempt types before applying the limit without mutation', () => {
  const practice = attempt(1000, 31000);
  const progress = {
    history: [practice],
    quizHistory: [
      {time: 100, topic: 'CSV', total: 8, correct: 3, hints: 0},
      {time: 40000, topic: 'SQL', total: 8, correct: 6, hints: 1},
    ],
  };
  const original = structuredClone(progress);
  const entries = recentProgress(progress, 2);
  assert.deepEqual(
    entries.map(entry => entry.kind),
    ['quiz', 'practice'],
  );
  assert.equal(entries[0].subtitle, 'SQL');
  assert.equal(entries[0].result, '6 / 8');
  assert.equal(entries[1].id, practice.id);
  assert.deepEqual(recentProgress(progress, 0), []);
  assert.deepEqual(progress, original);
});

test('practice rows regrade their saved variant and distinguish expired attempts', () => {
  const practice = attempt(1000, 600000, 'saved-variant');
  const dataset = generateDataset(practice.config);
  practice.answers = Object.fromEntries(
    dataset.tasks.map(task => [task.id, String(task.answer)]),
  );
  const [entry] = recentProgress({history: [practice], quizHistory: []});
  assert.equal(entry.result, '3 / 3');
  assert.equal(entry.subtitle, 'saved-variant');
  assert.equal(entry.badge, 'Время вышло');
  assert.equal(entry.time, practice.finishedAt);
});

test('history escapes saved values and only practice rows open a report', () => {
  const entry = {
    kind: 'practice',
    id: '\" onclick=\"alert(1)',
    time: 1000,
    name: '<script>bad()</script>',
    subtitle: '<img src=x>',
    result: '3 / 3',
    badge: 'Завершено',
  };
  const empty = {title: 'Пусто', description: 'Заверши попытку'};
  const icons = [];
  const markup = renderHistoryTable(
    [entry, {...entry, kind: 'quiz'}],
    name => {
      icons.push(name);
      return '';
    },
    empty,
  );
  assert.deepEqual(icons, ['database', 'quiz']);
  assert.equal(markup.match(/data-action="open-report"/g).length, 1);
  assert.ok(markup.includes('data-id="&quot; onclick=&quot;alert(1)"'));
  assert.ok(markup.includes('&lt;script&gt;bad()&lt;/script&gt;'));
  assert.ok(markup.includes('&lt;img src=x&gt;'));
  assert.ok(!markup.includes('<script>'));
  const emptyMarkup = renderHistoryTable([], () => '', empty);
  assert.ok(emptyMarkup.includes('Пусто'));
  assert.ok(!emptyMarkup.includes('<table'));
});
