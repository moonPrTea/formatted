import type {CsvSource, Dataset, Row} from '../../contracts/practice.js';

const source = (name: string, grain: string, rows: Row[]): CsvSource => ({
  name,
  grain,
  rows,
  headers: [...new Set(rows.flatMap(row => Object.keys(row)))],
});

export function examSources(data: Dataset): Dataset {
  const [catalog, users, operations] = data.sources!;
  const modelSources = data.sources;
  if (data.config.difficulty === 'medium') {
    return {
      ...data,
      version: 3,
      modelSources,
      rules: ['Три исходных CSV → 12 таблиц.', ...data.rules.slice(1)],
    };
  }
  if (data.config.difficulty === 'basic') {
    const places = [
      ...new Map(
        users.rows.map(row => [row.city, {city: row.city, region: row.region}]),
      ).values(),
    ];
    return {
      ...data,
      version: 3,
      modelSources,
      sources: [
        catalog,
        source(
          users.name,
          users.grain,
          users.rows.map(row =>
            Object.fromEntries(
              Object.entries(row).filter(([key]) => key !== 'region'),
            ),
          ),
        ),
        operations,
        source('locations.csv', 'Одна строка — город и его регион', places),
      ],
      rules: [
        'Четыре исходных CSV → 12 таблиц. Регион города находится в locations.csv.',
        ...data.rules.slice(1),
      ],
    };
  }
  const key = {
    retail: 'stock_code',
    library: 'copy_code',
    courses: 'cohort_code',
  }[data.config.domain];
  const people = new Map(users.rows.map(row => [row.user_code, row]));
  const usedUsers = new Set<string | number>();
  const rows: Row[] = [];
  for (const item of catalog.rows) {
    const matches = operations.rows.filter(row => row[key] === item[key]);
    if (!matches.length) rows.push({...item});
    for (const operation of matches) {
      usedUsers.add(operation.user_code);
      rows.push({...item, ...people.get(operation.user_code), ...operation});
    }
  }
  // Preserve users without operations (including teachers and administrators).
  for (const user of users.rows)
    if (!usedUsers.has(user.user_code)) rows.push({...user});
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const filled = rows.map(row =>
    Object.fromEntries(headers.map(header => [header, row[header] ?? ''])),
  );
  return {
    ...data,
    version: 3,
    modelSources,
    sources: [
      source(
        'source.csv',
        'Операция с данными каталога и пользователя; строки без операции сохраняют неиспользованные записи',
        filled,
      ),
    ],
    rules: [
      'Один широкий source.csv → 12 таблиц. Данные каталога и пользователей повторяются в операциях. Пустые поля операции означают запись без операции, а не новую операцию.',
      ...data.rules
        .slice(1)
        .map(rule =>
          rule.replace(
            /(?:users|catalog|cohorts|orders|loans|enrollments)\.csv/g,
            'source.csv',
          ),
        ),
    ],
    tasks: data.tasks.map((task, index) => ({
      ...task,
      prompt:
        index === 0
          ? task.prompt
              .replace(
                `В ${catalog.name} сколько исходных строк`,
                `В source.csv сколько уникальных ${key}`,
              )
              .replace('имеют', 'имеют')
          : task.prompt.replace(
              operations.name,
              'source.csv (только строки с операцией)',
            ),
      explanation:
        index === 0
          ? `Перед подсчётом оставь одну запись каталога на ${key}; пустые ключи не учитывай`
          : task.explanation.replace(operations.name, 'source.csv'),
    })),
  };
}
