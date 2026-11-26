import {html, errorMessage} from '../packages/ui/services/dom.js';
import {normalizationModel} from './core/normalization-model.js';
import {checkNormalization, parseSchema} from './core/normalization.js';
import type {Dataset} from '../packages/contracts/practice.js';

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    c =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[
        c
      ]!,
  );

export function normalizationView(data: Dataset) {
  if (data.version < 2) return '';
  return html`<section class="panel normalization-panel">
    <h2>Проверить свои таблицы</h2>
    <p>
      Вариант ${esc(data.config.seed)}: 12 CSV и schema.json с описанием схемы
    </p>
    <details>
      <summary>Как описать схему</summary>
      <p>
        schema.json содержит массив объектов. Для каждой таблицы укажи entity,
        file, primaryKey, columns и references
      </p>
      <ul>
        <li>entity: назначение таблицы из списка ниже</li>
        <li>file: имя твоего CSV, primaryKey: массив столбцов PK</li>
        <li>
          columns: соответствие «поле исходника»: «мой столбец». Собственные ID
          указывать здесь не нужно
        </li>
        <li>
          references: связи вида {"columns": ["мой_fk"], "table": "entity
          родителя"}. Столбцы идут в порядке PK родителя, без связей укажи []
        </li>
      </ul>
      <p>
        Назначения:
        ${normalizationModel(data)
          .map(r => esc(r.name))
          .join(', ')}
      </p>
      <pre><code>[{
  "entity": "cities",
  "file": "my_cities.csv",
  "primaryKey": ["id"],
  "columns": {"city": "name", "region": "region"},
  "references": []
}]</code></pre>
      <p class="small-note">
        Это пример одной таблицы, не готовая схема. Имена и ID выбираешь сам.
        Проверяются 12 учебных сущностей, их связи и данные; альтернативное
        разбиение и SQL-ограничения здесь не оцениваются
      </p>
    </details>
    <form id="normalization-form">
      <label class="normalization-files"
        >Таблицы и описание схемы<span class="file-picker"
          ><span class="file-picker-button">Выбрать файлы</span
          ><span data-file-summary aria-live="polite">Файлы не выбраны</span
          ><input
            name="files"
            type="file"
            accept=".csv,.json"
            multiple
            required /></span
      ></label>
      <label
        >Разделитель<select name="delimiter">
          <option value=";">Точка с запятой ;</option>
          <option value=",">Запятая ,</option>
        </select></label
      >
      <div class="normalization-actions">
        <button class="button primary" type="submit">Проверить файлы</button
        ><span class="small-note"
          >До 2 МБ на файл, обработка на устройстве</span
        >
      </div>
    </form>
    <div class="normalization-result" role="status" aria-live="polite"></div>
  </section>`;
}

export function updateNormalizationFiles(input: HTMLInputElement) {
  const output = input.closest('label')?.querySelector('[data-file-summary]');
  if (!output) return;
  const files = [...(input.files ?? [])];
  output.textContent = files.length
    ? `Выбрано файлов: ${files.length}`
    : 'Файлы не выбраны';
  output.setAttribute('title', files.map(file => file.name).join('\n'));
  input
    .closest('.normalization-panel')
    ?.querySelector('.normalization-result')
    ?.replaceChildren();
}

export async function checkNormalizationForm(
  form: HTMLFormElement,
  data: Dataset,
) {
  const output = form.parentElement!.querySelector('.normalization-result')!;
  const button = form.querySelector('button')!;
  button.disabled = true;
  try {
    const input = form.elements.namedItem('files') as HTMLInputElement;
    const files = [...(input.files ?? [])];
    if (
      files.length !== 13 ||
      new Set(files.map(f => f.name)).size !== 13 ||
      files.some(f => f.size > 2_000_000)
    )
      throw new Error('Выбери 12 CSV и schema.json, не больше 2 МБ на файл');
    const contents = Object.fromEntries(
      await Promise.all(files.map(async f => [f.name, await f.text()])),
    );
    if (!Object.hasOwn(contents, 'schema.json'))
      throw new Error('Не выбран schema.json');
    const schema = parseSchema(contents['schema.json']);
    const delimiter = (
      form.elements.namedItem('delimiter') as HTMLSelectElement
    ).value;
    const result = checkNormalization(data, schema, contents, delimiter);
    output.innerHTML = result.passed
      ? '<p>Проверено 12 таблиц: данные восстановлены, PK уникальны, FK существуют и связи соответствуют учебной модели</p>'
      : html`<p>Нужно исправить</p>
          <ul>
            ${result.issues.map(issue => html`<li>${esc(issue)}</li>`).join('')}
          </ul>`;
  } catch (error) {
    output.textContent = errorMessage(error);
  } finally {
    button.disabled = false;
  }
}
