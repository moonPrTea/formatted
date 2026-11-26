import test from 'node:test';
import assert from 'node:assert/strict';
import {columnName} from '../../build/packages/spreadsheet/src/address.js';
import {
  launchSnapshot,
  gridSize,
} from '../../build/sheets/app/services/launch.js';
import {
  readSnapshot,
  readDocument,
  documentOf,
} from '../../build/sheets/app/services/document.js';
import {
  generateDataset,
  sourceFiles,
  normalizeConfig,
} from '../../build/src/core/generator.js';

test('Blank and lesson launches are explicit and malformed requests are rejected', () => {
  assert.deepEqual(launchSnapshot({kind: 'blank'}).document.cells, []);
  assert.equal(launchSnapshot({kind: 'lesson'}).sheet, 'Практика');
  for (const value of [
    null,
    {},
    {kind: 'oops'},
    {kind: 'variant'},
    {kind: 'variant', config: []},
  ])
    assert.throws(() => launchSnapshot(value));
});
for (const domain of ['retail', 'library', 'courses']) {
  test(`Variant ${domain} opens every source row and column without coercing text or losing data`, () => {
    const config = normalizeConfig({
      domain,
      size: 500,
      seed: 'LAUNCH',
      difficulty: 'advanced',
    });
    const snapshot = readSnapshot(launchSnapshot({kind: 'variant', config}));
    const book = readDocument(snapshot.document);
    const sources = sourceFiles(generateDataset(config));
    for (const source of sources) {
      const sheet = source.name.replace('.csv', '');
      for (let r = 0; r < source.rows.length; r++) {
        source.headers.forEach((header, c) =>
          assert.deepEqual(
            book.getCell(sheet, columnName(c + 1) + (r + 2)),
            source.rows[r][header],
          ),
        );
      }
    }
    assert.ok(gridSize(book).rows >= 501);
    assert.deepEqual(
      documentOf(readDocument(snapshot.document)),
      snapshot.document,
    );
  });
}
