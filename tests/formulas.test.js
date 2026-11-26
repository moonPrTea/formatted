import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formulaQuestions,
  FORMULA_TOPIC,
  FORMULA_FUNCTIONS,
} from '../build/src/core/formula-questions.js';
import {questions, makeQuiz} from '../build/src/core/quiz.js';
import {validateState} from '../build/src/core/storage.js';
import {normalizeConfig} from '../build/packages/practice/src/generator.js';

test('formula curriculum uses only the two functions in formuly.docx', () => {
  assert.deepEqual(FORMULA_FUNCTIONS, ['ИНДЕКС', 'ПОИСКПОЗ']);
  const seen = new Set();
  for (const q of questions.filter(item => item.topic === FORMULA_TOPIC)) {
    for (const text of [q.question, ...q.options, q.hint, q.explanation]) {
      for (const match of text.matchAll(/([А-ЯЁ][А-ЯЁ.]+)\(/g)) {
        seen.add(match[1]);
        assert.ok(
          FORMULA_FUNCTIONS.includes(match[1]),
          `Out-of-scope function in ${q.id}: ${match[1]}`,
        );
      }
    }
  }
  assert.deepEqual(seen, new Set(FORMULA_FUNCTIONS));
});

test('formula bank covers meaning, choosing a method, evaluation and debugging', () => {
  assert.equal(formulaQuestions.length, 20);
  assert.equal(questions.length, 44);
  const formulas = questions.filter(q => q.topic === FORMULA_TOPIC);
  assert.equal(formulas.length, 25);
  assert.deepEqual(
    new Set(formulas.map(q => q.skill)),
    new Set(['meaning', 'application', 'evaluation', 'debugging']),
  );
  for (const question of formulas) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.ok(Number.isInteger(question.correct));
    assert.ok(question.options[question.correct]);
    assert.ok(question.explanation.length > 40);
    assert.ok(question.hint.length > 20);
  }
});

test('each full formula round practices all four skills and preserves answers', () => {
  for (let seed = 0; seed < 40; seed++) {
    const quiz = makeQuiz(`formulas-${seed}`, FORMULA_TOPIC);
    assert.equal(quiz.length, 8);
    assert.equal(new Set(quiz.map(q => q.id)).size, 8);
    for (const skill of ['meaning', 'application', 'evaluation', 'debugging']) {
      assert.equal(quiz.filter(q => q.skill === skill).length, 2);
    }
    for (const q of quiz) {
      const original = questions.find(item => item.id === q.id);
      assert.equal(q.topic, FORMULA_TOPIC);
      assert.equal(q.options[q.correct], original.options[original.correct]);
    }
    assert.deepEqual(quiz, makeQuiz(`formulas-${seed}`, FORMULA_TOPIC));
  }
  for (const count of [1, 3, 4, 8, 25, 100]) {
    const quiz = makeQuiz('count', FORMULA_TOPIC, count);
    assert.equal(quiz.length, Math.min(count, 25));
    assert.equal(new Set(quiz.map(q => q.id)).size, quiz.length);
  }
  assert.notDeepEqual(
    makeQuiz('first', FORMULA_TOPIC),
    makeQuiz('second', FORMULA_TOPIC),
  );
});

test('worked formula examples distinguish a position, sheet row and ID', () => {
  const answer = id => {
    const q = formulaQuestions.find(item => item.id === id);
    return q.options[q.correct];
  };
  const names = ['Казань', 'Тула', 'Пермь'];
  const position = names.indexOf('Тула') + 1;
  assert.equal(answer('formula-match-offset'), String(position));
  assert.equal(
    answer('formula-nested-result'),
    String([3, 17, 42][position - 1]),
  );
  assert.equal(answer('formula-index-position'), String([8, 26, 71][3 - 1]));
  assert.ok(
    answer('formula-misaligned-result').startsWith(
      String([17, 42, 90][position - 1]),
    ),
  );
});

test('formula skill metadata survives saved quiz validation', () => {
  const quiz = {
    questions: makeQuiz('saved', FORMULA_TOPIC),
    topic: FORMULA_TOPIC,
    answers: [],
    pending: null,
    hint: false,
    completed: false,
  };
  const state = {
    version: 1,
    view: 'quiz',
    config: normalizeConfig(),
    delimiter: ';',
    exports: 0,
    session: null,
    history: [],
    quizHistory: [],
    quiz,
  };
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.quiz, quiz);
});
