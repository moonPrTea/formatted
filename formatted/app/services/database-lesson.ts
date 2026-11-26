export interface DatabaseStep {
  title: string;
  tags: string[];
  goal: string;
  tasks: string[];
  question: string;
  answers: string[];
  correct: number;
  explanation: string;
  hint: string;
  source: string;
}
export const databaseSteps: DatabaseStep[] = [
  {
    title: 'База и типы данных',
    tags: ['CREATE DATABASE', 'text', 'numeric'],
    goal: 'Подготовить отдельную учебную БД, не затрагивая рабочие данные',
    tasks: [
      'В pgAdmin подключись к локальному PostgreSQL и открой Query Tool для служебной базы postgres',
      'Напиши CREATE DATABASE exam_practice и выполни отдельно, вне транзакции. Затем открой Query Tool уже для exam_practice',
      'Спроектируй categories(category_id, category_name) и products(product_code, product_name, category_id, price). Код 00101 должен остаться текстом, цена храниться точно',
    ],
    question: 'Как хранить код 00101, если ведущие нули значимы?',
    answers: ['integer', 'text или varchar', 'numeric(5,0)'],
    correct: 1,
    explanation:
      'Код является идентификатором, а не количеством. Числовой тип не сохраняет ведущие нули',
    hint: 'Код: text; ключ категории: integer; цена: numeric(12,2). Создание БД и создание таблиц выполняются в разных подключениях',
    source: 'https://www.postgresql.org/docs/current/datatype.html',
  },
  {
    title: 'Таблицы и первичные ключи',
    tags: ['PRIMARY KEY', 'NOT NULL', 'UNIQUE', 'CHECK'],
    goal: 'Описать структуру двух таблиц самостоятельно',
    tasks: [
      'Напиши CREATE TABLE для categories и products. Сначала создавай справочник',
      'Выбери PK для каждой таблицы, обязательные поля пометь NOT NULL',
      'Для цены добавь CHECK (price >= 0) и NOT NULL. Названия категорий должны быть уникальны',
    ],
    question: 'Достаточно ли CHECK (price >= 0), чтобы запретить NULL?',
    answers: [
      'Да, NULL меньше нуля',
      'Нет, нужен ещё NOT NULL',
      'Да, CHECK запрещает пустые значения',
    ],
    correct: 1,
    explanation:
      'CHECK не отклоняет результат NULL. Обязательность значения задаёт NOT NULL',
    hint: 'PRIMARY KEY задаёт уникальность и обязательность. UNIQUE подходит для альтернативного уникального признака',
    source: 'https://www.postgresql.org/docs/current/ddl-constraints.html',
  },
  {
    title: 'Внешние ключи',
    tags: ['FOREIGN KEY', 'REFERENCES', 'RESTRICT'],
    goal: 'Связать товар с существующей категорией',
    tasks: [
      'Добавь FK из products.category_id в categories.category_id через ALTER TABLE',
      'Сделай категорию товара обязательной. Не используй автоматическое удаление товаров вместе с категорией',
      'В отдельной транзакции попробуй добавить товар с отсутствующей категорией, проверь ошибку и выполни ROLLBACK',
    ],
    question: 'Что проверяет внешний ключ товара?',
    answers: [
      'Существование указанной категории',
      'Уникальность названия товара',
      'Порядок строк CSV',
    ],
    correct: 0,
    explanation:
      'FK проверяет ссылочную целостность. Для запрета пустой ссылки нужен NOT NULL',
    hint: 'FOREIGN KEY (category_id) REFERENCES categories(category_id). Явный ON DELETE RESTRICT запретит удаление используемой категории',
    source:
      'https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK',
  },
  {
    title: 'Импорт нормализованных CSV',
    tags: ['CSV', 'UTF-8', 'Импорт'],
    goal: 'Перенести очищенные данные и проверить результат',
    tasks: [
      'Подготовь CSV под созданные столбцы: категории 10 и 25, товары 00101 и 00108 со ссылками на эти категории. Добавь каждому товару цену',
      'В pgAdmin используй Import/Export Data для каждой таблицы: CSV, UTF-8, правильный разделитель, заголовок и порядок столбцов',
      'Сначала импортируй categories, затем products. Проверь количество строк, ведущие нули, цены и соответствие категорий через SELECT',
    ],
    question:
      'В каком порядке импортировать связанные таблицы при действующем FK?',
    answers: [
      'Сначала товары',
      'Сначала категории',
      'Порядок никогда не важен',
    ],
    correct: 1,
    explanation:
      'К моменту вставки товара его категория уже должна существовать',
    hint: 'Путь в SQL COPY относится к файловой системе сервера PostgreSQL. Для файла на своём компьютере используй доступный в твоём режиме pgAdmin диалог импорта или клиентский psql \\copy',
    source:
      'https://www.pgadmin.org/docs/pgadmin4/latest/import_export_data.html',
  },
  {
    title: 'Выборки и сверка',
    tags: ['JOIN', 'WHERE', 'GROUP BY', 'ORDER BY'],
    goal: 'Получить результат из нескольких связанных таблиц',
    tasks: [
      'Напиши JOIN, который выводит код товара, его название, название категории и цену',
      'Добавь условие price >= 1000 и сортировку по цене, затем по коду для стабильного порядка',
      'Посчитай число товаров по категориям. Отдельно реши, нужно ли включать категории без товаров',
    ],
    question:
      'Как сохранить в результате категорию, у которой пока нет товаров?',
    answers: [
      'INNER JOIN от categories',
      'LEFT JOIN от categories',
      'Убрать внешний ключ',
    ],
    correct: 1,
    explanation:
      'LEFT JOIN сохраняет строки левой таблицы даже без совпадений. Для количества товаров считай COUNT(p.product_code), а не COUNT(*)',
    hint: 'WHERE фильтрует строки до группировки, HAVING фильтрует группы. Сверяй результат с исходными CSV',
    source:
      'https://www.postgresql.org/docs/current/queries-table-expressions.html',
  },
  {
    title: 'Транзакции и триггеры',
    tags: ['BEGIN', 'ROLLBACK', 'TRIGGER', 'OLD / NEW'],
    goal: 'Разделять ограничения данных и автоматические действия',
    tasks: [
      'В учебной БД выполни BEGIN, измени цену товара и ROLLBACK. Проверь, что цена вернулась',
      'Продумай журнал изменения цен: код товара, старая цена, новая цена, время изменения',
      'Напиши функцию RETURNS trigger и AFTER UPDATE OF price триггер для журнала. Не записывай событие, если цена не изменилась. Проверь UPDATE и откат',
    ],
    question: 'Что выбрать, чтобы просто запретить отрицательную цену?',
    answers: [
      'Только триггер',
      'CHECK, а не отдельный триггер',
      'Проверку только в WinForms',
    ],
    correct: 1,
    explanation:
      'Для простого ограничения достаточно CHECK. Триггер нужен для действия, например записи изменения в журнал',
    hint: 'В строковом триггере доступны OLD и NEW. Сравнение NEW.price IS DISTINCT FROM OLD.price учитывает NULL. Запись журнала в той же транзакции также откатывается',
    source: 'https://www.postgresql.org/docs/current/plpgsql-trigger.html',
  },
];

export interface DatabaseProgress {
  step: number;
  drafts: string[];
  answers: (number | null)[];
}
export function readDatabaseProgress(value: unknown): DatabaseProgress {
  const initial = {
    step: 0,
    drafts: databaseSteps.map(() => ''),
    answers: databaseSteps.map(() => null),
  };
  if (!value || typeof value !== 'object') return initial;
  const data = value as Partial<DatabaseProgress>;
  return {
    step:
      Number.isInteger(data.step) &&
      data.step! >= 0 &&
      data.step! < databaseSteps.length
        ? data.step!
        : 0,
    drafts: databaseSteps.map((_, i) =>
      typeof data.drafts?.[i] === 'string' && data.drafts[i].length <= 50000
        ? data.drafts[i]
        : '',
    ),
    answers: databaseSteps.map((step, i) =>
      Number.isInteger(data.answers?.[i]) &&
      data.answers![i]! >= 0 &&
      data.answers![i]! < step.answers.length
        ? data.answers![i]!
        : null,
    ),
  };
}
