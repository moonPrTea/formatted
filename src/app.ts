import {query, errorMessage, html} from './dom.js';
import {
  normalizationView,
  updateNormalizationFiles,
  checkNormalizationForm,
} from './normalization-view.js';
import {environmentView} from './environment-view.js';
import {databaseView, mountDatabase} from './database-view.js';
import type {
  AppState,
  AiTheme,
  Config,
  Dataset,
  Domain,
  PracticeSession,
  View,
} from './core/types.js';
import {enhanceNumbers} from './numbers.js';
import {newVariant} from './core/variants.js';
import {enhanceSelects, closeSelectMenu} from './selects.js';
import {
  domains,
  generateDataset,
  normalizeConfig,
  exportFiles,
  gradeTasks,
  checklist,
  sourceFiles,
} from './core/generator.js';
import {FORMULA_SCOPE} from './core/formula-questions.js';
import {AI_MODEL, validateAiTheme} from './core/ai-theme.js';
import {calcLesson} from './core/calc-lesson.js';
import {toCsv} from './core/csv.js';
import {questions, topics, makeQuiz} from './core/quiz.js';
import {
  startSession,
  finishSession,
  remainingMs,
  formatTime,
} from './core/session.js';
import {validateState} from './core/storage.js';

const KEY = 'forma.v1';
const initial = (): AppState => ({
  version: 1,
  view: 'home',
  config: normalizeConfig(),
  delimiter: ';',
  quiz: null,
  quizHistory: [],
  session: null,
  history: [],
  exports: 0,
});
let state = initial();
let aiDraft: AiTheme | null = null;
let aiDraftConfig: Config | null = null;
let aiBusy = false;
let aiTopic = '';
let aiMessage = '';
let lessonStep = 0;
let lessonAnswer: number | null = null;
let calcBusy = false;
let calcMessage = '';
let sidebarCollapsed = false;
let storageWarning = '';
try {
  const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;
  if (stored) {
    state = {...initial(), ...validateState(stored)};
  }
} catch {
  storageWarning =
    'Сохранение повреждено или недоступно. Открыт чистый экран. Старое сохранение будет заменено после первого действия; для восстановления сначала сохрани копию профиля приложения.';
}

const icons: Record<string, string> = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  layers:
    '<path d="m12 3 10 5-10 5L2 8Z"/><path d="m2 12 10 5 10-5M2 16l10 5 10-5"/>',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  quiz: '<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M4 4v16h16M8 16v-4m4 4V7m4 9v-6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  shuffle:
    '<path d="M19 8a7 7 0 0 0-12-2L4 9m0-5v5h5M5 16a7 7 0 0 0 12 2l3-3m0 5v-5h-5"/>',
  book: '<path d="M12 5c-3-3-8-2-10-1v15c3-1 7-2 10 1 3-3 7-2 10-1V4c-2-1-7-2-10 1Zm0 0v15"/>',
  bag: '<path d="M4 7h16l1 14H3ZM8 8V6a4 4 0 0 1 8 0v2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  file: '<path d="M14 2H5v20h14V7ZM14 2v6h5M8 12h8m-8 4h8"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3h.01"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  medal: '<circle cx="12" cy="9" r="6"/><path d="m8 14-2 8 6-3 6 3-2-8"/>',
};
const icon = (name: string, cls = '') =>
  html`<svg
    class="icon ${cls}"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${icons[name] ?? icons.file}
  </svg>`;
const esc = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    char =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[
        char
      ] ?? char,
  );
const caption = (text: string) => String(text).replace(/\.\s*$/, '');
const active = () => state.session?.status === 'running';
const label: Record<View, string> = {
  home: 'Обзор',
  quiz: 'Блиц-викторина',
  generator: 'Генератор данных',
  practice: 'На время',
  history: 'Мой прогресс',
  lesson: 'Разбор CSV в Calc',
  database: 'Базы данных',
};
const navigation: View[] = [];
let navigationIndex = -1;
const button = (action: string, text: string, kind = '', extra = '') =>
  html`<button class="button ${kind}" data-action="${action}" ${extra}>
    ${text}
  </button>`;
const dateLabel = (ms: number) =>
  new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ms);
const freshSeed = () =>
  `F-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    toast(
      'Не удалось сохранить прогресс: хранилище недоступно или заполнено.',
      true,
    );
  }
}
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string, error = false) {
  const el = query('#toast');
  el.textContent = message;
  el.className = `toast visible ${error ? 'error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 6000);
}

function stats() {
  const answered = state.quizHistory.reduce((n, q) => n + q.total, 0);
  const correct = state.quizHistory.reduce((n, q) => n + q.correct, 0);
  return {
    answered,
    correct,
    accuracy: answered ? Math.round((correct / answered) * 100) : null,
    minutes: state.history.reduce(
      (n, s) => n + Math.round((s.finishedAt! - s.startedAt) / 60000),
      0,
    ),
  };
}

function folder(domain: Domain) {
  return html`<div class="domain-icon" aria-hidden="true">
    ${icon(domain.icon)}
  </div>`;
}

function shell(content: string) {
  const nav: [View, string][] = [
    ['home', 'home'],
    ['quiz', 'quiz'],
    ['generator', 'database'],
    ['lesson', 'book'],
    ['practice', 'clock'],
    ['history', 'chart'],
  ];
  const railNav: [View, string][] = [...nav, ['database', 'database']];
  return html`${windowBar()}
    <div class="layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}">
      <aside class="rail">
        <a class="brand-mark" href="#home" aria-label="formatted, главная"
          ><img class="brand-logo" src="assets/forma.svg" alt=""
        /></a>
        <div class="rail-nav">
          ${railNav.map(([id, glyph]) => html`<button class="rail-button ${state.view === id ? 'active' : ''}" data-view="${id}" aria-label="${label[id]}" title="${label[id]}">${icon(glyph)}</button>`).join('')}
        </div>
        <div class="rail-bottom">
          <span class="connection-dot" title="Локальная работа"></span>
          <div class="avatar">Я</div>
        </div>
      </aside>
      <aside class="sidebar">
        <div class="wordmark">
          <img class="brand-logo" src="assets/forma.svg" alt="" />formatted
        </div>
        <div class="workspace">
          <div class="workspace-icon">${icon('layers')}</div>
          <div>Демоэкзамен<small>Личное пространство</small></div>
          <span class="version">01</span>
        </div>
        <div class="nav-label">ПОДГОТОВКА</div>
        <nav>
          ${nav.map(([id, glyph]) => html`<button class="nav-item ${state.view === id ? 'selected' : ''}" data-view="${id}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label[id]}</span>${id === 'quiz' ? html`<span class="nav-count">${questions.length}</span>` : id === 'practice' && active() ? '<span class="live-dot"></span>' : ''}</button>`).join('')}
        </nav>
        <div class="sidebar-divider"></div>
        <div class="nav-label">ПРОГРАММА</div>
        <div class="module-row">
          <span class="module-index">01</span>
          <div>Данные и нормализация<small>Текущий модуль</small></div>
          <span class="live-dot"></span>
        </div>
        <button
          class="module-row module-link"
          data-view="database"
          ${state.view === 'database' ? 'aria-current="page"' : ''}
        >
          <span class="module-index">02</span>
          <span>Базы данных<small>Практикум PostgreSQL</small></span>
        </button>
        <div class="module-row muted">
          <span class="module-index">03</span>
          <div>C# и WinForms<small>В планах</small></div>
          ${icon('lock')}
        </div>
        <div class="module-row muted">
          <span class="module-index">04</span>
          <div>Полный экзамен<small>В планах</small></div>
          ${icon('lock')}
        </div>
        <div class="sidebar-footer">
          МОДУЛЬ ${state.view === 'database' ? '02' : '01'} <span>v0.1</span>
        </div>
      </aside>
      <div class="main-shell">
        <main id="main" tabindex="-1">
          ${storageWarning ? html`<div class="notice">${esc(storageWarning)}</div>` : ''}${content}
        </main>
      </div>
    </div>
    <dialog id="confirm-dialog">
      <div class="dialog-icon">${icon('clock')}</div>
      <h2>Завершить попытку?</h2>
      <p>
        Ответы будут зафиксированы, откроется разбор. Продолжить эту попытку
        будет нельзя
      </p>
      <div class="actions">
        ${button('cancel-finish', 'Продолжить работу', 'secondary')}${button('confirm-finish', 'Завершить', 'primary')}
      </div>
    </dialog>`;
}

function windowBar() {
  const platform = window.desktop?.platform ?? 'browser';
  return html`<header class="window-bar platform-${platform}">
    <div class="window-navigation">
      <button
        class="chrome-button"
        data-action="toggle-sidebar"
        aria-label="Переключить боковую панель"
        aria-expanded="${!sidebarCollapsed}"
        title="Боковая панель"
      >
        <svg
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16" />
        </svg>
      </button>
      <button
        class="chrome-button back-icon"
        data-action="nav-back"
        aria-label="Назад"
        ${navigationIndex <= 0 ? 'disabled' : ''}
      >
        ${icon('arrow')}
      </button>
      <button
        class="chrome-button"
        data-action="nav-forward"
        aria-label="Вперёд"
        ${navigationIndex >= navigation.length - 1 ? 'disabled' : ''}
      >
        ${icon('arrow')}
      </button>
      <div class="window-modes" aria-label="Режим работы">
        <button
          class="chrome-button ${state.view === 'lesson' ? 'selected' : ''}"
          data-view="lesson"
          aria-label="Учиться в Calc"
          title="Разбор CSV"
        >
          ${icon('book')}
        </button>
        <button
          class="chrome-button ${state.view === 'generator' ? 'selected' : ''}"
          data-view="generator"
          aria-label="Генерировать данные"
          title="Генератор"
        >
          ${icon('database')}
        </button>
      </div>
    </div>
    <div class="window-title">
      <span>formatted</span><strong>${label[state.view]}</strong>
    </div>
    <div class="window-status">
      ${active() ? html`<button class="timer-pill" data-view="practice">${icon('clock')}<span data-clock>${formatTime(remainingMs(state.session))}</span></button>` : html`<span class="connection-dot"></span><span class="local-label">На этом устройстве</span>`}
    </div>
  </header>`;
}

function lessonView() {
  const step = calcLesson.steps[lessonStep];
  const rows = calcLesson.rows.map(row =>
    row.map((value, col) => (lessonStep && col === 2 ? value.trim() : value)),
  );
  return html`${heading('ПРАКТИКА С ПОЯСНЕНИЯМИ', calcLesson.title, 'Один небольшой файл, семь шагов. Только приёмы из памятки преподавателя')}
    <div class="lesson-layout">
      <nav class="panel lesson-nav" aria-label="Шаги урока">
        ${calcLesson.steps.map((item, i) => html`<button data-action="lesson-step" data-step="${i}" class="lesson-step ${i === lessonStep ? 'selected' : ''}" ${i === lessonStep ? 'aria-current="step"' : ''}><span>${String(i + 1).padStart(2, '0')}</span>${esc(item.title)}</button>`).join('')}
      </nav>
      <section class="panel lesson-body">
        <div class="lesson-heading">
          <span class="pill subtle"
            >Шаг ${lessonStep + 1} из ${calcLesson.steps.length}</span
          ><span>${esc(step.target)}</span>
        </div>
        <h2>${esc(step.title)}</h2>
        <ol class="lesson-instructions">
          ${step.instructions.map(item => html`<li>${esc(item)}</li>`).join('')}
        </ol>
        ${
          step.formula
            ? html`<pre
                  class="lesson-formula"
                ><code>${esc(step.formula)}</code></pre>
                <p class="small-note">
                  Если включены английские имена функций, ИНДЕКС называется
                  INDEX, ПОИСКПОЗ называется MATCH
                </p>`
            : ''
        }
        <p class="lesson-reason">${esc(step.why)}</p>
        <div class="lesson-example table-scroll">
          <table class="data-table">
            <caption>
              Один исходный файл, четыре
              товара${lessonStep ? ', категории очищены' : ''}
            </caption>
            <thead>
              <tr>
                ${['Код', 'Товар', 'Категория'].map(name => html`<th>${name}</th>`).join('')}${lessonStep >= 3 ? '<th>Позиция</th>' : ''}${lessonStep >= 4 ? '<th>Ключ</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  row =>
                    html`<tr>
                      <td>${esc(row[0])}</td>
                      <td>${esc(row[1])}</td>
                      <td class="lesson-cell">${esc(row[2])}</td>
                      ${lessonStep >= 3 ? html`<td>${calcLesson.categories.findIndex(category => category[1] === row[2]) + 1}</td>` : ''}${lessonStep >= 4 ? html`<td>${calcLesson.categories.find(category => category[1] === row[2])?.[0]}</td>` : ''}
                    </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
        ${lessonStep >= 2 ? html`<div class="lesson-dictionary"><b>Справочник «Категории»</b>${calcLesson.categories.map(([id, name], i) => html`<span>${id}: ${esc(name)} <small>позиция ${i + 1}</small></span>`).join('')}</div>` : ''}
        <fieldset class="lesson-question">
          <legend>${esc(step.question)}</legend>
          <div class="actions">
            ${step.options.map((option, i) => button('lesson-answer', esc(option), lessonAnswer === i ? 'primary' : 'secondary', `data-answer="${i}" aria-pressed="${lessonAnswer === i}"`)).join('')}
          </div>
          ${lessonAnswer !== null ? html`<p role="status">${lessonAnswer === step.answer ? 'Верно' : 'Пока нет'}. ${esc(step.explanation)}</p>` : ''}
        </fieldset>
        <div class="lesson-controls actions">
          ${button('lesson-prev', 'Предыдущий шаг', 'secondary', lessonStep === 0 ? 'disabled' : '')}${button('lesson-next', 'Следующий шаг', 'primary', lessonStep === calcLesson.steps.length - 1 ? 'disabled' : '')}
        </div>
      </section>
    </div>
    <section class="panel calc-launch">
      <div class="calc-option">
        <h2>Редактор таблиц</h2>
        <p>Учебная книга с ИНДЕКС и ПОИСКПОЗ, без установки LibreOffice</p>
        ${window.desktop ? button('open-sheets', 'Открыть редактор таблиц', 'secondary') : '<p>Редактор запускается из desktop-приложения</p>'}
        <p class="small-note">
          Изменения пока хранятся только до закрытия окна
        </p>
      </div>
      <div class="calc-option">
        <h2>Выполнить самостоятельно</h2>
        <p>
          Одна рабочая книга на все шаги. Импортируй source.csv и скопируй
          данные на лист «Практика». Заполняй справочник и формулы сам, сохраняй
          книгу перед проверкой
        </p>
        <div class="actions">
          ${window.desktop ? button('calc-work', 'Открыть мою книгу', 'primary', calcBusy ? 'disabled' : '') + button('calc-check-work', 'Проверить этот шаг', 'secondary', calcBusy ? 'disabled' : '') : '<p>Рабочая книга и проверка доступны в desktop-приложении</p>'}
        </div>
        <p class="small-note">
          Можно сохранить как lesson.ods в той же папке. Для последнего шага
          сохрани рядом products.csv и categories.csv, UTF-8, разделитель ;.
          Исходный лист не меняй, рабочий лист сохраняй для проверки. На шагах с
          формулами проверяются ИНДЕКС и ПОИСКПОЗ с обычными ссылками на ячейки
        </p>
      </div>
      <div class="calc-option">
        <h2>Пример в LibreOffice Calc</h2>
        <p>
          Python открывает учебную копию с выделенной ячейкой и листом
          «Подсказка». Каждый шаг независимый: свои изменения сохраняй отдельно,
          они не переносятся в следующий шаг
        </p>
        <div class="actions">
          ${window.desktop ? button('open-calc', calcBusy ? 'Открываем…' : 'Открыть шаг в Calc', 'primary', calcBusy ? 'disabled' : '') + button('check-calc', 'Проверить Python и Calc', 'secondary', calcBusy ? 'disabled' : '') : '<span class="small-note">Открытие Calc доступно в desktop-приложении, не в браузерном превью</span>'}${button('lesson-source', 'Скачать исходный CSV', 'secondary')}
        </div>
        <p
          class="calc-status"
          role="status"
          aria-live="polite"
          ${calcMessage ? '' : 'hidden'}
        >
          ${esc(calcMessage)}
        </p>
        <p class="small-note">
          Нужны Python 3.9+ и LibreOffice Calc. Урок не устанавливает программы,
          не управляет мышью и не меняет открытые документы. В режиме на время
          подсказки недоступны
        </p>
      </div>
    </section>`;
}

function heading(
  eyebrow: string,
  title: string,
  description: string,
  action = '',
) {
  return html`<div class="page-heading">
    <div>
      <div class="eyebrow">${eyebrow}</div>
      <h1>${caption(title)}</h1>
      <p>${caption(description)}</p>
    </div>
    ${action}
  </div>`;
}

function home() {
  const s = stats();
  return html`${heading('ТВОЁ УЧЕБНОЕ ПРОСТРАНСТВО', 'От данных - к пониманию.', 'Новая предметная область. Та же уверенность в своих навыках.', html`<span class="date-chip">${new Intl.DateTimeFormat('ru', {day: 'numeric', month: 'long'}).format(new Date())}</span>`)}
    ${environmentView()}
    <div class="stats-row">
      <div>
        <span class="stat-number"
          >${String(state.quizHistory.length).padStart(2, '0')}</span
        ><span class="stat-caption">Блицев пройдено</span
        ><span class="stat-tag">Теория</span>
      </div>
      <div>
        <span class="stat-number"
          >${s.accuracy === null ? '-' : s.accuracy + '%'}</span
        ><span class="stat-caption">Верных ответов</span>
      </div>
      <div>
        <span class="stat-number"
          >${String(state.history.length).padStart(2, '0')}</span
        ><span class="stat-caption">Практических попыток</span>
      </div>
      <div>
        <span class="stat-number">${s.minutes}<small> мин</small></span
        ><span class="stat-caption">В практике</span>
      </div>
    </div>
    <div class="feature-grid">
      <section class="hero-card">
        <div class="hero-copy">
          <span class="pill">МОДУЛЬ 01 / ОСНОВЫ</span>
          <h2>Сначала понять<br />Потом нормализовать</h2>
          <p>Ключи, связи и формулы - через короткие вопросы с объяснениями</p>
          <button class="button light" data-view="quiz">
            Начать блиц ${icon('arrow')}
          </button>
        </div>
        <div class="hero-bottom">
          <span>${questions.length} вопроса в библиотеке</span
          ><span>~ 5 минут</span>
        </div>
      </section>
      <section class="sprint-card">
        <div class="sprint-top">${icon('clock')}<span>ПРАКТИКА</span></div>
        <h2>Практика на время</h2>
        <p>Три CSV, 12 таблиц и самостоятельная работа в Calc</p>
        <div class="sprint-digits">45<span>:00</span></div>
        <button class="button secondary" data-view="practice">
          ${active() ? 'Вернуться к попытке' : 'Настроить тренировку'}
          ${icon('arrow')}</button
        ><small>Время выбираешь сам, не официальный лимит</small>
      </section>
    </div>
    <div class="section-heading">
      <div>
        <h2>Данные для практики</h2>
        <p>Три области. Три разные модели отношений</p>
      </div>
      <button class="text-button" data-view="generator">
        Открыть генератор ${icon('arrow')}
      </button>
    </div>
    <div class="domain-grid">
      ${domains
        .map(
          d =>
            html`<button
              class="domain-card"
              data-action="domain"
              data-domain="${d.id}"
            >
              ${folder(d)}
              <div class="domain-info">
                <div>
                  <h3>${d.name}</h3>
                  <p>${caption(d.subtitle)}</p>
                </div>
                ${icon('arrow')}
              </div>
            </button>`,
        )
        .join('')}
    </div>
    <div class="section-heading">
      <div>
        <h2>Последние попытки</h2>
        <p>Возвращайся к результатам и находи, что повторить</p>
      </div>
      <button class="text-button" data-view="history">
        Весь прогресс ${icon('arrow')}
      </button>
    </div>
    ${historyTable(3)}`;
}

function configFields(config: Config, {duration = false} = {}) {
  return html`<label
      >Предметная область<select name="domain">
        ${domains.map(d => html`<option value="${d.id}" ${config.domain === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
      </select></label
    >
    <div class="field-row">
      <label
        >Строк операций<input
          name="size"
          type="number"
          min="20"
          max="500"
          value="${config.size}"
          required /></label
      ><label
        >Сложность<select name="difficulty">
          <option
            value="basic"
            ${config.difficulty === 'basic' ? 'selected' : ''}
          >
            Light
          </option>
          <option
            value="medium"
            ${config.difficulty === 'medium' ? 'selected' : ''}
          >
            Medium
          </option>
          <option
            value="advanced"
            ${config.difficulty === 'advanced' ? 'selected' : ''}
          >
            Hard
          </option>
        </select></label
      >
    </div>
    <label
      >Код для повторного открытия
      <div class="seed-field">
        <input
          name="seed"
          value="${esc(config.seed)}"
          maxlength="40"
          pattern="(?:[A-Za-z0-9_]|-)+"
          required
        /><button
          type="button"
          data-action="random-seed"
          aria-label="Новый случайный код"
          title="Новый случайный код"
        >
          ${icon('shuffle')}
        </button>
      </div></label
    ><label
      >Формат набора<select name="generatorVersion">
        <option value="2" ${config.generatorVersion !== 1 ? 'selected' : ''}>
          3 CSV, цель 12 таблиц
        </option>
        <option value="1" ${config.generatorVersion === 1 ? 'selected' : ''}>
          Старый вариант, 1 CSV
        </option>
      </select></label
    >${
      duration
        ? '<label>Лимит времени, минут<input name="minutes" type="number" min="1" max="240" value="45" required></label>'
        : html`<label
            >Разделитель CSV<select name="delimiter">
              <option value=";" ${state.delimiter === ';' ? 'selected' : ''}>
                Точка с запятой ;
              </option>
              <option value="," ${state.delimiter === ',' ? 'selected' : ''}>
                Запятая ,
              </option>
            </select></label
          >`
    }`;
}

function exportButtons(dataset: Dataset) {
  return window.desktop
    ? button('export', `${icon('download')} Сохранить набор`, 'primary')
    : html`<div class="actions">
        ${sourceFiles(dataset)
          .map(source =>
            button(
              'download',
              `${icon('download')} ${esc(source.name)}`,
              'primary',
              `data-file="${source.name}"`,
            ),
          )
          .join(
            '',
          )}${button('download', 'Задание', 'secondary', 'data-file="assignment.md"')}${button('download', 'Параметры', 'ghost', 'data-file="variant.json"')}
      </div>`;
}

let csvPage = 0;
let csvVariant = '';
let csvSource = 0;
const csvPageSize = 10;

function datasetInfo(dataset: Dataset) {
  const key = JSON.stringify(dataset.config);
  if (key !== csvVariant) {
    csvPage = 0;
    csvSource = 0;
    csvVariant = key;
  }
  const sources = sourceFiles(dataset);
  const source = sources[csvSource] ?? sources[0];
  const pages = Math.ceil(source.rows.length / csvPageSize);
  csvPage = Math.max(0, Math.min(csvPage, pages - 1));
  const start = csvPage * csvPageSize;
  const rows = source.rows.slice(start, start + csvPageSize);
  return html`<div class="csv-preview">
    <div class="source-switcher" role="group" aria-label="Исходные CSV">
      ${sources.map((file, i) => button('csv-source', esc(file.name), 'secondary', `data-source="${i}" aria-pressed="${i === csvSource}"`)).join('')}
      <span
        >${dataset.targetTableCount ? 'Цель: 12 таблиц после нормализации' : 'Архивный формат v1'}</span
      >
    </div>
    <div class="dataset-title">
      <span class="file-icon">${icon('file')}</span>
      <div>
        <h3>${source.name}</h3>
        <span
          >${source.rows.length} строк, ${source.headers.length} полей,
          UTF-8</span
        >
      </div>
      <div class="dataset-summary">
        <h2>${esc(dataset.domain.name)}</h2>
        <p>${caption(source.grain)}</p>
      </div>
      <span class="pill subtle">${esc(dataset.config.seed)}</span>
    </div>
    <div class="preview-guide">
      <span>Исходные данные, без изменений</span
      ><span>Прокрути таблицу вправо, чтобы увидеть остальные столбцы</span>
    </div>
    <div
      class="table-scroll csv-scroll"
      tabindex="0"
      role="region"
      aria-label="Исходный CSV, прокрутка по горизонтали"
    >
      <table class="data-table" aria-label="Предпросмотр исходного CSV">
        <thead>
          <tr>
            <th class="row-number" scope="col">№</th>
            ${source.headers.map(h => html`<th scope="col">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row, i) =>
                html`<tr>
                  <th scope="row" class="row-number">${start + i + 1}</th>
                  ${source.headers.map(h => html`<td><span title="${esc(row[h])}">${esc(row[h])}</span></td>`).join('')}
                </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <div class="table-foot">
      <span aria-live="polite"
        >Строки ${start + 1}-${start + rows.length} из
        ${source.rows.length}</span
      >
      <div class="csv-pagination">
        <button
          type="button"
          class="button secondary"
          data-action="csv-prev"
          ${csvPage === 0 ? 'disabled' : ''}
          aria-label="Предыдущие строки"
        >
          Назад</button
        ><span>Страница ${csvPage + 1} из ${pages}</span
        ><button
          type="button"
          class="button secondary"
          data-action="csv-next"
          ${csvPage === pages - 1 ? 'disabled' : ''}
          aria-label="Следующие строки"
        >
          Далее
        </button>
      </div>
    </div>
  </div>`;
}

function tasksList(dataset: Dataset) {
  return dataset.tasks
    .map(
      (task, i) =>
        html`<div class="task-line">
          <span>${String(i + 1).padStart(2, '0')}</span>
          <p>${esc(task.prompt)}</p>
        </div>`,
    )
    .join('');
}

function generator() {
  const data = generateDataset(state.config);
  return html`${heading('СОЗДАЙ СВОЙ ВАРИАНТ', 'Лаборатория данных', 'Исходники и условия меняются. Решение всегда остаётся за тобой.')}
    ${active() ? '<div class="notice">Идёт попытка на время. Генерация других вариантов доступна после завершения</div>' : ''}
    <div class="generator-layout">
      <section class="panel config-panel">
        <div class="panel-title">
          ${icon('shuffle')}
          <h2>Параметры варианта</h2>
        </div>
        <form id="generator-form">
          ${configFields(state.config)}
          <div class="generator-submit">
            <button
              type="submit"
              class="button primary full"
              ${active() ? 'disabled' : ''}
            >
              Новый вариант ${icon('arrow')}</button
            ><button
              type="button"
              class="button secondary full"
              data-action="open-variant"
              ${active() ? 'disabled' : ''}
            >
              Открыть по коду
            </button>
          </div>
        </form>
        <div class="small-note">
          «Новый вариант» меняет данные и все три условия выборок. «Открыть по
          коду» повторяет набор с указанными параметрами
          ${
            state.config.aiTheme
              ? html`<p>
                    AI-тема: ${esc(state.config.aiTheme.title)}. Для повторения
                    сохрани variant.json: одного кода недостаточно
                  </p>
                  ${button('clear-ai', 'Вернуться к обычной теме', 'secondary')}`
              : ''
          }
          ${button('show-ai', 'Создать тему с локальной AI', 'text-button')}
        </div>
      </section>
      <div class="generator-right">
        <section class="panel dataset-panel">
          ${datasetInfo(data)}
          <div class="export-row">
            <span
              >${sourceFiles(data).length} CSV + задание + параметры<br /><small
                >Без готовой схемы и ответов</small
              ></span
            >${exportButtons(data)}
          </div>
        </section>
        <section class="panel">
          <div class="panel-title">
            <h2>Условия выборок</h2>
            <span class="pill subtle">3 задания</span>
          </div>
          ${tasksList(data)}
          <p class="small-note">
            После нормализации выполни выборки в Calc или SQL. В тренировке
            проверяются числовые ответы, не текст запросов
          </p>
        </section>
      </div>
    </div>
    <section class="panel rules-panel">
      <div>
        <span class="eyebrow">СНАЧАЛА ПРОЧИТАЙ</span>
        <h2>Правила предметной области</h2>
        <p>${esc(data.domain.description)}</p>
      </div>
      <ul>
        ${data.rules.map(rule => html`<li>${esc(rule)}</li>`).join('')}
      </ul>
    </section>
    ${active() ? '' : normalizationView(data)} ${aiPanel()}`;
}

function aiPanel() {
  return html`<section class="panel ai-panel" id="ai-panel">
    <div class="panel-title">
      <h2>Новая тема с локальной AI</h2>
      <span class="pill subtle">Эксперимент</span>
    </div>
    <p>
      Qwen предлагает названия и описание внутри выбранной модели данных:
      торговля, библиотека книг или учебный центр. Новые схемы отношений она не
      создаёт
    </p>
    <p class="small-note">
      Только локальная генерация, без аккаунта и API-ключа. Вводи вымышленную
      тему, не персональные данные. Скриншоты и макеты WinForms не меняются
    </p>
    ${
      window.desktop
        ? html`<form id="ai-form">
            <label
              >Тема задания<input
                id="ai-topic"
                name="topic"
                maxlength="300"
                required
                placeholder="Например, магазин спортивной одежды"
                value="${esc(aiTopic)}"
                ${aiBusy || active() ? 'disabled' : ''}
            /></label>
            <div class="actions">
              <button
                type="submit"
                class="button primary"
                ${aiBusy || active() ? 'disabled' : ''}
              >
                ${aiBusy ? 'Подожди завершения…' : 'Предложить тему'}
              </button>
              ${aiBusy ? button('cancel-ai', 'Отменить', 'secondary') : button('check-ai', 'Проверить подключение', 'secondary', active() ? 'disabled' : '')}
            </div>
          </form>`
        : '<div class="notice">В браузерном превью подключение к модели отключено. Запусти desktop-приложение через npm start</div>'
    }
    <p class="ai-status" role="status" aria-live="polite">${esc(aiMessage)}</p>
    <details class="ai-setup">
      <summary>Как подключить бесплатную локальную модель</summary>
      <ol>
        <li>Установи Ollama с официального сайта ollama.com для своей ОС</li>
        <li>Открой Ollama и нажми «Скачать модель» ниже</li>
        <li>После загрузки укажи тему и нажми «Предложить тему»</li>
      </ol>
      <p>
        ${AI_MODEL} занимает около 2,5 ГБ на диске и требует свободной
        оперативной памяти для работы. Интернет нужен только для скачивания
        модели. Адрес подключения задан приложением, настройки и ключи не нужны
      </p>
      ${window.desktop ? button('download-ai', 'Скачать модель', 'secondary', aiBusy || active() ? 'disabled' : '') : ''}
    </details>
    ${
      aiDraft
        ? html`<div class="ai-draft">
            <span class="pill subtle">Черновик, ещё не применён</span>
            <h3>${esc(aiDraft.title)}</h3>
            <form id="ai-draft-form">
              <label
                >Название<input
                  name="title"
                  maxlength="80"
                  value="${esc(aiDraft.title)}"
                  required
              /></label>
              <label
                >Описание предметной области<textarea
                  name="description"
                  maxlength="1800"
                  rows="5"
                  required
                >
${esc(aiDraft.description)}</textarea>
              </label>
              <details>
                <summary>Проверить и исправить тематические названия</summary>
                ${Object.entries(aiDraft.values)
                  .map(
                    ([field, values]) =>
                      html`<label
                        >${esc(field)}: ${values.length} значений, по одному на
                        строку<textarea
                          data-vocabulary="${esc(field)}"
                          rows="${Math.min(values.length, 5)}"
                          required
                        >
${values.map(esc).join('\n')}</textarea>
                      </label>`,
                  )
                  .join('')}
              </details>
            </form>
            <p class="small-note">
              Проверена структура ответа, не фактическая или смысловая точность
              текста. Применение заменит текущий вариант, сохранённые попытки не
              изменятся
            </p>
            <div class="actions">
              ${button('apply-ai', 'Применить тему', 'primary', aiBusy || active() ? 'disabled' : '')}${button('discard-ai', 'Отклонить', 'secondary', aiBusy ? 'disabled' : '')}
            </div>
          </div>`
        : ''
    }
    <div class="actions ai-import">
      ${button('import-variant', 'Открыть variant.json', 'secondary', active() || aiBusy ? 'disabled' : '')}<input
        type="file"
        id="variant-import"
        accept=".json,application/json"
        hidden
      />
    </div>
  </section>`;
}

function refreshAiPanel() {
  const panel = document.querySelector('#ai-panel');
  if (panel) panel.outerHTML = aiPanel();
}

async function proposeTheme() {
  if (!window.desktop || aiBusy || active()) return;
  const form = query<HTMLFormElement>('#generator-form');
  if (!form.reportValidity()) return;
  aiBusy = true;
  aiDraft = null;
  aiMessage =
    'Ожидаем локальную модель, до 3 минут. Можно продолжать пользоваться приложением';
  refreshAiPanel();
  try {
    const config = normalizeConfig({
      ...Object.fromEntries(new FormData(form)),
      generatorVersion: 2,
    });
    aiDraft = await window.desktop.generateAiTheme(config, aiTopic);
    aiDraftConfig = config;
    aiMessage = 'Черновик готов. Проверь описание и названия перед применением';
  } catch (error) {
    aiMessage = errorMessage(error);
  } finally {
    aiBusy = false;
    refreshAiPanel();
  }
}

function quizView() {
  const quiz = state.quiz;
  if (!quiz)
    return html`${heading('КОРОТКО. ОСМЫСЛЕННО.', 'Проверим понимание?', 'Не вспоминай готовый код. Выбирай ответ и разбирай причину.')}
      <div class="quiz-intro panel">
        <div class="quiz-illustration">${icon('quiz')}</div>
        <span class="pill">БЛИЦ / МОДУЛЬ 01</span>
        <h2>Один вопрос - одна идея</h2>
        <p>
          До 8 вопросов за подход. Порядок вопросов и ответов меняется<br />Подсказки
          доступны, но самостоятельные ответы отмечаются отдельно
        </p>
        <form id="quiz-form">
          <label
            >Тема<select name="topic">
              <option>Все темы</option>
              ${topics.map(t => html`<option>${t}</option>`).join('')}
            </select></label
          ><button class="button primary" type="submit">
            Начать викторину ${icon('arrow')}
          </button>
        </form>
        <div class="intro-tags">
          <span>${questions.length} вопроса</span
          ><span>Разбор каждого ответа</span><span>Без таймера</span>
        </div>
        <p class="formula-scope">${FORMULA_SCOPE}</p>
      </div>`;
  if (quiz.completed) {
    const correct = quiz.answers.filter(a => a.correct).length;
    const independent = quiz.answers.filter(a => a.correct && !a.hint).length;
    return html`${heading('ЕЩЁ ОДИН ШАГ ВПЕРЁД', 'Блиц завершён', 'Правильный ответ важен. Понимание причины - ещё важнее.')}
      <section class="panel result-hero">
        <div class="result-score">
          ${correct}<span> / ${quiz.questions.length}</span>
        </div>
        <h2>
          ${correct === quiz.questions.length ? 'Отличный результат' : 'Есть что закрепить'}
        </h2>
        <p>
          Самостоятельно верных: ${independent}. С подсказкой:
          ${quiz.answers.filter(a => a.hint).length}
        </p>
        <div class="actions">
          ${button('new-quiz', 'Новый блиц', 'primary')}${button('view-generator', 'Перейти к практике', 'secondary')}
        </div>
      </section>
      <div class="section-heading"><h2>Разбор вопросов</h2></div>
      <div class="review-list">
        ${quiz.questions
          .map(
            (q, i) =>
              html`<article class="panel review-item">
                ${icon(quiz.answers[i].correct ? 'check' : 'close', quiz.answers[i].correct ? 'green-text' : 'orange-text')}
                <div>
                  <h3>${esc(q.question)}</h3>
                  <p>Твой ответ: ${esc(q.options[quiz.answers[i].choice])}</p>
                  <p class="bright">${esc(q.explanation)}</p>
                </div>
              </article>`,
          )
          .join('')}
      </div>`;
  }
  const index = quiz.answers.length;
  const q = quiz.questions[index];
  const pending = quiz.pending;
  return html`${heading('ТРЕНИРУЕМ ПОНИМАНИЕ', 'Блиц-викторина', 'Думай о смысле данных. Не торопись.')}
    <section class="panel quiz-card">
      <div class="quiz-meta">
        <span class="pill subtle">${q.topic}</span
        ><span
          >Вопрос ${index + 1}
          <span class="muted">/ ${quiz.questions.length}</span></span
        >
      </div>
      <progress max="${quiz.questions.length}" value="${index}"></progress>
      <h2>${esc(q.question)}</h2>
      <div class="answer-options">
        ${q.options.map((option, i) => html`<button class="answer ${pending ? (i === q.correct ? 'correct' : pending.choice === i ? 'incorrect' : '') : ''}" data-action="answer" data-choice="${i}" ${pending ? 'disabled' : ''}><span class="answer-letter">${String.fromCharCode(65 + i)}</span><span>${esc(option)}</span>${pending && i === q.correct ? icon('check') : ''}</button>`).join('')}
      </div>
      ${
        pending
          ? html`<div
              class="feedback ${pending.correct ? 'success' : 'try-again'}"
            >
              <strong
                >${pending.correct ? 'Верно. Вот почему:' : 'Разберём, почему иначе:'}</strong
              >
              <p>${esc(q.explanation)}</p>
            </div>`
          : quiz.hint
            ? html`<div class="hint-box">
                ${icon('help')}
                <p>${esc(q.hint)}</p>
              </div>`
            : ''
      }
      <div class="quiz-footer">
        ${!pending ? button('hint', `${icon('help')} Подсказка`, 'ghost', quiz.hint ? 'disabled' : '') : '<span class="small-note">Знание закрепляется через объяснение</span>'}${pending ? button('next-question', `${index + 1 === quiz.questions.length ? 'Завершить блиц' : 'Следующий вопрос'} ${icon('arrow')}`, 'primary') : '<span class="small-note">Выбери один ответ</span>'}
      </div>
    </section>`;
}

function practice() {
  const session = state.session;
  if (!session)
    return html`${heading('САМОСТОЯТЕЛЬНЫЙ РЕЖИМ', 'Практика на время', 'Тренируй первую часть: три исходных CSV и 12 связанных таблиц')}
      <div class="practice-setup">
        <section class="panel">
          <div class="panel-title">
            ${icon('clock')}
            <h2>Новая попытка</h2>
          </div>
          <form id="practice-form">
            ${configFields(state.config, {duration: true})}<button
              class="button primary full"
              type="submit"
            >
              Запустить таймер ${icon('arrow')}
            </button>
          </form>
        </section>
        <section class="practice-guide">
          <span class="pill">КАК ЭТО РАБОТАЕТ</span>
          <h2>Твоя работа<br />Твои решения</h2>
          <ol>
            <li>
              <strong>Забери исходники</strong>
              <p>Сохрани CSV и условия, открой данные в LibreOffice Calc</p>
            </li>
            <li>
              <strong>Нормализуй самостоятельно</strong>
              <p>
                Для нового формата выдели 12 таблиц, назначь PK и FK, сохрани
                .ods и отдельные CSV
              </p>
            </li>
            <li>
              <strong>Выполни выборки</strong>
              <p>Введи три числовых ответа и пройди чек-лист</p>
            </li>
            <li>
              <strong>Разбери результат</strong>
              <p>
                Ответы откроются после завершения. Схему оцениваешь
                самостоятельно
              </p>
            </li>
          </ol>
          <div class="notice">
            Таймер продолжает идти при закрытии приложения и во время сна. Паузы
            нет. Это учебный лимит, не официальный регламент
          </div>
        </section>
      </div>`;
  const data = generateDataset(session.config);
  if (session.status !== 'running') return report(session, data);
  return html`${heading('ПОПЫТКА В ПРОЦЕССЕ', data.domain.name, `Вариант ${esc(session.config.seed)}, ${session.config.size} строк, работа в Calc`, html`<div class="big-timer">${icon('clock')}<span data-clock>${formatTime(remainingMs(session))}</span></div>`)}<progress
      class="session-progress"
      max="${session.minutes * 60000}"
      value="${remainingMs(session)}"
      data-time-progress
    ></progress>
    <div class="practice-active">
      <div>
        <section class="panel">
          <div class="panel-title">
            <h2>01. Исходники и условия</h2>
            ${exportButtons(data)}
          </div>
          <p>${esc(data.domain.description)}</p>
          <ul class="rules-list">
            ${sourceFiles(data)
              .map(
                source =>
                  html`<li>
                    ${source.name}: ${source.rows.length} строк, ${source.grain}
                  </li>`,
              )
              .join('')}
          </ul>
          <ul class="rules-list">
            ${data.rules.map(rule => html`<li>${esc(rule)}</li>`).join('')}
          </ul>
          <div class="small-note">
            ${session.exported ? 'Набор сохранён. Работай в отдельной книге, не меняй исходный CSV.' : 'Сначала сохрани набор. В нём нет готового решения.'}
          </div>
        </section>
        <section class="panel">
          <h2>02. Результаты выборок</h2>
          <p class="muted">Ответы проверятся только после завершения</p>
          <div class="task-inputs">
            ${data.tasks
              .map(
                (task, i) =>
                  html`<label class="task-input"
                    ><span><b>${i + 1}.</b> ${esc(task.prompt)}</span
                    ><input
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]+"
                      data-answer="${task.id}"
                      value="${esc(session.answers[task.id] ?? '')}"
                      placeholder="Целое число"
                      aria-label="Ответ на задание ${i + 1}"
                  /></label>`,
              )
              .join('')}
          </div>
        </section>
      </div>
      <aside class="panel checklist-panel">
        <span class="eyebrow">САМОПРОВЕРКА</span>
        <h2>03. Нормализация</h2>
        <p>Отметь только то, что действительно сделал</p>
        ${checklist.map((text, i) => html`<label class="check-item"><input type="checkbox" data-check="${i}" ${session.checks.includes(i) ? 'checked' : ''} /><span>${text}</span></label>`).join('')}
        <div class="notice">
          Это твоя самооценка. Приложение не проверяет структуру созданных
          таблиц
        </div>
        ${button('finish', 'Завершить попытку', 'primary full')}<small
          >Можно завершить раньше таймера</small
        >
      </aside>
    </div>`;
}

function report(session: PracticeSession, data: Dataset) {
  const grades = gradeTasks(data, session.answers);
  const score = grades.filter(g => g.correct).length;
  const status = {
    running: 'Попытка идёт',
    submitted: 'Попытка завершена',
    expired: 'Время вышло',
    interrupted: 'Попытка прервана',
  }[session.status];
  return html`${heading('РАЗБОР ПРАКТИКИ', status, `${data.domain.name}, ${esc(session.config.seed)}, ${dateLabel(session.startedAt)}`, button('new-session', 'Новая попытка', 'primary'))}
    <div class="report-stats">
      <div class="panel">
        <span class="eyebrow">ВЫБОРКИ</span
        ><strong>${score}<small> / 3</small></strong>
        <p>Верных числовых ответов</p>
      </div>
      <div class="panel">
        <span class="eyebrow">ВРЕМЯ</span
        ><strong>${formatTime(session.finishedAt! - session.startedAt)}</strong>
        <p>Из ${session.minutes} минут</p>
      </div>
      <div class="panel">
        <span class="eyebrow">САМОПРОВЕРКА</span
        ><strong>${session.checks.length}<small> / 4</small></strong>
        <p>Отмечено тобой, не проверено автоматически</p>
      </div>
    </div>
    <div class="review-list">
      ${grades
        .map(
          (g, i) =>
            html`<section class="panel review-item">
              ${icon(g.correct ? 'check' : 'close', g.correct ? 'green-text' : 'orange-text')}
              <div>
                <span class="eyebrow">ЗАДАНИЕ ${i + 1}</span>
                <h3>${esc(g.prompt)}</h3>
                <div class="answer-comparison">
                  <span
                    >Твой ответ <b>${esc(g.submitted || 'Не указан')}</b></span
                  ><span>Верный ответ <b>${g.answer}</b></span>
                </div>
                <p>${g.explanation}</p>
              </div>
            </section>`,
        )
        .join('')}
    </div>
    ${normalizationView(data)}
    <section class="panel reflection">
      <h2>Объясни своё решение</h2>
      ${data.questions.map(q => html`<p>${esc(q)}</p>`).join('')}
      <div class="notice">
        Результат выборок не доказывает правильность нормализации. Открой свою
        .ods, проверь PK/FK и объясни зависимости. Официальные экзаменационные
        баллы не рассчитываются
      </div>
    </section>`;
}

function historyTable(limit = 100) {
  const rows = [
    ...state.history.map(s => ({
      kind: 'practice',
      id: s.id,
      time: s.finishedAt!,
      name:
        s.config.aiTheme?.title ??
        domains.find(d => d.id === s.config.domain)?.name ??
        '',
      sub: s.config.seed,
      result: `${gradeTasks(generateDataset(s.config), s.answers).filter(g => g.correct).length} / 3`,
      badge: s.status === 'expired' ? 'Время вышло' : 'Завершено',
    })),
    ...state.quizHistory.map(q => ({
      kind: 'quiz',
      id: '',
      time: q.time,
      name: 'Блиц-викторина',
      sub: q.topic,
      result: `${q.correct} / ${q.total}`,
      badge: 'Пройдено',
    })),
  ]
    .sort((a, b) => b.time - a.time)
    .slice(0, limit);
  return html`<div class="panel history-panel">
    ${
      !rows.length
        ? html`<div class="empty-state">
            ${icon('chart')}
            <h3>Здесь начнётся твоя история</h3>
            <p>Пройди первый блиц или закончи практическую попытку</p>
          </div>`
        : html`<div class="table-scroll">
            <table class="history-table">
              <thead>
                <tr>
                  <th>ПОПЫТКА</th>
                  <th>ДАТА</th>
                  <th>РЕЗУЛЬТАТ</th>
                  <th>СТАТУС</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    row =>
                      html`<tr>
                        <td>
                          <div class="history-name">
                            ${icon(row.kind === 'quiz' ? 'quiz' : 'database')}
                            <div>
                              ${row.kind === 'practice' ? html`<button class="text-button history-link" data-action="open-report" data-id="${esc(row.id)}">${esc(row.name)}</button>` : esc(row.name)}<small
                                >${esc(row.sub)}</small
                              >
                            </div>
                          </div>
                        </td>
                        <td>${dateLabel(row.time)}</td>
                        <td><b>${row.result}</b></td>
                        <td><span class="pill subtle">${row.badge}</span></td>
                      </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>`
    }
  </div>`;
}

function history() {
  const s = stats();
  const independent = state.quizHistory.filter(
    q => q.correct === q.total && q.hints === 0,
  ).length;
  const bestScore = Math.max(
    0,
    ...state.history.map(
      s =>
        gradeTasks(generateDataset(s.config), s.answers).filter(g => g.correct)
          .length,
    ),
  );
  const domainCount = new Set(state.history.map(s => s.config.domain)).size;
  const badges: [string, string, string, number, number][] = [
    [
      'Первый шаг',
      'Завершить первый блиц',
      'quiz',
      Math.min(state.quizHistory.length, 1),
      1,
    ],
    [
      'Без подсказок',
      'Весь блиц верно и самостоятельно',
      'medal',
      Math.min(independent, 1),
      1,
    ],
    [
      'Точный результат',
      'Все три выборки верны в одной попытке',
      'check',
      bestScore,
      3,
    ],
    [
      'Новый контекст',
      'Завершить практику в трёх областях',
      'layers',
      domainCount,
      3,
    ],
  ];
  return html`${heading('НЕ ТОЛЬКО ЦИФРЫ', 'Твой прогресс', 'Отмечаем практику и самостоятельность. Не выдаём активность за освоение.')}
    <div class="achievement-grid">
      ${badges
        .map(
          ([name, description, glyph, value, goal]) =>
            html`<article
              class="panel achievement ${value === goal ? 'earned' : ''}"
            >
              <div class="badge-art">${icon(glyph)}</div>
              <div class="achievement-copy">
                <div class="achievement-title">
                  <h3>${name}</h3>
                  <span class="achievement-status"
                    >${value === goal ? `${icon('check')} Открыто` : `${value} / ${goal}`}</span
                  >
                </div>
                <p>${description}</p>
                <progress
                  aria-label="${name}"
                  value="${value}"
                  max="${goal}"
                ></progress>
              </div>
            </article>`,
        )
        .join('')}
    </div>
    <div class="section-heading">
      <div>
        <h2>История занятий</h2>
        <p>
          ${s.answered} ответов в завершённых блицах, ${state.exports}
          сохранений учебных файлов
        </p>
      </div>
    </div>
    ${historyTable()}
    <div class="notice">
      Прогресс хранится локально в этом приложении. В браузерном предпросмотре -
      отдельно, в текущем браузере. Чек-лист нормализации - самооценка, не
      автоматический зачёт
    </div>`;
}

function render() {
  closeSelectMenu();
  if (!label[state.view]) state.view = 'home';
  if (active() && ['lesson', 'quiz', 'database'].includes(state.view))
    state.view = 'practice';
  if (navigation[navigationIndex] !== state.view) {
    navigation.splice(navigationIndex + 1);
    navigation.push(state.view);
    navigationIndex = navigation.length - 1;
  }
  query('#app').innerHTML = shell(
    {
      home,
      generator,
      quiz: quizView,
      practice,
      history,
      lesson: lessonView,
      database: databaseView,
    }[state.view](),
  );
  enhanceSelects(query('#app'));
  enhanceNumbers(query('#app'));
  if (state.view === 'database') mountDatabase();
}

function complete() {
  if (!active()) return;
  state.session = finishSession(state.session!);
  if (!state.history.some(s => s.id === state.session!.id))
    state.history.push(structuredClone(state.session!));
  state.view = 'practice';
  save();
  render();
}

async function exportCurrent(fileName?: string) {
  const config =
    active() && state.view === 'practice'
      ? state.session!.config
      : state.config;
  if (window.desktop) {
    const result = await window.desktop.exportDataset(config, state.delimiter);
    if (result.canceled) return;
    toast(`Набор сохранён: ${result.directory}`);
  } else {
    const file = exportFiles(config, state.delimiter).find(
      f => f.name === fileName,
    );
    if (!file) throw new Error('Файл не найден.');
    const url = URL.createObjectURL(
      new Blob([file.content], {
        type: file.name.endsWith('.csv')
          ? 'text/csv;charset=utf-8'
          : 'text/plain;charset=utf-8',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.domain}-${config.seed}-${file.name}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Файл передан браузеру для скачивания.');
  }
  state.exports++;
  if (active() && state.view === 'practice') state.session!.exported = true;
  save();
  render();
}

document.addEventListener('click', async event => {
  const target =
    event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-view], [data-action]')
      : null;
  if (!target || target.disabled) return;
  try {
    if (active() && Date.now() >= state.session!.deadline) {
      complete();
      return;
    }
    if (target.dataset.view) {
      if (
        active() &&
        ['quiz', 'lesson', 'database'].includes(target.dataset.view)
      ) {
        toast('Блиц и подсказки доступны после завершения попытки.');
        return;
      }
      state.view = target.dataset.view as View;
      save();
      render();
      return;
    }
    switch (target.dataset.action) {
      case 'setup-page':
        if (window.desktop && !active())
          await window.desktop.openSetupPage(
            target.dataset.tool as 'calc' | 'python' | 'ollama',
          );
        return;
      case 'check-environment': {
        if (!window.desktop) return;
        target.disabled = true;
        const output = query('.environment-status');
        output.textContent = 'Проверяем Python, Calc и локальную модель';
        const results = await Promise.allSettled([
          window.desktop.calcStatus(),
          window.desktop.aiStatus(),
        ]);
        output.textContent = results
          .map(r =>
            r.status === 'fulfilled' ? r.value.message : errorMessage(r.reason),
          )
          .join('\n');
        target.disabled = false;
        return;
      }
      case 'toggle-sidebar':
        sidebarCollapsed = !sidebarCollapsed;
        render();
        return;
      case 'nav-back':
      case 'nav-forward': {
        const index =
          navigationIndex + (target.dataset.action === 'nav-back' ? -1 : 1);
        const view = navigation[index];
        if (!view) return;
        if (active() && ['quiz', 'lesson'].includes(view)) {
          toast('Подсказки доступны после завершения попытки');
          return;
        }
        navigationIndex = index;
        state.view = view;
        break;
      }
      case 'lesson-step':
      case 'lesson-prev':
      case 'lesson-next':
        if (active()) return;
        lessonStep =
          target.dataset.action === 'lesson-step'
            ? Number(target.dataset.step)
            : lessonStep + (target.dataset.action === 'lesson-next' ? 1 : -1);
        lessonStep = Math.max(
          0,
          Math.min(calcLesson.steps.length - 1, lessonStep),
        );
        lessonAnswer = null;
        calcMessage = '';
        break;
      case 'lesson-answer':
        if (active()) return;
        lessonAnswer = Number(target.dataset.answer);
        break;
      case 'open-sheets':
        if (!window.desktop || active()) return;
        try {
          await window.desktop.openSheets();
        } catch (error) {
          toast(errorMessage(error));
        }
        return;
      case 'check-calc':
      case 'open-calc':
      case 'calc-work':
      case 'calc-check-work':
        if (!window.desktop || active() || calcBusy) return;
        calcBusy = true;
        calcMessage = 'Проверяем доступные программы';
        render();
        try {
          const result =
            target.dataset.action === 'calc-work' ||
            target.dataset.action === 'calc-check-work'
              ? await window.desktop.calcWork(
                  lessonStep,
                  target.dataset.action === 'calc-work' ? 'work' : 'check',
                )
              : target.dataset.action === 'open-calc'
                ? await window.desktop.openCalcLesson(lessonStep)
                : await window.desktop.calcStatus();
          calcMessage =
            result.message +
            (result.issues?.length ? '\n' + result.issues.join('\n') : '') +
            (result.directory ? `\nПапка примера: ${result.directory}` : '');
        } catch (error) {
          calcMessage = errorMessage(error);
        } finally {
          calcBusy = false;
          render();
        }
        return;
      case 'lesson-source': {
        if (active()) return;
        const rows = calcLesson.rows.map(row =>
          Object.fromEntries(
            calcLesson.headers.map((field, i) => [field, row[i]]),
          ),
        );
        const url = URL.createObjectURL(
          new Blob([toCsv(calcLesson.headers, rows, ';')], {
            type: 'text/csv;charset=utf-8',
          }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'source.csv';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return;
      }
      case 'show-ai':
        query('#ai-panel').scrollIntoView({behavior: 'smooth', block: 'start'});
        return;
      case 'check-ai':
        if (!window.desktop || active() || aiBusy) return;
        target.disabled = true;
        try {
          aiMessage = (await window.desktop.aiStatus()).message;
        } catch (error) {
          aiMessage = errorMessage(error);
        }
        refreshAiPanel();
        return;
      case 'cancel-ai':
        await window.desktop?.cancelAiTheme();
        return;
      case 'download-ai':
        if (!window.desktop || active() || aiBusy) return;
        aiBusy = true;
        aiMessage =
          'Подтверди скачивание модели. Загрузка может занять несколько минут';
        refreshAiPanel();
        try {
          aiMessage = (await window.desktop.downloadAiModel()).message;
        } catch (error) {
          aiMessage = errorMessage(error);
        } finally {
          aiBusy = false;
          refreshAiPanel();
        }
        return;
      case 'apply-ai':
        if (!aiDraft || !aiDraftConfig || active() || aiBusy) return;
        {
          const form = query<HTMLFormElement>('#ai-draft-form');
          if (!form.reportValidity()) return;
          const values = new FormData(form);
          aiDraft = validateAiTheme(
            {
              ...aiDraft,
              title: values.get('title'),
              description: values.get('description'),
              values: Object.fromEntries(
                [
                  ...form.querySelectorAll<HTMLTextAreaElement>(
                    '[data-vocabulary]',
                  ),
                ].map(input => [
                  input.dataset.vocabulary!,
                  input.value.split(/\r?\n/),
                ]),
              ),
            },
            aiDraftConfig.domain,
          );
        }
        state.config = normalizeConfig({...aiDraftConfig, aiTheme: aiDraft});
        aiDraft = null;
        aiMessage = 'Тема применена и сохранена локально';
        break;
      case 'discard-ai':
        aiDraft = null;
        refreshAiPanel();
        return;
      case 'clear-ai':
        if (active()) return;
        state.config = normalizeConfig({...state.config, aiTheme: undefined});
        break;
      case 'import-variant':
        if (!active() && !aiBusy)
          query<HTMLInputElement>('#variant-import').click();
        return;
      case 'csv-source':
        csvSource = Number(target.dataset.source);
        csvPage = 0;
        query('.csv-preview').outerHTML = datasetInfo(
          generateDataset(state.config),
        );
        query(`[data-action="csv-source"][data-source="${csvSource}"]`).focus({
          preventScroll: true,
        });
        return;
      case 'csv-prev':
      case 'csv-next': {
        const scroll = query('.csv-scroll');
        const left = scroll.scrollLeft;
        csvPage += target.dataset.action === 'csv-next' ? 1 : -1;
        query('.csv-preview').outerHTML = datasetInfo(
          generateDataset(state.config),
        );
        query('.csv-scroll').scrollLeft = left;
        const nextFocus = query<HTMLButtonElement>(
          `[data-action="${target.dataset.action}"]`,
        );
        (nextFocus.disabled ? query('.csv-scroll') : nextFocus).focus({
          preventScroll: true,
        });
        return;
      }
      case 'domain':
        if (active()) {
          state.view = 'practice';
          break;
        }
        state.config = normalizeConfig({
          ...state.config,
          domain: target.dataset.domain,
          aiTheme: undefined,
        });
        state.view = 'generator';
        break;
      case 'random-seed':
        if (target.closest('form')!.id === 'generator-form') {
          applyGenerator(true);
          return;
        }
        query<HTMLInputElement>('[name=seed]', target.closest('form')!).value =
          freshSeed();
        return;
      case 'open-variant':
        applyGenerator(false);
        return;
      case 'export':
      case 'download':
        target.disabled = true;
        try {
          await exportCurrent(target.dataset.file);
        } finally {
          target.disabled = false;
        }
        return;
      case 'answer': {
        const quiz = state.quiz;
        if (!quiz || quiz.completed || quiz.pending) return;
        const q = quiz.questions[quiz.answers.length];
        quiz.pending = {
          choice: Number(target.dataset.choice),
          correct: Number(target.dataset.choice) === q.correct,
          hint: !!quiz.hint,
        };
        break;
      }
      case 'hint':
        if (state.quiz) state.quiz.hint = true;
        break;
      case 'next-question': {
        const quiz = state.quiz;
        if (!quiz?.pending || quiz.completed) return;
        quiz.answers.push(quiz.pending);
        quiz.pending = null;
        quiz.hint = false;
        if (quiz.answers.length === quiz.questions.length) {
          quiz.completed = true;
          state.quizHistory.push({
            time: Date.now(),
            topic: quiz.topic,
            correct: quiz.answers.filter(a => a.correct).length,
            total: quiz.questions.length,
            hints: quiz.answers.filter(a => a.hint).length,
          });
        }
        break;
      }
      case 'new-quiz':
        state.quiz = null;
        break;
      case 'view-generator':
        state.view = 'generator';
        break;
      case 'finish':
        query<HTMLDialogElement>('#confirm-dialog').showModal();
        return;
      case 'cancel-finish':
        query<HTMLDialogElement>('#confirm-dialog').close();
        return;
      case 'confirm-finish':
        complete();
        return;
      case 'new-session':
        state.session = null;
        state.config.seed = freshSeed();
        break;
      case 'open-report':
        if (active()) {
          toast('Сначала заверши текущую попытку.');
          return;
        }
        state.session = structuredClone(
          state.history.find(s => s.id === target.dataset.id) ?? null,
        );
        state.view = 'practice';
        break;
      default:
        return;
    }
    save();
    render();
  } catch (error) {
    toast(errorMessage(error), true);
  }
});

function applyGenerator(randomize: boolean) {
  if (active()) {
    toast('Сначала заверши текущую попытку.');
    return;
  }
  const form = query<HTMLFormElement>('#generator-form');
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  state.config = randomize
    ? newVariant(formConfig(values), state.config, freshSeed)
    : formConfig(values);
  state.delimiter = String(values.delimiter);
  save();
  render();
  toast(
    randomize
      ? 'Новый вариант готов. Данные и условия обновлены.'
      : 'Вариант открыт по коду.',
  );
}

function formConfig(values: Record<string, FormDataEntryValue>) {
  return normalizeConfig({
    ...values,
    aiTheme:
      values.domain === state.config.domain && values.generatorVersion === '2'
        ? state.config.aiTheme
        : undefined,
  });
}

document.addEventListener('change', async event => {
  const input = event.target;
  if (
    input instanceof HTMLInputElement &&
    input.matches('#normalization-form [name=files]')
  ) {
    updateNormalizationFiles(input);
    return;
  }
  if (
    !(input instanceof HTMLInputElement) ||
    input.id !== 'variant-import' ||
    active() ||
    aiBusy
  )
    return;
  try {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 48_000) throw new Error('Файл параметров слишком большой');
    const parsed: unknown = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Неверный файл параметров');
    const value = parsed as Record<string, unknown>;
    const config = normalizeConfig({
      ...value,
      generatorVersion: value.generatorVersion ?? 1,
    });
    if (value.delimiter !== ';' && value.delimiter !== ',')
      throw new Error('Неверный разделитель CSV');
    if (active() || aiBusy) return;
    state.config = config;
    state.delimiter = value.delimiter;
    aiDraft = null;
    save();
    render();
    toast('Вариант восстановлен из файла');
  } catch (error) {
    toast(errorMessage(error), true);
  }
});

document.addEventListener('change', event => {
  if (!(event.target instanceof HTMLSelectElement)) return;
  const form = event.target.closest<HTMLFormElement>('#generator-form');
  if (!form || event.target.name !== 'domain') return;
  if (active()) {
    render();
    toast('Сначала заверши текущую попытку.');
    return;
  }
  const previousDomain = state.config.domain;
  try {
    if (!form.reportValidity()) {
      event.target.value = previousDomain;
      return;
    }
    applyGenerator(true);
    query('#generator-form [data-select-name=domain]').focus({
      preventScroll: true,
    });
  } catch (error) {
    event.target.value = previousDomain;
    toast(errorMessage(error), true);
  }
});

document.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (active()) {
      toast('Сначала заверши текущую попытку.');
      return;
    }
    const values = Object.fromEntries(new FormData(form));
    if (form.id === 'normalization-form') {
      const config =
        state.view === 'practice' && state.session
          ? state.session.config
          : state.config;
      void checkNormalizationForm(form, generateDataset(config));
      return;
    }
    if (form.id === 'ai-form') {
      aiTopic = String(values.topic ?? '');
      void proposeTheme();
      return;
    }
    if (form.id === 'generator-form') {
      applyGenerator(true);
    }
    if (form.id === 'quiz-form') {
      state.quiz = {
        questions: makeQuiz(freshSeed(), String(values.topic)),
        topic: String(values.topic),
        answers: [],
        pending: null,
        hint: false,
        completed: false,
      };
      save();
      render();
    }
    if (form.id === 'practice-form') {
      const config = formConfig(values);
      state.session = startSession(config, Number(values.minutes));
      state.config = config;
      save();
      render();
    }
  } catch (error) {
    toast(errorMessage(error), true);
  }
});

document.addEventListener('input', event => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.id === 'ai-topic') {
    aiTopic = event.target.value;
    return;
  }
  if (!active()) return;
  if (Date.now() >= state.session!.deadline) {
    complete();
    return;
  }
  if (event.target.dataset.answer) {
    state.session!.answers[event.target.dataset.answer] =
      event.target.value.slice(0, 20);
    save();
  }
  if (event.target.dataset.check !== undefined) {
    const value = Number(event.target.dataset.check);
    state.session!.checks = event.target.checked
      ? [...new Set([...state.session!.checks, value])]
      : state.session!.checks.filter(i => i !== value);
    save();
  }
});
window.addEventListener('hashchange', () => {
  if (location.hash === '#home') {
    state.view = 'home';
    save();
    render();
  }
});
setInterval(() => {
  if (!active()) return;
  const remaining = remainingMs(state.session);
  if (!remaining) {
    complete();
    return;
  }
  document.querySelectorAll<HTMLElement>('[data-clock]').forEach(el => {
    el.textContent = formatTime(remaining);
  });
  document
    .querySelectorAll<HTMLProgressElement>('[data-time-progress]')
    .forEach(el => {
      el.value = remaining;
    });
}, 250);
if (active() && !remainingMs(state.session)) complete();
else render();
