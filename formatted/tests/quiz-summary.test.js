import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeQuiz} from '../../build/formatted/app/services/quiz-summary.js';

test('quiz summary separates correct hinted answers from mistakes', () => {
  const result = summarizeQuiz({
    questions: ['CSV', 'CSV', 'Формулы', 'Формулы'].map(topic => ({topic})),
    answers: [
      {correct: true, hint: false},
      {correct: false, hint: true},
      {correct: true, hint: true},
      {correct: false, hint: false},
    ],
  });
  assert.deepEqual(result, {
    correct: 2,
    independent: 1,
    hinted: 1,
    incorrect: 2,
    topics: [
      {topic: 'CSV', total: 2, correct: 1, hinted: 0},
      {topic: 'Формулы', total: 2, correct: 1, hinted: 1},
    ],
  });
});

test('unanswered questions do not count as mistakes or completed topics', () => {
  const result = summarizeQuiz({
    questions: [{topic: 'CSV'}],
    answers: [],
  });
  assert.equal(result.incorrect, 0);
  assert.equal(result.correct, 0);
  assert.deepEqual(result.topics, []);
});
