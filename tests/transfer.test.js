import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SheetSession} from '../build/src/sheets/session.js';
import {rangeTransfer} from '../build/src/sheets/transfer.js';
import {readDelimited, writeDelimited} from '../build/src/sheets/delimited.js';

const clipboard = () => {
  const data = new Map();
  return {
    setData: (key, value) => data.set(key, value),
    getData: key => data.get(key) ?? '',
  };
};
test('delimited tables roundtrip quotes, separators, multiline values and leading zeros', () => {
  const rows = [
    ['00123', 'a;"b', 'two\nlines'],
    ['', 'last', ''],
  ];
  for (const delimiter of [';', ',', '\t'])
    assert.deepEqual(
      readDelimited(
        '\uFEFF' + writeDelimited(rows, delimiter) + '\r\n',
        delimiter,
      ),
      rows,
    );
  for (const text of ['"open', '"closed"x', 'a\tb\nc'])
    assert.throws(() => readDelimited(text, '\t'));
});
test('range paste is atomic, preserves literals and formulas, and undoes as one edit', () => {
  const session = new SheetSession('Data');
  const transfer = rangeTransfer(session);
  const data = clipboard();
  data.setData('text/plain', 'hello "world"\t="yes"');
  transfer.paste('Data', 'A1', data, false);
  assert.equal(session.book.getValue('Data', 'A1'), 'hello "world"');
  assert.equal(session.book.getValue('Data', 'B1'), 'yes');
  session.undo();
  data.setData('text/plain', '00123\t=1+2\r\ntext\t4');
  transfer.paste('Data', 'A1', data, false);
  assert.equal(session.book.getValue('Data', 'A1'), '00123');
  assert.equal(session.book.getValue('Data', 'B1'), 3);
  session.undo();
  assert.equal(session.book.getStats().cells, 0);
  transfer.paste('Data', 'L100', data, false);
  assert.equal(session.book.getValue('Data', 'L101'), 'text');
  session.undo();
  assert.throws(() => transfer.paste('Data', 'L1048576', data, false));
  assert.equal(session.book.getStats().cells, 0);
  session.write('Data', 'A1', '=B1+$B$1');
  session.write('Data', 'B1', '2');
  transfer.copy('Data', 'A1:B1', data);
  transfer.paste('Data', 'A2', data, false);
  assert.equal(session.book.getValue('Data', 'A2'), 4);
  assert.match(session.book.getFormula('Data', 'A2'), /B2\+\$B\$1/);
  transfer.paste('Data', 'A3', data, true);
  assert.equal(session.book.getCell('Data', 'A3'), 4);
  session.write('Data', 'C1', "'=1");
  transfer.copy('Data', 'C1', data);
  transfer.paste('Data', 'C2', data, true);
  assert.equal(session.book.getCell('Data', 'C2'), '=1');
});
test('fill, clear and values maintain references and batch history through sheet changes', () => {
  const session = new SheetSession('Data');
  const transfer = rangeTransfer(session);
  session.write('Data', 'A1', '=B1+$B$1');
  session.write('Data', 'B1', '5');
  transfer.fill('Data', 'A1:A3');
  assert.equal(session.book.getValue('Data', 'A3'), 5);
  session.renameSheet('Data', 'New');
  session.undo();
  assert.equal(session.book.getCell('New', 'A3'), null);
  transfer.values('New', 'A1');
  assert.equal(session.book.getCell('New', 'A1'), 10);
  session.undo();
  assert.equal(typeof session.book.getCell('New', 'A1'), 'object');
  transfer.clear('New', 'A1:B2');
  assert.equal(session.book.getStats().cells, 0);
  session.undo();
  assert.equal(session.book.getValue('New', 'A1'), 10);
});

test('paste respects the active grid width and preserves data when a boundary is exceeded', () => {
  const session = new SheetSession('Data');
  const transfer = rangeTransfer(session, 12);
  const data = clipboard();
  data.setData('text/plain', '00101\t2\ntext\t4');
  assert.throws(() => transfer.paste('Data', 'L5000', data, false));
  assert.equal(session.book.getStats().cells, 0);
  transfer.paste('Data', 'K5000', data, false);
  assert.equal(session.book.getValue('Data', 'K5000'), '00101');
  assert.equal(session.book.getValue('Data', 'L5001'), 4);
  assert.throws(() => transfer.paste('Data', 'K1048576', data, false));
  assert.equal(session.book.getStats().cells, 4);
  session.undo();
  assert.equal(session.book.getStats().cells, 0);
});
