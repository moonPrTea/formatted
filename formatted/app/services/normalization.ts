import {readCsv} from './read-csv.js';
import {normalizationModel} from './normalization-model.js';
import type {Dataset} from '../../../packages/contracts/practice.js';

export interface TableSchema {
  entity: string;
  file: string;
  primaryKey: string[];
  columns: Record<string, string>;
  references: {columns: string[]; table: string}[];
}

export interface NormalizationResult {
  passed: boolean;
  issues: string[];
  tables: number;
}

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const names = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= 80 &&
  v.every(x => typeof x === 'string' && x.length > 0 && x.length < 100) &&
  new Set(v).size === v.length;

export function parseSchema(text: string): TableSchema[] {
  if (text.length > 100_000) throw new Error('Описание схемы больше 100 КБ');
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value) || value.length !== 12)
    throw new Error('Опиши 12 таблиц в массиве schema.json');
  for (const table of value) {
    if (
      !record(table) ||
      typeof table.entity !== 'string' ||
      typeof table.file !== 'string' ||
      !/^[^/\\]{1,100}\.csv$/i.test(table.file) ||
      !names(table.primaryKey) ||
      !record(table.columns) ||
      (Object.keys(table.columns).length > 0 &&
        !names(Object.values(table.columns))) ||
      !Array.isArray(table.references) ||
      table.references.length > 12
    )
      throw new Error(
        'Таблица: нужны entity, file, primaryKey, columns и references',
      );
    for (const ref of table.references)
      if (!record(ref) || !names(ref.columns) || typeof ref.table !== 'string')
        throw new Error('Связь: нужны columns и table');
  }
  if (
    new Set(value.map(t => t.entity)).size !== 12 ||
    new Set(value.map(t => t.file)).size !== 12
  )
    throw new Error('Таблицы и имена файлов должны быть уникальными');
  return value as TableSchema[];
}

export function checkNormalization(
  data: Dataset,
  schema: TableSchema[],
  files: Record<string, string>,
  delimiter: string,
): NormalizationResult {
  schema = parseSchema(JSON.stringify(schema));
  const model = normalizationModel(data);
  const issues: string[] = [];
  const issue = (text: string) => {
    if (issues.length < 100) issues.push(text);
  };
  const tables = new Map(
    schema.map(s => {
      if (!Object.hasOwn(files, s.file))
        throw new Error(`Не загружен ${s.file}`);
      return [s.entity, {...s, ...readCsv(files[s.file], delimiter)}];
    }),
  );
  const tuple = (row: Record<string, string>, columns: string[]) =>
    JSON.stringify(columns.map(c => row[c]));
  const indexes = new Map<string, Map<string, Record<string, string>>>();
  for (const table of tables.values()) {
    const relation = model.find(r => r.name === table.entity);
    if (!relation)
      throw new Error(`Неизвестная учебная сущность: ${table.entity}`);
    const used = [
      ...Object.values(table.columns),
      ...table.primaryKey,
      ...table.references.flatMap(r => r.columns),
    ];
    if (used.some(c => !table.headers.includes(c)))
      throw new Error(
        `${table.file}: в описании указаны отсутствующие столбцы`,
      );
    if (table.headers.some(c => !used.includes(c)))
      issue(`${table.file}: есть столбцы, не описанные в схеме`);
    if (Object.keys(table.columns).some(c => !relation.fields.includes(c)))
      issue(`${table.file}: содержит атрибуты другой сущности`);
    const parents = table.references.map(r => r.table);
    if (
      JSON.stringify([...parents].sort()) !==
      JSON.stringify([...relation.parents].sort())
    )
      issue(`${table.file}: проверь состав связей с другими сущностями`);
    const index = new Map<string, Record<string, string>>();
    for (const [i, row] of table.rows.entries()) {
      if (table.primaryKey.some(c => !row[c].trim()))
        issue(`${table.file}, строка ${i + 2}: пустой PK`);
      const key = tuple(row, table.primaryKey);
      if (index.has(key)) issue(`${table.file}, строка ${i + 2}: повтор PK`);
      index.set(key, row);
    }
    indexes.set(table.entity, index);
  }
  for (const table of tables.values())
    for (const ref of table.references) {
      const parent = tables.get(ref.table);
      if (!parent || ref.columns.length !== parent.primaryKey.length)
        throw new Error(`${table.file}: неверная ссылка на ${ref.table}`);
      for (const [i, row] of table.rows.entries())
        if (!indexes.get(ref.table)!.has(tuple(row, ref.columns)))
          issue(
            `${table.file}, строка ${i + 2}: FK не найден в ${parent.file}`,
          );
    }
  const resolve = (
    name: string,
    row: Record<string, string>,
    field: string,
    visited: string[] = [],
  ): string | undefined => {
    if (!model.find(r => r.name === name)!.fields.includes(field))
      return undefined;
    if (visited.includes(name))
      throw new Error('Циклическая связь в учебной схеме');
    const table = tables.get(name)!;
    const column = Object.hasOwn(table.columns, field)
      ? table.columns[field]
      : undefined;
    const values = column ? [row[column]] : [];
    for (const ref of table.references) {
      const parent = indexes.get(ref.table)!.get(tuple(row, ref.columns));
      const parentField =
        name === 'cohorts' && field === 'teacher_code' && ref.table === 'users'
          ? 'user_code'
          : field;
      if (parent) {
        const value = resolve(ref.table, parent, parentField, [
          ...visited,
          name,
        ]);
        if (value !== undefined) values.push(value);
      }
    }
    if (new Set(values).size > 1)
      issue(`${table.file}: ${field} не совпадает со значением по FK`);
    return values[0];
  };
  const numeric = new Set(
    'size available current_price order_id line_no quantity unit_price replacement_cost loan_id days hours capacity enrollment_id fee'.split(
      ' ',
    ),
  );
  const canonical = (value: unknown, field: string) => {
    const text = String(value ?? '');
    if (numeric.has(field) && /^-?\d+(?:[.,]\d+)?$/.test(text))
      return String(Number(text.replace(',', '.')));
    return text;
  };
  for (const relation of model) {
    const table = tables.get(relation.name);
    if (!table) throw new Error(`Не описана сущность ${relation.name}`);
    const expected = new Set(
      relation.rows.map(row =>
        JSON.stringify(relation.fields.map(f => canonical(row[f], f))),
      ),
    );
    const actual = table.rows.map(row =>
      JSON.stringify(
        relation.fields.map(f => canonical(resolve(table.entity, row, f), f)),
      ),
    );
    if (new Set(actual).size !== actual.length)
      issue(`${table.file}: одна сущность записана несколько раз с разными PK`);
    const missing = [...expected].filter(key => !actual.includes(key)).length;
    const extra = actual.filter(key => !expected.has(key)).length;
    if (missing)
      issue(`${table.file}: не восстановлено записей из исходника: ${missing}`);
    if (extra) issue(`${table.file}: лишних или изменённых записей: ${extra}`);
  }
  return {passed: issues.length === 0, issues, tables: tables.size};
}
