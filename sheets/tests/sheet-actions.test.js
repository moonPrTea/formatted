import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Workbook} from '../../build/packages/spreadsheet/src/index.js';
import {SheetSession} from '../../build/sheets/app/stores/session.js';

test('sheet rename preserves order, cells, references, literals and cache invalidation', () => {
  const book = new Workbook();
  for (const name of ['Source', 'Result']) book.addSheet(name);
  book.setCell('Source', 'A1', 10);
  book.setFormula('Source', 'B1', '=A1*2');
  book.setFormula('Result', 'A1', '=INDEX($Source.$A$1:$B$1;1;2)+source.A1');
  book.setFormula('Result', 'B1', '="Source.A1"');
  book.setFormula('Result', 'C1', '=1+');
  assert.equal(book.getValue('Result', 'A1'), 30);
  book.renameSheet('SOURCE', "O'Brien data");
  assert.deepEqual(book.getSheetNames(), ["O'Brien data", 'Result']);
  assert.equal(book.getValue('Result', 'A1'), 30);
  assert.equal(book.getValue('Result', 'B1'), 'Source.A1');
  assert.deepEqual(book.getCell('Result', 'C1'), {formula: '=1+'});
  assert.match(book.getFormula('Result', 'A1'), /\$'O''Brien data'\.\$A\$1/);
  book.setCell("O'Brien data", 'A1', 4);
  assert.equal(book.getValue('Result', 'A1'), 12);
  book.renameSheet("O'Brien data", "O'BRIEN DATA");
  assert.equal(book.getValue('Result', 'A1'), 12);
  for (const name of ['', ' ', 'Result', 'rEsUlT', 'a\nb', 'a'.repeat(101)])
    assert.throws(() => book.renameSheet("O'BRIEN DATA", name));
  assert.throws(() => book.renameSheet('Missing', 'New'));
  assert.deepEqual(book.getSheetNames(), ["O'BRIEN DATA", 'Result']);
});

test('sheet deletion invalidates references permanently and keeps last sheet safe', () => {
  const book = new Workbook();
  for (const name of ['Source', 'Result']) book.addSheet(name);
  book.setCell('Source', 'A1', 12);
  book.setFormula('Result', 'A1', '=Source.A1+1');
  book.setFormula('Result', 'B1', '=INDEX(Source.A1:A2;1)');
  book.setFormula('Result', 'C1', '=A1');
  assert.equal(book.getValue('Result', 'C1'), 13);
  book.deleteSheet('source');
  for (const address of ['A1', 'B1', 'C1'])
    assert.equal(book.getValue('Result', address).code, '#REF!');
  assert.equal(book.getStats().cells, 3);
  assert.equal(book.getStats().dependencies, 1);
  assert.throws(() => book.deleteSheet('Result'));
  book.addSheet('Source');
  book.setCell('Source', 'A1', 99);
  assert.equal(book.getValue('Result', 'A1').code, '#REF!');
  assert.throws(() => book.deleteSheet('Missing'));
  book.setFormula('Result', 'A1', '=Source.A1');
  assert.equal(book.getValue('Result', 'C1'), 99);
});

test('session history follows renamed sheets and cannot resurrect deleted references', () => {
  const session = new SheetSession('One');
  session.addSheet('en');
  session.write('One', 'A1', '5');
  session.write('Sheet1', 'A1', '=One.A1');
  session.write('Sheet1', 'A1', '7');
  session.renameSheet('one', 'New');
  session.undo();
  assert.equal(session.book.getValue('Sheet1', 'A1'), 5);
  session.write('Sheet1', 'A1', '8');
  session.deleteSheet('new');
  session.undo();
  assert.equal(session.book.getValue('Sheet1', 'A1').code, '#REF!');
  while (session.canUndo) assert.equal(session.undo().sheet, 'Sheet1');
  const blank = new SheetSession('Only');
  assert.throws(() => blank.deleteSheet('Only'));
  assert.throws(() => blank.renameSheet('Only', ''));
  assert.equal(blank.dirty, false);
});

test('sheet actions cover sparse cells, cycles and the maximum sheet count', () => {
  const book = new Workbook();
  for (let i = 0; i < 128; i++) book.addSheet('Sheet' + i);
  book.setCell('Sheet0', 'XFD1048576', 42);
  book.setFormula('Sheet1', 'A1', '=Sheet0.XFD1048576');
  book.setFormula('Sheet0', 'B1', '=Sheet1.B1');
  book.setFormula('Sheet1', 'B1', '=Sheet0.B1');
  assert.equal(book.getValue('Sheet1', 'B1').code, '#CYCLE!');
  book.renameSheet('Sheet0', 'Renamed');
  assert.equal(book.getValue('Sheet1', 'A1'), 42);
  assert.equal(book.getValue('Sheet1', 'B1').code, '#CYCLE!');
  book.deleteSheet('Renamed');
  assert.equal(book.getValue('Sheet1', 'B1').code, '#REF!');
  assert.equal(book.getStats().dependencies, 0);
  book.addSheet('Replacement');
  assert.equal(book.getSheetNames().length, 128);
});
