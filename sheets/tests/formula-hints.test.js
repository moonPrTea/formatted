import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formulaHint} from '../../build/sheets/app/services/formula-hints.js';

const hint = (text, language = 'ru') =>
  formulaHint(text, text.length, language);
test('formula hints complete supported bilingual names and never literal text', () => {
  assert.deepEqual(hint('=инд').completion, {
    start: 1,
    end: 4,
    text: 'ИНДЕКС(',
  });
  assert.equal(hint('=ПОИСК', 'en').label, 'MATCH');
  assert.equal(hint('=1+ind', 'en').completion.start, 3);
  for (const text of [
    'инд',
    "='ИНД",
    '="ИНД',
    '=A1.ИНД',
    '=СУММ',
    '=INDEX(A1;1)',
    '="escaped "" INDEX(',
  ])
    assert.equal(hint(text), null);
});

test('completion reuses an existing opening parenthesis while editing a function name', () => {
  const source = '=ИНД(A1:A3;2)';
  const completion = formulaHint(source, 4, 'ru').completion;
  assert.equal(
    source.slice(0, completion.start) +
      completion.text +
      source.slice(completion.end),
    '=ИНДЕКС(A1:A3;2)',
  );
  assert.equal(formulaHint('=MATCH(A1;B1:B3;0)', 6, 'en').completion.end, 7);
});
test('formula argument hints respect nested calls, quoted sheets, strings and caret', () => {
  assert.equal(hint('=ИНДЕКС(A1:B2;').argument, 1);
  assert.equal(hint('=INDEX(A1:B2;MATCH("x;y";C1:C2;0);').argument, 2);
  assert.equal(hint("=INDEX('a;''b'.A1:A2;").argument, 1);
  assert.equal(hint('=INDEX(A1:A2;MATCH(').label, 'ПОИСКПОЗ');
  assert.equal(hint('=INDEX(A1:A2;(1+2').argument, 1);
  assert.equal(formulaHint('=INDEX(A1;2)', 9, 'en').argument, 0);
});
