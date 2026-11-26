import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rangeReference} from '../../build/sheets/app/services/range-picker.js';
import {Workbook} from '../../build/packages/spreadsheet/src/index.js';
import {
  catalog,
  categories,
  findFunctions,
} from '../../build/sheets/app/services/function-catalog.js';

test('range references normalize both directions and preserve absolute addresses', () => {
  assert.equal(rangeReference('Лист 1', 'B4', 'A2'), "'Лист 1'.$A$2:$B$4");
  assert.equal(rangeReference('Лист 1', 'A2', 'B4'), "'Лист 1'.$A$2:$B$4");
  assert.equal(rangeReference("O'Brien", 'a2', 'A2'), "'O''Brien'.$A$2");
  assert.equal(rangeReference('Data', 'AA10', 'Z9'), "'Data'.$Z$9:$AA$10");
  assert.throws(() => rangeReference('Data', 'A0', 'B2'));
  const book = new Workbook();
  book.addSheet("O'Brien");
  book.setCell("O'Brien", 'A2', 17);
  book.setFormula(
    "O'Brien",
    'B2',
    `=INDEX(${rangeReference("O'Brien", 'A2', 'A2')};1)`,
  );
  assert.equal(book.getValue("O'Brien", 'B2'), 17);
});

test('catalog searches both languages, handles ё, category and empty results', () => {
  assert.equal(findFunctions('', '', 'ru').length, 530);
  assert.deepEqual(
    findFunctions(' индекс ', '', 'en').map(f => f.en),
    ['INDEX'],
  );
  assert.ok(findFunctions('счет', '', 'ru').some(f => f.en === 'COUNT'));
  assert.ok(findFunctions('match', '', 'ru').some(f => f.en === 'XMATCH'));
  assert.ok(
    findFunctions('', 'LOGIC', 'ru').every(f => f.category === 'LOGIC'),
  );
  assert.equal(findFunctions('INDEX', 'TEXT', 'ru').length, 0);
  assert.equal(findFunctions('<script>', '', 'en').length, 0);
  assert.ok(catalog.every(f => categories[f.category]));
  for (const language of ['en', 'ru']) {
    const sorted = findFunctions('', '', language).map(f => f[language]);
    assert.deepEqual(
      sorted,
      [...sorted].sort((a, b) => a.localeCompare(b, language)),
    );
  }
});
