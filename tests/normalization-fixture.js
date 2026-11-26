import {normalizationModel} from '../build/src/core/normalization-model.js';
import {generateDataset} from '../build/packages/practice/src/generator.js';
import {toCsv} from '../build/packages/practice/src/csv.js';

export function normalizationFiles(config) {
  const tables = normalizationModel(generateDataset(config));
  const files = tables.map(table => ({
    name: table.name + '.csv',
    content: toCsv(table.fields, table.rows),
    type: 'text/csv',
  }));
  const schema = tables.map(table => ({
    entity: table.name,
    file: table.name + '.csv',
    primaryKey:
      table.name === 'lines'
        ? ['order_id', 'line_no']
        : table.name === 'bookAuthors'
          ? ['book_code', 'author_code']
          : [table.fields[0]],
    columns: Object.fromEntries(table.fields.map(field => [field, field])),
    references: table.parents.map(parent => ({
      table: parent,
      columns: [
        table.name === 'cohorts' && parent === 'users'
          ? 'teacher_code'
          : tables.find(candidate => candidate.name === parent).fields[0],
      ],
    })),
  }));
  files.push({
    name: 'schema.json',
    content: JSON.stringify(schema),
    type: 'application/json',
  });
  return files;
}
