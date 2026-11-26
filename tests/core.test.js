import test from 'node:test';
import assert from 'node:assert/strict';
import {
  domains,
  generateDataset as generate,
  normalizeConfig,
  exportFiles as exportBundle,
  gradeTasks,
  clean,
} from '../build/packages/practice/src/generator.js';
import {toCsv} from '../build/packages/practice/src/csv.js';
import {questions, topics, makeQuiz} from '../build/src/core/quiz.js';
import {
  startSession,
  remainingMs,
  finishSession,
  formatTime,
} from '../build/src/core/session.js';
import {validateState} from '../build/src/core/storage.js';

const generateDataset = input => generate({...input, generatorVersion: 1});
const exportFiles = (input, delimiter) =>
  exportBundle({...input, generatorVersion: 1}, delimiter);

// Independent CSV reader used only to verify the application's serializer.
function readCsv(csv, separator) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  csv = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && ch === separator) {
      row.push(cell);
      cell = '';
    } else if (!quoted && ch === '\r' && csv[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += ch;
  }
  assert.equal(quoted, false);
  return rows;
}

for (const domain of domains)
  for (const difficulty of ['basic', 'advanced']) {
    test(`legacy ${domain.id}/${difficulty}: deterministic data, export and independently computed answers`, () => {
      for (const seed of ['FORMA-01', 'case_17', '0', 'boundary']) {
        const config = {domain: domain.id, seed, difficulty, size: 120};
        const data = generateDataset(config);
        assert.deepEqual(data, generateDataset(config));
        assert.notDeepEqual(
          data.rows,
          generateDataset({...config, seed: seed + '-2'}).rows,
        );
        assert.equal(data.rows.length, config.size);
        for (const delimiter of [';', ',']) {
          const files = exportFiles(config, delimiter);
          assert.deepEqual(
            files.map(f => f.name),
            ['source.csv', 'assignment.md', 'variant.json'],
          );
          assert.ok(!files[1].content.includes('"answer"'));
          const parsed = readCsv(files[0].content, delimiter);
          assert.deepEqual(parsed[0], data.headers);
          assert.equal(parsed.length, config.size + 1);
          data.rows.forEach((row, i) =>
            assert.deepEqual(
              parsed[i + 1],
              data.headers.map(key => String(row[key])),
            ),
          );
        }
        const [filter, distinct, aggregate] = data.tasks;
        const category = filter.prompt.match(/«(.*?)»/)[1];
        const threshold = Number(filter.prompt.match(/>= (\d+)/)[1]);
        const status = distinct.prompt.match(/«(.*?)»/)[1];
        const start = aggregate.prompt.match(/\d{4}-\d{2}-\d{2}/)[0];
        const normalized = data.rows.map(r => ({
          ...r,
          [data.categorical]: clean(r[data.categorical]),
        }));
        assert.equal(
          filter.answer,
          normalized.filter(
            r =>
              r[data.categorical] === category && r[data.numeric] >= threshold,
          ).length,
        );
        assert.equal(
          distinct.answer,
          new Set(
            normalized
              .filter(r => r.status === status)
              .map(r => r[data.distinct]),
          ).size,
        );
        assert.equal(
          aggregate.answer,
          normalized
            .filter(r => r[data.time] >= start)
            .reduce((sum, row) => sum + row[data.numeric], 0),
        );
        assert.ok(
          gradeTasks(
            data,
            Object.fromEntries(data.tasks.map(t => [t.id, String(t.answer)])),
          ).every(t => t.correct),
        );
        assert.ok(gradeTasks(data, {}).every(t => !t.correct));
        assert.ok(
          gradeTasks(
            data,
            Object.fromEntries(data.tasks.map(t => [t.id, 'NaN'])),
          ).every(t => !t.correct),
        );
      }
    });
  }

test('generation boundaries and invalid settings', () => {
  for (const domain of domains)
    for (const size of [20, 500])
      assert.equal(
        generateDataset({domain: domain.id, size}).rows.length,
        size,
      );
  for (const config of [
    {domain: 'missing'},
    {seed: '../x'},
    {seed: '=1+1'},
    {seed: ''},
    {size: 19},
    {size: 501},
    {size: 20.5},
    {difficulty: 'unknown'},
  ])
    assert.throws(() => normalizeConfig(config));
});

test('source functional dependencies hold; copies, courses and documents are different models', () => {
  const assertDependency = (rows, key, columns) => {
    const seen = new Map();
    for (const row of rows) {
      const signature = columns.map(c => row[c]);
      if (seen.has(row[key])) assert.deepEqual(seen.get(row[key]), signature);
      seen.set(row[key], signature);
    }
  };
  const retail = generateDataset({domain: 'retail', size: 500}).rows;
  assertDependency(retail, 'order_id', ['order_date', 'client_code', 'status']);
  assertDependency(retail, 'product_code', [
    'product_name',
    'category',
    'supplier',
  ]);
  assert.equal(
    new Set(retail.map(r => `${r.order_id}/${r.line_no}`)).size,
    retail.length,
  );
  assert.ok(new Set(retail.map(r => r.order_id)).size < retail.length);
  const library = generateDataset({domain: 'library', size: 500}).rows;
  assertDependency(library, 'copy_code', ['book_code', 'shelf']);
  assertDependency(library, 'book_code', [
    'book_title',
    'publisher',
    'authors',
    'genre',
  ]);
  const last = new Map();
  for (const row of library) {
    const old = last.get(row.copy_code);
    if (old) {
      assert.ok(
        Date.parse(row.loan_date) >
          Date.parse(old.loan_date) + old.days * 86400000,
      );
      assert.equal(old.status, 'Возвращена');
    }
    last.set(row.copy_code, row);
  }
  const courses = generateDataset({domain: 'courses', size: 500}).rows;
  assertDependency(courses, 'cohort_code', ['course_code', 'teacher_code']);
  assertDependency(courses, 'course_code', [
    'course_title',
    'direction',
    'hours',
  ]);
  assert.equal(
    new Set(courses.map(r => `${r.student_code}/${r.cohort_code}`)).size,
    courses.length,
  );
});

test('CSV quotes delimiters, newlines, double quotes, BOM and formula-like strings', () => {
  const rows = [
    {a: '00107', b: 'Иван, «Дом»; "Тест"\nСтрока', c: '=1+1', d: -2, e: null},
  ];
  for (const delimiter of [',', ';']) {
    const csv = toCsv(Object.keys(rows[0]), rows, delimiter);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.deepEqual(readCsv(csv, delimiter)[1], [
      '00107',
      rows[0].b,
      "'=1+1",
      '-2',
      '',
    ]);
  }
  assert.throws(() => toCsv(['x'], [], '|'));
});

test('quiz bank and shuffling preserve the correct answer', () => {
  assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
  for (const q of questions) {
    assert.ok(q.correct >= 0 && q.correct < q.options.length);
    assert.equal(new Set(q.options).size, q.options.length);
    assert.ok(q.explanation && q.hint);
  }
  for (const topic of ['Все темы', ...topics]) {
    const quiz = makeQuiz('known', topic);
    assert.deepEqual(quiz, makeQuiz('known', topic));
    assert.equal(new Set(quiz.map(q => q.id)).size, quiz.length);
    for (const item of quiz) {
      const source = questions.find(q => q.id === item.id);
      assert.equal(item.options[item.correct], source.options[source.correct]);
      if (topic !== 'Все темы') assert.equal(item.topic, topic);
    }
  }
  assert.throws(() => makeQuiz('x', 'missing'));
});

test('timer uses persisted deadlines, expires after sleep, and cannot submit twice', () => {
  const start = 100000;
  const session = startSession({}, 45, start);
  const restored = JSON.parse(JSON.stringify(session));
  assert.equal(remainingMs(restored, start + 1000), 2699000);
  assert.equal(remainingMs(restored, start + 99999999), 0);
  const expired = finishSession(restored, start + 99999999);
  assert.equal(expired.status, 'expired');
  assert.equal(expired.finishedAt, session.deadline);
  assert.deepEqual(finishSession(expired, start + 500), expired);
  assert.equal(finishSession(session, start + 30000).status, 'submitted');
  assert.equal(formatTime(59999), '01:00');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(-1), '00:00');
  for (const minutes of [0, 241, 1.5, NaN])
    assert.throws(() => startSession({}, minutes));
});

test('saved-state validation accepts recovery but rejects malformed history and timers', () => {
  const state = {
    version: 1,
    config: normalizeConfig(),
    delimiter: ';',
    exports: 0,
    session: startSession(normalizeConfig(), 45, 100),
    history: [],
    quizHistory: [],
    quiz: null,
  };
  assert.deepEqual(validateState(state), state);
  assert.throws(() => validateState({...state, history: [{}]}));
  assert.throws(() =>
    validateState({...state, session: {...state.session, deadline: 'later'}}),
  );
  assert.throws(() =>
    validateState({...state, session: {...state.session, checks: [4]}}),
  );
  assert.throws(() => validateState({...state, quiz: {questions: []}}));
  assert.throws(() => validateState({...state, exports: -1}));
});
