import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Workbook} from '../../build/packages/spreadsheet/src/index.js';
import {errorExplanation} from '../../build/sheets/app/services/error-messages.js';

test('each engine error has an actionable explanation in both languages', () => {
  for (const code of [
    '#PARSE!',
    '#REF!',
    '#VALUE!',
    '#NAME?',
    '#N/A',
    '#DIV/0!',
    '#NUM!',
    '#CYCLE!',
    '#LIMIT!',
    '#UNSUPPORTED!',
  ]) {
    const ru = errorExplanation(code, 'ru');
    const en = errorExplanation(code, 'en');
    assert.match(ru, /[А-Яа-я]/);
    assert.match(en, /[A-Za-z]/);
    assert.notEqual(ru, en);
  }
});

test('the reported formula has syntax and then range errors, not a missing match', () => {
  const book = new Workbook();
  book.addSheet('Data');
  book.setCell('Data', 'I2', {formula: '=ИНДЕКС(B2;2;2);I3'});
  assert.equal(book.getValue('Data', 'I2').code, '#PARSE!');
  assert.match(
    errorExplanation('#PARSE!', 'ru'),
    /после её закрывающей скобки/,
  );
  book.setCell('Data', 'I2', {formula: '=ИНДЕКС(B2;2;2)'});
  assert.equal(book.getValue('Data', 'I2').code, '#REF!');
  assert.match(errorExplanation('#REF!', 'ru'), /одной ячейки/);
});
