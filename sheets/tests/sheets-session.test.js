import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SheetSession,
  parseInput,
} from '../../build/sheets/app/stores/session.js';

test('sheet session: example is independent and preserves raw source', () => {
  const session = new SheetSession();
  assert.equal(session.book.getValue('Исходник', 'C2'), ' Спортивная ');
  assert.equal(session.book.getValue('Практика', 'C2'), 'Спортивная');
  assert.equal(session.book.getValue('Практика', 'A2'), '00101');
  assert.equal(session.book.getValue('Практика', 'G2'), 3);
  assert.equal(session.book.getValue('Практика', 'H2'), 40);
  assert.equal(session.dirty, false);
  assert.equal(session.canUndo, false);
  session.write('Категории', 'A4', '777');
  assert.equal(session.book.getValue('Практика', 'H2'), 777);
  assert.equal(new SheetSession().book.getValue('Практика', 'H2'), 40);
});

test('sheet session: blank documents and new sheets are independent', () => {
  const session = new SheetSession('Лист1');
  assert.deepEqual(session.book.getSheetNames(), ['Лист1']);
  assert.equal(session.book.getValue('Лист1', 'A1'), null);
  assert.equal(session.dirty, false);
  session.write('Лист1', 'A1', '17');
  assert.equal(session.addSheet('ru'), 'Лист2');
  assert.equal(session.addSheet('en'), 'Sheet1');
  session.book.addSheet('sHeEt2');
  assert.equal(session.addSheet('en'), 'Sheet3');
  assert.equal(session.book.getValue('Лист1', 'A1'), 17);
  assert.equal(session.book.getValue('Лист2', 'A1'), null);
  assert.equal(new SheetSession('Лист1').book.getValue('Лист1', 'A1'), null);
  assert.equal(session.dirty, true);
  while (session.book.getSheetNames().length < 128) session.addSheet('ru');
  assert.throws(() => session.addSheet('ru'));
  assert.equal(session.book.getSheetNames().length, 128);
});

test('sheet session: input types are explicit and precision is guarded', () => {
  for (const [text, expected] of [
    ['00101', '00101'],
    ['12', 12],
    ['-3.5', -3.5],
    ['0', 0],
    ['', null],
    ["'12", '12'],
    ["'=1+2", '=1+2'],
    ["''hello", "'hello"],
    ["'", ''],
    ['3,5', '3,5'],
    ['TRUE', 'TRUE'],
  ])
    assert.deepEqual(parseInput(text), expected);
  assert.deepEqual(parseInput('=1+2'), {formula: '=1+2'});
  for (const text of ['9'.repeat(400), '9007199254740993'])
    assert.throws(() => parseInput(text), RangeError);
});

test('sheet session: editing roundtrip never changes literal text types', () => {
  const session = new SheetSession();
  for (const input of ['00101', '123', '-1.5', '=1+2', "'name", '', ' name ']) {
    session.book.setCell('Практика', 'A10', input);
    const displayed = session.source('Практика', 'A10', 'ru');
    session.write('Практика', 'A10', displayed);
    assert.equal(session.book.getValue('Практика', 'A10'), input);
    assert.equal(session.canUndo, false);
    assert.equal(session.dirty, false);
  }
});

test('sheet session: localized formulas and invalid input remain editable', () => {
  const session = new SheetSession();
  assert.match(session.source('Практика', 'H2', 'ru'), /ИНДЕКС/);
  assert.match(session.source('Практика', 'H2', 'en'), /INDEX/);
  for (const formula of ['=unknown', '=1+', '=A0', '=INDEX(']) {
    session.write('Практика', 'I1', formula);
    assert.equal(session.source('Практика', 'I1', 'en'), formula);
  }
});

test('sheet session: undo restores formulas and recalculates other sheets', () => {
  const session = new SheetSession();
  session.write('Категории', 'A4', '777');
  session.write('Практика', 'H2', '5');
  assert.equal(session.undo().address, 'H2');
  assert.equal(session.book.getValue('Практика', 'H2'), 777);
  assert.equal(session.undo().sheet, 'Категории');
  assert.equal(session.book.getValue('Практика', 'H2'), 40);
  assert.equal(session.undo(), undefined);
});

test('sheet session: rejected writes do not corrupt history or data', () => {
  const session = new SheetSession();
  for (const value of ['x'.repeat(32768), '9'.repeat(400)])
    assert.throws(() => session.write('Практика', 'A2', value));
  assert.equal(session.canUndo, false);
  assert.equal(session.dirty, false);
  assert.equal(session.book.getValue('Практика', 'A2'), '00101');
});

test('sheet session: history is capped, identical writes create no entries', () => {
  const session = new SheetSession();
  session.write('Практика', 'A2', '00101');
  assert.equal(session.canUndo, false);
  for (let i = 0; i < 120; i++) session.write('Практика', 'L100', String(i));
  for (let i = 0; i < 100; i++) assert.ok(session.undo());
  assert.equal(session.undo(), undefined);
  assert.equal(session.book.getValue('Практика', 'L100'), 19);
});
