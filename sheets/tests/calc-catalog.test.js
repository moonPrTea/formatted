import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogData} from '../../build/sheets/app/services/catalog-data.js';

test('pinned Calc catalog has unique bilingual names and all category groups', () => {
  const rows = catalogData
    .trim()
    .split('\n')
    .map(row => row.split('|'));
  assert.equal(rows.length, 530);
  assert.equal(new Set(rows.map(row => row[0])).size, rows.length);
  assert.ok(rows.every(row => row.length === 3 && row.every(Boolean)));
  assert.equal(new Set(rows.map(row => row[2])).size, 11);
  const names = new Map(rows.map(([en, ru]) => [en, ru]));
  for (const [en, ru] of [
    ['INDEX', 'ИНДЕКС'],
    ['MATCH', 'ПОИСКПОЗ'],
    ['SUM', 'СУММ'],
    ['TRIM', 'СЖПРОБЕЛЫ'],
    ['WORKDAY', 'РАБДЕНЬ'],
    ['ISEVEN_ADD', 'ЕЧЁТН_ADD'],
    ['WEEKNUM_EXCEL2003', 'НОМНЕДЕЛИ_EXCEL2003'],
    ['WEEKS', 'НЕДЕЛИ'],
    ['OPT_BARRIER', 'OPT_BARRIER'],
    ['XLOOKUP', 'ПРОСМОТРX'],
  ])
    assert.equal(names.get(en), ru);
  assert.ok(!names.has('#All'));
});
