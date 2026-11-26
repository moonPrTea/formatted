import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFunction,
  readFunction,
} from '../../build/sheets/app/services/wizard-model.js';

test('wizard builds localized functions and omits only the optional INDEX argument', () => {
  assert.equal(
    buildFunction('INDEX', [' A1:B3 ', '2', ''], 'ru'),
    '=ИНДЕКС(A1:B3;2)',
  );
  assert.equal(
    buildFunction('INDEX', ['A1:B3', '2', '1'], 'en'),
    '=INDEX(A1:B3;2;1)',
  );
  assert.equal(
    buildFunction('MATCH', ['C2', 'A1:A3', '0'], 'ru'),
    '=ПОИСКПОЗ(C2;A1:A3;0)',
  );
});

test('wizard retains incomplete and invalid arguments instead of resetting fields', () => {
  for (const [source, name, args] of [
    ['=ПОИСКПОЗ(C2;Категории.B2:B4;0', 'MATCH', ['C2', 'Категории.B2:B4', '0']],
    ['=index(A1:B4;', 'INDEX', ['A1:B4', '']],
    ['=ИНДЕКС(А1:А3;2)', 'INDEX', ['А1:А3', '2']],
    ['=ИНДЕКС', 'INDEX', []],
    ['=MATCH("not;finished', 'MATCH', ['"not;finished']],
    [
      "=INDEX('a;''b'.A1:A4;MATCH(\"x;y\";B1:B4;0)",
      'INDEX',
      ["'a;''b'.A1:A4", 'MATCH("x;y";B1:B4;0)'],
    ],
  ]) {
    assert.deepEqual(readFunction(source, 'ru'), {name, args}, source);
  }
  for (const source of ['=INDEX(A1;1)+', '=MATCH(A1;A1;0))', '=INDEXED(A1;1)'])
    assert.equal(readFunction(source, 'en'), null);
});

test('wizard reads nested functions without splitting text or quoted sheet names', () => {
  const parsed = readFunction(
    '=ИНДЕКС(\'A;B\'.A1:A3;ПОИСКПОЗ("x;y";C1:C3;0))',
    'en',
  );
  assert.equal(parsed.name, 'INDEX');
  assert.deepEqual(parsed.args, ["'A;B'.A1:A3", 'MATCH("x;y";C1:C3;0)']);
  for (const source of ['=1+', '=SUM(A1:A2)', 'text', '=1+2'])
    assert.equal(readFunction(source, 'ru'), null);
});
