import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDataset as generate,
  exportFiles as exportCurrent,
  gradeTasks,
  normalizeConfig,
} from '../build/packages/practice/src/generator.js';
import {validateState} from '../build/src/core/storage.js';
import {startSession} from '../build/src/core/session.js';
import {themeFixture} from './ai-fixture.js';
const generateDataset = input => generate({...input, generatorVersion: 2});
const exportFiles = (input, delimiter) =>
  exportCurrent({...input, generatorVersion: 2}, delimiter);

function readCsv(text, delimiter) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (!quoted && char === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += char;
  }
  assert.equal(quoted, false);
  assert.equal(cell, '');
  return rows;
}

const clean = rows =>
  rows.map(row =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ]),
    ),
  );
const key = (row, columns) =>
  JSON.stringify(columns.map(column => row[column]));
function project(rows, keys, fields) {
  const result = new Map();
  for (const row of rows) {
    const id = key(row, keys);
    const value = Object.fromEntries(
      [...keys, ...fields].map(field => {
        assert.notEqual(row[field], undefined, field);
        return [field, row[field]];
      }),
    );
    if (result.has(id))
      assert.deepEqual(result.get(id), value, `Broken dependency for ${id}`);
    result.set(id, value);
  }
  return [...result.values()];
}
const unique = (rows, fields) =>
  assert.equal(new Set(rows.map(row => key(row, fields))).size, rows.length);
function references(
  children,
  childFields,
  parents,
  parentFields = childFields,
) {
  const keys = new Set(parents.map(row => key(row, parentFields)));
  children.forEach(row =>
    assert.ok(
      keys.has(key(row, childFields)),
      `Missing parent ${key(row, childFields)}`,
    ),
  );
}

function normalize(data) {
  const [catalog, users, operations] = data.sources.map(source =>
    clean(source.rows),
  );
  const tables = {
    cities: project(users, ['city'], ['region']),
    roles: project(users, ['role'], ['role_description']),
    users: project(
      users,
      ['user_code'],
      ['full_name', 'login', 'role', 'city'],
    ),
    statuses: project(operations, ['status'], ['status_description']),
  };
  unique(users, ['user_code']);
  unique(users, ['login']);
  references(operations, ['user_code'], users);
  references(tables.users, ['city'], tables.cities);
  references(tables.users, ['role'], tables.roles);
  references(operations, ['status'], tables.statuses);
  if (data.config.domain === 'retail') {
    Object.assign(tables, {
      categories: project(catalog, ['category'], ['category_description']),
      subcategories: project(catalog, ['subcategory'], ['category']),
      manufacturers: project(catalog, ['manufacturer'], ['manufacturer_phone']),
      sizes: project(catalog, ['size'], ['size_system']),
      products: project(
        catalog,
        ['product_code'],
        ['product_name', 'subcategory', 'manufacturer', 'current_price'],
      ),
      stock: project(
        catalog,
        ['stock_code'],
        ['product_code', 'size', 'available'],
      ),
      orders: project(
        operations,
        ['order_id'],
        ['order_date', 'user_code', 'status'],
      ),
      lines: project(
        operations,
        ['order_id', 'line_no'],
        ['stock_code', 'quantity', 'unit_price'],
      ),
    });
    unique(catalog, ['stock_code']);
    unique(catalog, ['product_code', 'size']);
    unique(operations, ['order_id', 'line_no']);
    references(operations, ['stock_code'], tables.stock);
    references(tables.lines, ['order_id'], tables.orders);
    references(tables.stock, ['product_code'], tables.products);
    references(tables.stock, ['size'], tables.sizes);
    references(tables.products, ['subcategory'], tables.subcategories);
    references(tables.subcategories, ['category'], tables.categories);
    references(tables.products, ['manufacturer'], tables.manufacturers);
    const byCode = new Map(catalog.map(row => [row.stock_code, row]));
    assert.ok(
      operations.some(
        row => row.unit_price !== byCode.get(row.stock_code).current_price,
      ),
    );
  } else if (data.config.domain === 'library') {
    const links = catalog.flatMap(row => {
      const ids = row.author_codes.split(' | '),
        names = row.author_names.split(' | ');
      assert.equal(ids.length, names.length);
      return ids.map((author_code, i) => ({
        book_code: row.book_code,
        author_code,
        author_name: names[i],
      }));
    });
    Object.assign(tables, {
      publishers: project(catalog, ['publisher'], ['publisher_phone']),
      genres: project(catalog, ['genre'], ['genre_description']),
      books: project(
        catalog,
        ['book_code'],
        ['book_title', 'publisher', 'genre'],
      ),
      authors: project(links, ['author_code'], ['author_name']),
      bookAuthors: project(links, ['book_code', 'author_code'], []),
      branches: project(catalog, ['branch'], ['branch_address']),
      copies: project(
        catalog,
        ['copy_code'],
        ['book_code', 'branch', 'shelf', 'replacement_cost'],
      ),
      loans: project(
        operations,
        ['loan_id'],
        ['loan_date', 'user_code', 'copy_code', 'days', 'status'],
      ),
    });
    unique(catalog, ['copy_code']);
    unique(operations, ['loan_id']);
    references(operations, ['copy_code'], tables.copies);
    references(tables.copies, ['book_code'], tables.books);
    references(tables.copies, ['branch'], tables.branches);
    references(tables.books, ['publisher'], tables.publishers);
    references(tables.books, ['genre'], tables.genres);
    references(tables.bookAuthors, ['book_code'], tables.books);
    references(tables.bookAuthors, ['author_code'], tables.authors);
    assert.ok(tables.bookAuthors.length > tables.books.length);
    const prior = new Map();
    for (const row of operations) {
      const previous = prior.get(row.copy_code);
      if (previous) {
        assert.equal(previous.status, 'Возвращена');
        assert.ok(
          Date.parse(row.loan_date) >
            Date.parse(previous.loan_date) + previous.days * 86400000,
        );
      }
      prior.set(row.copy_code, row);
    }
  } else {
    Object.assign(tables, {
      directions: project(catalog, ['direction'], ['direction_description']),
      levels: project(catalog, ['level'], ['level_description']),
      courses: project(
        catalog,
        ['course_code'],
        ['course_title', 'direction', 'level', 'hours'],
      ),
      buildings: project(catalog, ['building'], ['building_address']),
      rooms: project(
        catalog,
        ['room_code'],
        ['room_number', 'capacity', 'building'],
      ),
      formats: project(catalog, ['format'], ['format_description']),
      cohorts: project(
        catalog,
        ['cohort_code'],
        ['course_code', 'teacher_code', 'room_code', 'format', 'start_date'],
      ),
      enrollments: project(
        operations,
        ['enrollment_id'],
        ['enrollment_date', 'user_code', 'cohort_code', 'fee', 'status'],
      ),
    });
    unique(catalog, ['cohort_code']);
    unique(operations, ['enrollment_id']);
    unique(operations, ['user_code', 'cohort_code']);
    references(operations, ['cohort_code'], tables.cohorts);
    references(
      tables.cohorts,
      ['teacher_code'],
      users.filter(row => row.role === 'Преподаватель'),
      ['user_code'],
    );
    references(tables.cohorts, ['course_code'], tables.courses);
    references(tables.cohorts, ['room_code'], tables.rooms);
    references(tables.cohorts, ['format'], tables.formats);
    references(tables.rooms, ['building'], tables.buildings);
    references(tables.courses, ['direction'], tables.directions);
    references(tables.courses, ['level'], tables.levels);
  }
  assert.equal(Object.keys(tables).length, 12);
  assert.ok(Object.values(tables).every(rows => rows.length > 0));
  return tables;
}

for (const domain of ['retail', 'library', 'courses']) {
  test(`${domain}: AI vocabulary preserves twelve-table dependencies and references`, () => {
    for (const difficulty of ['basic', 'advanced']) {
      const data = generateDataset({
        domain,
        difficulty,
        aiTheme: themeFixture(domain),
      });
      normalize(data);
    }
  });
  test(`${domain}: three connected sources can be normalized into twelve tables`, () => {
    for (const difficulty of ['basic', 'advanced'])
      for (const size of [20, 60, 500])
        for (const seed of ['0', 'PRACTICE', 'REPEAT']) {
          const data = generateDataset({domain, difficulty, size, seed});
          assert.equal(data.version, 2);
          assert.equal(data.targetTableCount, 12);
          assert.equal(data.sources.length, 3);
          assert.equal(data.sources[2].rows.length, size);
          assert.deepEqual(data, generateDataset(data.config));
          normalize(data);
          const [catalog, , operations] = data.sources.map(source =>
            clean(source.rows),
          );
          const [filter, distinct, aggregate] = data.tasks;
          const [, categoryField, category, numericField, limit] =
            filter.prompt.match(/имеют (\w+) = «(.*?)» и (\w+) >= (\d+)/);
          const status = distinct.prompt.match(/«(.*?)»/)[1];
          const [, amount, time, start] = aggregate.prompt.match(
            /сумму (\w+).*где (\w+) >= ([\d-]+)/,
          );
          assert.equal(
            filter.answer,
            catalog.filter(
              row =>
                row[categoryField] === category &&
                row[numericField] >= Number(limit),
            ).length,
          );
          assert.equal(
            distinct.answer,
            new Set(
              operations
                .filter(row => row.status === status)
                .map(row => row.user_code),
            ).size,
          );
          assert.equal(
            aggregate.answer,
            operations
              .filter(row => row[time] >= start)
              .reduce((sum, row) => sum + row[amount], 0),
          );
          assert.ok(
            gradeTasks(
              data,
              Object.fromEntries(
                data.tasks.map(task => [task.id, String(task.answer)]),
              ),
            ).every(result => result.correct),
          );
          const files = exportFiles(data.config);
          assert.deepEqual(
            files.map(file => file.name),
            [
              ...data.sources.map(source => source.name),
              'assignment.md',
              'variant.json',
            ],
          );
          assert.match(files[3].content, /12 таблиц/);
          assert.doesNotMatch(files[3].content, /"answer"|CREATE TABLE/);
          assert.deepEqual(generateDataset(JSON.parse(files[4].content)), data);
        }
  });
}

test('new sources change with the seed, preserve whitespace exercises and support both separators', () => {
  for (const domain of ['retail', 'library', 'courses']) {
    const basic = generateDataset({domain});
    const other = generateDataset({domain, seed: 'DIFFERENT'});
    basic.sources.forEach((source, i) =>
      assert.notDeepEqual(source.rows, other.sources[i].rows),
    );
    const advanced = generateDataset({domain, difficulty: 'advanced'});
    advanced.sources.forEach(source =>
      assert.ok(
        source.rows.some(row =>
          Object.values(row).some(
            value => typeof value === 'string' && value !== value.trim(),
          ),
        ),
      ),
    );
    for (const separator of [';', ',']) {
      const files = exportFiles(basic.config, separator);
      files.slice(0, 3).forEach((file, i) => {
        const source = basic.sources[i];
        assert.deepEqual(readCsv(file.content, separator), [
          source.headers,
          ...source.rows.map(row =>
            source.headers.map(field => String(row[field])),
          ),
        ]);
        assert.ok(
          file.content.startsWith(
            '\uFEFF' + basic.sources[i].headers.join(separator) + '\r\n',
          ),
        );
        assert.equal(
          file.content.split('\r\n').length,
          basic.sources[i].rows.length + 2,
        );
      });
    }
  }
  assert.throws(() => normalizeConfig({generatorVersion: 4}));
});

test('unversioned saved attempts retain v1 while new practice uses v3', () => {
  const config = {domain: 'retail', seed: 'OLD', size: 60, difficulty: 'basic'};
  const session = startSession(config, 45, 1000);
  const state = validateState({
    version: 1,
    config,
    delimiter: ';',
    exports: 0,
    view: 'practice',
    session,
    history: [],
    quiz: null,
    quizHistory: [],
  });
  assert.equal(state.config.generatorVersion, 3);
  assert.equal(state.session.config.generatorVersion, 1);
  assert.equal(generate(state.session.config).version, 1);
  assert.equal(exportCurrent(state.session.config).length, 3);
  const newSession = startSession(normalizeConfig(), 45);
  assert.equal(newSession.config.generatorVersion, 3);
  assert.equal(exportCurrent(newSession.config).length, 6);
});
