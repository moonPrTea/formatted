import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDataset} from '../../build/packages/practice/src/generator.js';
import {normalizationModel} from '../../build/formatted/app/services/normalization-model.js';
import {
  checkNormalization,
  parseSchema,
} from '../../build/formatted/app/services/normalization.js';
import {readCsv} from '../../build/formatted/app/services/read-csv.js';
import {toCsv} from '../../build/packages/practice/src/csv.js';
import {themeFixture} from './ai-fixture.js';

function submission(data, delimiter = ';') {
  const model = normalizationModel(data);
  const schema = [],
    files = {};
  for (const table of model) {
    const parents = table.parents.map(name => model.find(t => t.name === name));
    const shared = parent =>
      table.fields.filter(
        f =>
          parent.fields.includes(f) ||
          (table.name === 'cohorts' &&
            f === 'teacher_code' &&
            parent.name === 'users'),
      );
    const local = table.fields.filter(
      f => !parents.some(p => shared(p).includes(f)),
    );
    const headers = [
      'id',
      ...local.map(f => `col_${f}`),
      ...parents.map(p => `${p.name}_id`),
    ];
    const rows = table.rows.map((row, i) => ({
      id: `00${i + 7}`,
      ...Object.fromEntries(local.map(f => [`col_${f}`, row[f]])),
      ...Object.fromEntries(
        parents.map(parent => {
          const index = parent.rows.findIndex(p =>
            shared(parent).every(
              f => p[f === 'teacher_code' ? 'user_code' : f] === row[f],
            ),
          );
          assert.notEqual(index, -1);
          return [`${parent.name}_id`, `00${index + 7}`];
        }),
      ),
    }));
    schema.push({
      entity: table.name,
      file: `${table.name}.csv`,
      primaryKey: ['id'],
      columns: Object.fromEntries(local.map(f => [f, `col_${f}`])),
      references: parents.map(p => ({
        columns: [`${p.name}_id`],
        table: p.name,
      })),
    });
    files[`${table.name}.csv`] = toCsv(headers, rows, delimiter);
  }
  return {schema, files};
}

for (const domain of ['retail', 'library', 'courses']) {
  test(`${domain}: checks independent surrogate IDs, names, AI themes and delimiters`, () => {
    for (const delimiter of [';', ','])
      for (const aiTheme of [undefined, themeFixture(domain)]) {
        const data = generateDataset({domain, aiTheme, difficulty: 'advanced'});
        const {schema, files} = submission(data, delimiter);
        assert.deepEqual(checkNormalization(data, schema, files, delimiter), {
          passed: true,
          issues: [],
          tables: 12,
        });
        const table = readCsv(files['users.csv'], delimiter);
        table.rows[0].col_full_name = 'Wrong name';
        files['users.csv'] = toCsv(table.headers, table.rows, delimiter);
        assert.equal(
          checkNormalization(data, schema, files, delimiter).passed,
          false,
        );
      }
  });
}

test('normalization rejects duplicates, missing rows, broken and incorrect foreign keys', () => {
  const data = generateDataset({domain: 'retail'});
  for (const mutate of [
    rows => rows.pop(),
    rows => rows.push({...rows[0]}),
    rows => {
      rows[0].cities_id = 'not-found';
    },
    rows => {
      rows[0].id = rows[1].id;
    },
    rows => {
      rows[0].id = '';
    },
    rows => {
      rows[0].cities_id = '008';
      rows[1].cities_id = '009';
    },
    rows => rows.push({...rows[0], id: 'another-id'}),
  ]) {
    const {schema, files} = submission(data);
    const table = readCsv(files['users.csv']);
    mutate(table.rows);
    files['users.csv'] = toCsv(table.headers, table.rows);
    assert.equal(checkNormalization(data, schema, files, ';').passed, false);
  }
});

test('normalization refuses malformed contracts and missing files', () => {
  assert.throws(() => parseSchema('{}'));
  const data = generateDataset({});
  const {schema, files} = submission(data);
  delete files['cities.csv'];
  assert.throws(
    () => checkNormalization(data, schema, files, ';'),
    /Не загружен/,
  );
  schema[0].file = '../secret.csv';
  assert.throws(() => parseSchema(JSON.stringify(schema)));
});

test('CSV parser preserves text, BOM, quotes, multiline and leading zeros', () => {
  assert.deepEqual(readCsv('\uFEFFid;name\r\n001;"one;\n""two"""\r\n').rows, [
    {id: '001', name: 'one;\n"two"'},
  ]);
  assert.equal(readCsv('id,name\n001,A', ',').rows[0].id, '001');
  for (const text of ['id;id\n1;2', 'id;name\n1', 'id\n"open', 'id\n"ok"x'])
    assert.throws(() => readCsv(text));
});
