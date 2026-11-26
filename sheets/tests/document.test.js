import test from 'node:test';
import assert from 'node:assert/strict';
import {Workbook} from '../../build/packages/spreadsheet/src/workbook.js';
import {
  documentOf,
  readDocument,
  readSnapshot,
} from '../../build/sheets/app/services/document.js';
import {SheetSession} from '../../build/sheets/app/stores/session.js';

test('Workbook round trip retains sheet order, types, literal text and original formulas', () => {
  const book = new Workbook();
  book.addSheet('Товары');
  book.addSheet("Категории 'копия'");
  const inputs = [
    '00101',
    2.5,
    true,
    '',
    '=literal',
    {formula: '=ИНДЕКС(B1;1)'},
    {formula: '=ИНДЕКС('},
  ];
  inputs.forEach((input, i) =>
    book.setCell('Товары', String.fromCharCode(65 + i) + '1', input),
  );
  book.setCell("Категории 'копия'", 'L100', 'конец');
  book.setCell('Товары', 'A50000', '00101');
  book.setCell('Товары', 'B50000', {formula: '=B1+1'});
  const restored = readDocument(JSON.parse(JSON.stringify(documentOf(book))));
  assert.deepEqual(documentOf(restored), documentOf(book));
  assert.equal(restored.getValue('Товары', 'F1'), 2.5);
  assert.equal(restored.getValue('Товары', 'G1').code, '#PARSE!');
  assert.equal(restored.getValue('Товары', 'A50000'), '00101');
  assert.equal(restored.getValue('Товары', 'B50000'), 3.5);
  const exported = documentOf(book);
  exported.cells[5].input.formula = '=0';
  assert.equal(book.getValue('Товары', 'F1'), 2.5);
});
test('Malformed, duplicate, invisible and oversized cells are rejected without changing a book', () => {
  const good = {format: 'formatted', version: 1, sheets: ['Лист'], cells: []};
  for (const change of [
    {version: 2},
    {sheets: []},
    {sheets: ['Лист', 'лист']},
    {cells: [{sheet: 'Лист', address: 'AAA1', input: 1}]},
    {cells: [{sheet: 'Лист', address: 'A1048577', input: 1}]},
    {cells: [{sheet: 'Unknown', address: 'A1', input: 1}]},
    {cells: [{sheet: 'Лист', address: 'A1', input: {evil: 1}}]},
    {cells: [{sheet: 'Лист', address: 'A1', input: 'x'.repeat(32768)}]},
    {cells: Array(2).fill({sheet: 'Лист', address: 'A1', input: 1})},
  ])
    assert.throws(() => readDocument({...good, ...change}));
  assert.throws(() => readDocument(null));
});
test('Recovery includes an uncommitted formula, language and active sheet', () => {
  const session = new SheetSession('Sheet1');
  const state = {
    document: documentOf(session.book),
    language: 'en',
    sheet: 'Sheet1',
    address: 'B2',
    dirty: false,
    draft: {sheet: 'Sheet1', address: 'B2', text: '=INDEX('},
  };
  assert.deepEqual(readSnapshot(state), state);
  assert.throws(() => readSnapshot({...state, language: 'xx'}));
  assert.throws(() =>
    readSnapshot({...state, draft: {...state.draft, address: 'AAA2'}}),
  );
  session.write('Sheet1', 'A1', '10');
  session.dirty = false;
  session.undo();
  assert.equal(session.dirty, true);
});

test('Recovery preserves distant selections and drafts within spreadsheet limits', () => {
  const session = new SheetSession('Data');
  session.write('Data', 'A1048576', '00101');
  const state = {
    document: documentOf(session.book),
    language: 'ru',
    sheet: 'Data',
    address: 'ZZ1048576',
    dirty: true,
    draft: {sheet: 'Data', address: 'B50000', text: '=ИНДЕКС('},
  };
  assert.deepEqual(readSnapshot(state), state);
  assert.throws(() => readSnapshot({...state, address: 'A1048577'}));
  assert.throws(() =>
    readSnapshot({...state, draft: {...state.draft, address: 'AAA1'}}),
  );
});
