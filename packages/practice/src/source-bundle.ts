import {integer, pick, random, shuffle} from './random.js';
import {applyAiTheme} from './ai-theme.js';
import type {
  Config,
  CsvSource,
  Dataset,
  Domain,
  Random,
  Row,
  Task,
} from '../../contracts/practice.js';

const names = [
  'Анна Миронова',
  'Илья Волков',
  'Мария Соколова',
  'Денис Орлов',
  'София Ким',
  'Иван Ли',
];
const cities = ['Казань', 'Тула', 'Пермь', 'Москва'];
const date = (day: number) =>
  new Date(Date.UTC(2026, 0, day + 1)).toISOString().slice(0, 10);
const csv = (name: string, grain: string, rows: Row[]): CsvSource => ({
  name,
  grain,
  rows,
  headers: Object.keys(rows[0]),
});

interface Bundle {
  sources: CsvSource[];
  rules: string[];
  questions: string[];
  category: string;
  quantity: string;
  time: string;
  amount: string;
}

function people(rng: Random, roles: string[]) {
  return Array.from({length: 20}, (_, i) => {
    const city = integer(rng, 0, 3);
    const role = i < 2 ? 0 : i < 6 ? 1 : 2;
    return {
      user_code: `U${101 + i * 7}`,
      full_name: names[i % names.length],
      login: `user${101 + i * 7}`,
      role: roles[role],
      role_description: [
        'Управление системой',
        'Обслуживание операций',
        'Получение услуги',
      ][role],
      city: cities[city],
      region: [
        'Татарстан',
        'Тульская область',
        'Пермский край',
        'Московский регион',
      ][city],
    };
  });
}

function retail(rng: Random, count: number): Bundle {
  const users = people(rng, ['Администратор', 'Менеджер', 'Покупатель']);
  const catalog = Array.from({length: 24}, (_, i) => {
    const product = Math.floor(i / 2);
    const subcategory = product % 6;
    const category = Math.floor(subcategory / 2);
    return {
      stock_code: `00${401 + i * 3}`,
      product_code: `P${101 + product * 7}`,
      product_name:
        ['Кроссовки «Старт»', 'Ботинки, зимние', 'Туфли "Город"'][product % 3] +
        ` ${product + 1}`,
      category: ['Повседневная обувь', 'Спортивная обувь', 'Домашняя обувь'][
        category
      ],
      category_description: ['Для города', 'Для тренировок', 'Для дома'][
        category
      ],
      subcategory: [
        'Низкая',
        'Высокая',
        'Беговая',
        'Зальная',
        'Открытая',
        'Закрытая',
      ][subcategory],
      manufacturer: ['Мастерская «Шаг»', 'Север', 'Линия'][product % 3],
      manufacturer_phone: `8 000 100 00 0${product % 3}`,
      size: [36, 38][i % 2],
      size_system: 'EU',
      available: integer(rng, 0, 45),
      current_price: (1900 + product * 175).toFixed(2),
    };
  });
  const rows: Row[] = [];
  let document = 0;
  while (rows.length < count) {
    const buyer = pick(rng, users.slice(6));
    const status = pick(rng, ['Новый', 'Выдан', 'Отменён']);
    const day = date(integer(rng, 0, 89));
    const selected = shuffle(rng, catalog).slice(
      0,
      Math.min(integer(rng, 2, 4), count - rows.length),
    );
    const id = 101 + document++ * 7;
    selected.forEach((item, index) =>
      rows.push({
        order_id: id,
        order_date: day,
        user_code: buyer.user_code,
        status,
        status_description: {
          Новый: 'Ожидает выдачи',
          Выдан: 'Передан покупателю',
          Отменён: 'Выдача не требуется',
        }[status]!,
        line_no: index + 1,
        stock_code: item.stock_code,
        quantity: integer(rng, 1, 6),
        unit_price: (
          Number(item.current_price) -
          integer(rng, 0, 4) * 50
        ).toFixed(2),
      }),
    );
  }
  return {
    sources: [
      csv(
        'catalog.csv',
        'Одна строка описывает остаток одной модели в одном размере',
        catalog,
      ),
      csv(
        'users.csv',
        'Одна строка описывает пользователя, его роль и город',
        users,
      ),
      csv('orders.csv', 'Одна строка описывает одну позицию заказа', rows),
    ],
    category: 'category',
    quantity: 'available',
    time: 'order_date',
    amount: 'quantity',
    rules: [
      'stock_code определяет сочетание product_code и size, а также available. Пара product_code + size уникальна',
      'product_code определяет название модели, подкатегорию, производителя и текущую цену. Историческая unit_price относится к позиции заказа',
      'В этом варианте названия подкатегорий уникальны. Подкатегория относится к одной категории; у категории своё описание',
      'Название производителя уникально и определяет его телефон. Размер определяет систему размеров',
      'order_id определяет дату, пользователя и статус. line_no уникален только внутри заказа. Позиция ссылается на stock_code из catalog.csv',
      'user_code заказа ссылается на покупателя из users.csv. Статус имеет собственное описание',
    ],
    questions: [
      'Чем модель отличается от товарной позиции определённого размера?',
      'Почему цену продажи нельзя заменять текущей ценой из каталога?',
    ],
  };
}

function library(rng: Random, count: number): Bundle {
  const users = people(rng, ['Администратор', 'Библиотекарь', 'Читатель']);
  const catalog = Array.from({length: 24}, (_, i) => {
    const book = Math.floor(i / 3);
    const branch = i % 3;
    return {
      copy_code: `00${501 + i * 3}`,
      book_code: `B${101 + book * 7}`,
      book_title:
        ['Основы SQL', 'Город, люди и данные', 'Практика «C#»', 'Мир растений'][
          book % 4
        ] + ` ${book + 1}`,
      publisher: ['Сфера', 'Маяк', 'Лист'][book % 3],
      publisher_phone: `8 000 200 00 0${book % 3}`,
      genre: ['Технологии', 'История', 'Наука', 'Искусство'][book % 4],
      genre_description: [
        'Техническая литература',
        'Исторические исследования',
        'Научные издания',
        'Издания об искусстве',
      ][book % 4],
      author_codes: book % 2 ? 'A17 | A42' : 'A3',
      author_names: book % 2 ? 'Ирина Лескова | Олег Грин' : 'Николай Светлов',
      branch: ['Центральный', 'Северный', 'Южный'][branch],
      branch_address: ['ул. Мира, 1', 'ул. Лесная, 7', 'ул. Садовая, 3'][
        branch
      ],
      shelf: `Стеллаж ${(i % 5) + 1}`,
      replacement_cost: integer(rng, 5, 25) * 100,
    };
  });
  const last = new Map<string, Row>();
  const rows: Row[] = Array.from({length: count}, (_, i) => {
    const copy = pick(rng, catalog);
    const prior = last.get(copy.copy_code);
    if (prior) {
      prior.status = 'Возвращена';
      prior.status_description = 'Экземпляр возвращён';
    }
    const day = prior
      ? Number(prior.day_offset) + Number(prior.days) + 1
      : integer(rng, 0, 15);
    const status = pick(rng, ['Возвращена', 'На руках', 'Просрочена']);
    const row: Row = {
      loan_id: 1001 + i * 7,
      loan_date: date(day),
      user_code: pick(rng, users.slice(6)).user_code,
      copy_code: copy.copy_code,
      days: integer(rng, 7, 21),
      status,
      status_description: {
        Возвращена: 'Экземпляр возвращён',
        'На руках': 'Срок возврата не наступил',
        Просрочена: 'Срок возврата истёк',
      }[status]!,
      day_offset: day,
    };
    last.set(copy.copy_code, row);
    return row;
  });
  rows.forEach(row => delete row.day_offset);
  return {
    sources: [
      csv(
        'catalog.csv',
        'Одна строка описывает экземпляр, его издание и авторов',
        catalog,
      ),
      csv(
        'users.csv',
        'Одна строка описывает пользователя, его роль и город',
        users,
      ),
      csv('loans.csv', 'Одна строка описывает выдачу одного экземпляра', rows),
    ],
    category: 'genre',
    quantity: 'replacement_cost',
    time: 'loan_date',
    amount: 'days',
    rules: [
      'copy_code определяет экземпляр, его book_code, филиал, полку и стоимость замены. Экземпляр и издание являются разными сущностями',
      'book_code определяет название, издательство, жанр и набор авторов. Названия издательств и жанров уникальны; они имеют собственные телефон и описание',
      'author_codes и author_names содержат параллельные списки через | в одинаковом порядке. Код автора определяет его имя; один автор участвует в нескольких изданиях',
      'У издания может быть несколько авторов и экземпляров. При выделении связей книги и автора не дублируй связь для каждого экземпляра',
      'Название филиала уникально и определяет его адрес. Полка является атрибутом экземпляра, а не самостоятельным справочником',
      'loan_id определяет выдачу, дату, user_code, copy_code, срок и статус. Пользователь берётся из users.csv, экземпляр из catalog.csv. Статус имеет собственное описание',
      'Выдачи одного экземпляра не пересекаются по сроку; незавершённой может быть только последняя выдача',
    ],
    questions: [
      'Как связать издание с несколькими авторами без списка внутри ячейки?',
      'Почему связь книги и автора нельзя размножать по количеству экземпляров?',
    ],
  };
}

function courses(rng: Random, count: number): Bundle {
  const users = people(rng, ['Администратор', 'Преподаватель', 'Слушатель']);
  const catalog = Array.from({length: 24}, (_, i) => {
    const course = i % 6;
    const room = i % 8;
    const building = Math.floor(room / 4);
    return {
      cohort_code: `G${101 + i * 7}`,
      course_code: `K${101 + course * 7}`,
      course_title: [
        'SQL с нуля',
        'C# и события',
        'Анализ данных',
        'Проектирование БД',
        'Тестирование',
        'Интерфейсы',
      ][course],
      direction: ['Разработка', 'Аналитика', 'Качество'][course % 3],
      direction_description: [
        'Разработка приложений',
        'Работа с данными',
        'Проверка продуктов',
      ][course % 3],
      level: ['Начальный', 'Продвинутый'][course % 2],
      level_description: [
        'Без предварительного опыта',
        'Требуется базовая подготовка',
      ][course % 2],
      hours: 24 + course * 8,
      teacher_code: users[2 + (i % 4)].user_code,
      room_code: `R${101 + room * 7}`,
      room_number: String(101 + (room % 4)),
      capacity: 12 + room * 2,
      building: ['Главный', 'Учебный'][building],
      building_address: ['ул. Мира, 9', 'ул. Парковая, 5'][building],
      format: ['Очно', 'Гибридно'][i % 2],
      format_description: [
        'Все занятия в аудитории',
        'Часть занятий дистанционно',
      ][i % 2],
      start_date: date(integer(rng, 90, 180)),
    };
  });
  const pairs = shuffle(
    rng,
    Array.from({length: 14 * 24}, (_, i) => [6 + Math.floor(i / 24), i % 24]),
  );
  // Additional learners keep student/cohort pairs unique for the largest variants.
  while (users.length < 28)
    users.push({
      ...users[6],
      user_code: `U${101 + users.length * 7}`,
      full_name: names[users.length % names.length],
      login: `user${101 + users.length * 7}`,
    });
  pairs.push(
    ...shuffle(
      rng,
      Array.from({length: 8 * 24}, (_, i) => [20 + Math.floor(i / 24), i % 24]),
    ),
  );
  const rows = pairs.slice(0, count).map(([user, cohort], i) => {
    const status = pick(rng, ['Учится', 'Завершил', 'Отчислен']);
    return {
      enrollment_id: 201 + i * 7,
      enrollment_date: date(integer(rng, 0, 89)),
      user_code: users[user].user_code,
      cohort_code: catalog[cohort].cohort_code,
      fee: integer(rng, 90, 250) * 100,
      status,
      status_description: {
        Учится: 'Зачисление активно',
        Завершил: 'Обучение завершено',
        Отчислен: 'Обучение прекращено',
      }[status]!,
    };
  });
  return {
    sources: [
      csv(
        'cohorts.csv',
        'Одна строка описывает поток, курс и место занятий',
        catalog,
      ),
      csv(
        'users.csv',
        'Одна строка описывает пользователя, его роль и город',
        users,
      ),
      csv(
        'enrollments.csv',
        'Одна строка описывает зачисление слушателя на поток',
        rows,
      ),
    ],
    category: 'direction',
    quantity: 'hours',
    time: 'enrollment_date',
    amount: 'fee',
    rules: [
      'cohort_code определяет поток: course_code, teacher_code, room_code, формат и дату начала. course_code определяет название курса, направление, уровень и часы',
      'Направление, уровень и формат имеют уникальные названия и собственные описания; это независимые классификаторы',
      'room_code определяет аудиторию, её номер, вместимость и корпус. Один номер может повторяться в разных корпусах; название корпуса уникально и определяет адрес',
      'teacher_code ссылается на пользователя с ролью «Преподаватель» в users.csv',
      'enrollment_id определяет зачисление: дату, слушателя, поток, стоимость и статус. Пара user_code + cohort_code уникальна',
      'user_code зачисления ссылается на слушателя в users.csv, cohort_code на поток в cohorts.csv. Статус имеет собственное описание',
      'fee является стоимостью зачисления, а не атрибутом курса или слушателя. hours является атрибутом курса',
    ],
    questions: [
      'Почему номера аудитории недостаточно для ключа?',
      'Почему преподаватели и слушатели берутся из одного списка пользователей?',
    ],
  };
}

export function generateBundle(config: Config, domain: Domain): Dataset {
  const rng = random(
    `2:${config.domain}:${config.seed}:${config.size}:${config.difficulty}`,
  );
  const bundle = {retail, library, courses}[config.domain](rng, config.size);
  if (config.aiTheme) {
    applyAiTheme(bundle.sources, config.aiTheme);
    domain = {
      ...domain,
      name: config.aiTheme.title,
      description: config.aiTheme.description,
    };
  }
  const [catalog, users, operations] = bundle.sources;
  const category = pick(rng, catalog.rows)[bundle.category];
  const threshold = pick(rng, catalog.rows)[bundle.quantity];
  const status = pick(rng, operations.rows).status;
  const start = pick(rng, operations.rows)[bundle.time];
  const tasks: Task[] = [
    {
      id: 'filter',
      prompt: `В ${catalog.name} сколько исходных строк имеют ${bundle.category} = «${category}» и ${bundle.quantity} >= ${threshold}?`,
      answer: catalog.rows.filter(
        row =>
          row[bundle.category] === category &&
          Number(row[bundle.quantity]) >= Number(threshold),
      ).length,
      explanation: `Оба условия применяются к строкам ${catalog.name}; повторяющиеся значения справочников не удаляются перед подсчётом`,
    },
    {
      id: 'distinct',
      prompt: `В ${operations.name} сколько различных user_code встречается в строках со status = «${status}»?`,
      answer: new Set(
        operations.rows
          .filter(row => row.status === status)
          .map(row => row.user_code),
      ).size,
      explanation:
        'Сначала отфильтруй операции по статусу, затем посчитай уникальные коды пользователей, а не строки',
    },
    {
      id: 'aggregate',
      prompt: `В ${operations.name} найди сумму ${bundle.amount} по исходным строкам, где ${bundle.time} >= ${start} (включительно)`,
      answer: operations.rows
        .filter(row => row[bundle.time] >= start)
        .reduce((sum, row) => sum + Number(row[bundle.amount]), 0),
      explanation: `Суммируются значения ${bundle.amount} каждой подходящей строки ${operations.name}, дата ${start} включена`,
    },
  ];
  const rules = [
    'Набор содержит три связанных исходных CSV. Учебная цель: 12 таблиц, включая справочники и таблицы связей; готовая схема не выдаётся',
    'В users.csv user_code определяет пользователя, его уникальный login, ФИО, роль и город. ФИО может повторяться. Роль определяет описание прав, город определяет регион; названия ролей и городов здесь уникальны',
    ...bundle.rules,
    'Не создавай отдельную таблицу для каждого столбца: выделяй сущности, независимые справочники и необходимые связи. Число 12 является целевым для этого упражнения, а не универсальным законом 3НФ',
  ];
  if (config.difficulty === 'advanced') {
    for (const [source, field] of [
      [catalog, bundle.category],
      [users, 'city'],
      [operations, 'status'],
    ] as const) {
      source.rows.forEach((row, i) => {
        if (i % 7 === 0) row[field] = ` ${row[field]} `;
      });
      rules.push(
        `В ${source.name}, поле ${field}, встречаются крайние обычные пробелы. Удали их через «Текст по столбцам» перед поиском FK и выборками`,
      );
    }
  }
  return {
    version: 2,
    config,
    domain,
    sources: bundle.sources,
    targetTableCount: 12,
    rows: operations.rows,
    headers: operations.headers,
    rules,
    questions: bundle.questions,
    tasks,
    categorical: bundle.category,
    numeric: bundle.amount,
    time: bundle.time,
    distinct: 'user_code',
  };
}
