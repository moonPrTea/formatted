import test from 'node:test';
import assert from 'node:assert/strict';
import {sqlTokens} from '../../build/formatted/app/services/sql-highlight.js';

test('SQL highlights keywords, literals and identifiers without changing text', () => {
  const sql = `select "product_code", price FROM products WHERE price >= 12.5 AND name = 'Кеды';`;
  const tokens = sqlTokens(sql);
  assert.equal(tokens.map(t => t.text).join(''), sql);
  assert.equal(tokens[0].kind, 'keyword');
  assert.equal(
    tokens.find(t => t.text === '"product_code"').kind,
    'identifier',
  );
  assert.equal(tokens.find(t => t.text === '12.5').kind, 'number');
  assert.equal(tokens.find(t => t.text === "'Кеды'").kind, 'string');
});

test('SQL handles comments, escaped quotes and incomplete typing', () => {
  for (const sql of [
    '/* outer /* inner */ still outer */ SELECT',
    "-- SELECT 'x'\nSELECT E'it\\'s', 'it''s', \"a\"\"b\";",
    "$body$ SELECT '<script>' $body$",
    'SELECT $$ unfinished',
    "SELECT 'unterminated\n",
    'SELECT "unfinished',
    '/* unterminated',
    'SELECT .5, 1e-4, NULL;\r\n',
    "SELECT '<img src=x onerror=alert(1)>', '😀';",
    '',
  ]) {
    assert.equal(
      sqlTokens(sql)
        .map(t => t.text)
        .join(''),
      sql,
    );
  }
  assert.equal(sqlTokens('/* a /* b */ c */')[0].kind, 'comment');
  assert.equal(sqlTokens('$body$ SELECT $body$')[0].kind, 'string');
  assert.equal(sqlTokens('-- SELECT')[0].kind, 'comment');
});

test('SQL highlighting accepts the full draft size and repeated edits', () => {
  const sql = 'SELECT name, 1 FROM items; -- test\n'
    .repeat(1600)
    .slice(0, 50000);
  assert.equal(
    sqlTokens(sql)
      .map(t => t.text)
      .join(''),
    sql,
  );
  assert.equal(sqlTokens('SELECT')[0].kind, 'keyword');
  assert.equal(sqlTokens('selected')[0].kind, 'plain');
});
