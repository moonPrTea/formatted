const {app, dialog, BrowserWindow, ipcMain, nativeTheme} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {setup, createWindow} = require('../build/electron/main.js');

async function run() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forma-desktop-test-'));
  await fs.mkdir(path.join(dir, 'profile', 'Shared Dictionary', 'cache'), {
    recursive: true,
  });
  app.setPath('userData', path.join(dir, 'profile'));
  await app.whenReady();
  nativeTheme.themeSource = 'light';
  const {modelReply, themeFixture} = await import('./ai-fixture.js');
  const {AI_MODEL} = await import('../build/src/core/ai-theme.js');
  const aiRequests = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(url.startsWith('http://127.0.0.1:11434/api/'));
    aiRequests.push(url);
    let result = {models: [{name: AI_MODEL}]};
    if (url.endsWith('/api/pull')) result = {status: 'success'};
    if (url.endsWith('/api/chat')) {
      const body = JSON.parse(options.body);
      result = modelReply(JSON.parse(body.messages[1].content).base);
    }
    return new Response(JSON.stringify(result));
  };
  await setup();
  const calcRequests = [];
  const workRequests = [];
  ipcMain.removeHandler('calc-work');
  ipcMain.handle('calc-work', (_event, step, action) => {
    workRequests.push([step, action]);
    return {
      ready: true,
      passed: action === 'check',
      message:
        action === 'check'
          ? 'Шаг проверен по сохранённой книге (тест)'
          : 'Открыта твоя рабочая книга (тест)',
    };
  });
  ipcMain.removeHandler('calc-status');
  ipcMain.handle('calc-status', () => ({
    ready: false,
    message: 'LibreOffice Calc не найден (тест)',
  }));
  ipcMain.removeHandler('calc-lesson');
  ipcMain.handle('calc-lesson', (_event, step) => {
    calcRequests.push(step);
    return {
      ready: true,
      message: 'Учебная копия передана Calc (тест)',
      directory: '/test/calc-lessons/step-5',
    };
  });
  const window = createWindow();
  window.webContents.setBackgroundThrottling(false);
  const errors = [];
  window.webContents.on('console-message', event => {
    if (event.level === 'error') {
      errors.push(event.message);
      console.error('Renderer:', event.message);
    }
  });
  await new Promise(resolve =>
    window.webContents.once('did-finish-load', resolve),
  );
  const evaluate = async source => {
    try {
      return await window.webContents.executeJavaScript(source);
    } catch (error) {
      throw new Error(
        `Evaluation failed: ${source}\n${error.message}\nRenderer errors: ${errors.join('; ')}`,
      );
    }
  };
  const click = async selector => {
    await evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
    await evaluate(`(() => {
      const section = document.querySelector(${JSON.stringify(selector)}).closest('[data-section]');
      section?.closest('[data-workspace]')
        ?.querySelector('[role=tab][data-ui-value="' + section.dataset.section + '"]')?.click();
    })()`);
    await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
    return evaluate(
      `document.querySelector(${JSON.stringify(selector)}).click()`,
    );
  };
  const text = selector =>
    evaluate(
      `document.querySelector(${JSON.stringify(selector)}).textContent.replace(/\\s+/g, ' ').trim()`,
    );
  const capture = async name => {
    await evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
    await new Promise(resolve => setTimeout(resolve, 200));
    await fs.writeFile(
      path.join(dir, `${name}.png`),
      (await window.webContents.capturePage()).toPNG(),
    );
  };

  assert.match(await text('h1'), /Главная/);
  assert.match(await text('.wordmark'), /formatted/);
  assert.match(await evaluate('document.title'), /^formatted/);
  assert.equal(await text('h1'), 'Главная');
  assert.equal(
    await evaluate(
      '[...document.querySelectorAll(".page-heading p, .sidebar-note p, .main-footer span")].some(el => el.textContent.trim().endsWith("."))',
    ),
    false,
  );
  assert.equal(await evaluate('typeof require'), 'undefined');
  assert.equal(
    await evaluate('typeof window.desktop.exportDataset'),
    'function',
  );
  assert.equal(
    await evaluate('getComputedStyle(document.documentElement).colorScheme'),
    'light',
  );
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector(".dashboard-modules .card")).backgroundImage',
    ),
    'none',
  );
  assert.equal(await evaluate('document.querySelector(".orbital")'), null);
  await capture('home');
  assert.match(await text('.window-title'), /formatted/);
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector(".window-bar")).webkitAppRegion',
    ),
    'drag',
  );
  await click('[data-action="toggle-sidebar"]');
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector(".sidebar")).display',
    ),
    'none',
  );
  await click('[data-action="toggle-sidebar"]');
  await click('[data-view="lesson"]');
  assert.match(await text('h1'), /От CSV к внешнему ключу/);
  assert.equal(
    await evaluate('document.querySelectorAll(".lesson-step").length'),
    7,
  );
  await click('[data-action="nav-back"]');
  assert.match(await text('h1'), /Главная/);
  await click('[data-action="nav-forward"]');
  assert.match(await text('h1'), /От CSV к внешнему ключу/);
  await click('[data-action="lesson-step"][data-step="4"]');
  assert.match(await text('.lesson-formula'), /ИНДЕКС.*ПОИСКПОЗ/);
  await click('[data-action="lesson-answer"][data-answer="1"]');
  assert.match(await text('.lesson-question'), /Пока нет/);
  await click('[data-action="lesson-answer"][data-answer="0"]');
  assert.match(await text('.lesson-question'), /Верно/);
  await capture('calc-lesson');
  assert.equal(await evaluate('document.querySelector(".calc-launch")'), null);
  await click('[data-view="workbook"]');
  assert.equal(
    await evaluate('document.querySelectorAll(".workbook-panel").length'),
    3,
  );
  for (const width of [1440, 1000, 900]) {
    window.setContentSize(width, 900);
    await evaluate(
      `document.querySelector('.calc-launch').scrollIntoView({block:'start'});`,
    );
    await capture(`calc-options-${width}`);
    assert.equal(
      await evaluate(
        `document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.workbook-panel')].filter(e => e.checkVisibility()).every(e => getComputedStyle(e).gap === '16px' && e.scrollWidth <= e.clientWidth)`,
      ),
      true,
    );
  }
  window.setContentSize(1440, 960);
  await click('[data-action="open-calc"]');
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 3000;
    const poll = () => {
      if (!document.querySelector('[data-action="open-calc"]').disabled) return resolve();
      if (Date.now() > deadline) return reject(new Error('Calc launch did not return'));
      setTimeout(poll, 20);
    }; poll();
  })`);
  assert.deepEqual(calcRequests, [4]);
  assert.match(await text('.calc-status'), /Учебная копия передана/);
  for (const action of ['calc-work', 'calc-check-work']) {
    await click(`[data-action="${action}"]`);
    await evaluate(`new Promise((resolve, reject) => {
      const deadline = Date.now() + 3000;
      const poll = () => {
        if (!document.querySelector('[data-action="calc-work"]').disabled) return resolve();
        if (Date.now() > deadline) return reject(new Error('Work check timed out'));
        setTimeout(poll, 20);
      }; poll();
    })`);
  }
  assert.deepEqual(workRequests, [
    [4, 'work'],
    [4, 'check'],
  ]);
  assert.match(await text('.calc-status'), /Шаг проверен/);
  await click('[data-view="home"]');

  await click('[data-view="quiz"]');
  await click('[data-select-name="topic"]');
  assert.equal(
    await evaluate('document.querySelectorAll(".select-menu").length'),
    1,
  );
  await evaluate(
    'document.querySelector("[data-select-name=topic]").dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true}))',
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".select-menu").length'),
    0,
  );
  await click('[data-select-name="topic"]');
  await evaluate(
    '[...document.querySelectorAll(".select-option")].find(el => el.textContent.startsWith("Формулы Calc")).click()',
  );
  await evaluate('document.querySelector("#quiz-form").requestSubmit()');
  assert.equal(
    await evaluate('JSON.parse(localStorage.getItem("forma.v1")).quiz.topic'),
    'Формулы Calc',
  );
  assert.equal(
    await evaluate(
      'new Set(JSON.parse(localStorage.getItem("forma.v1")).quiz.questions.map(q => q.skill)).size',
    ),
    4,
  );
  await capture('quiz');
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector(".answer")).borderTopWidth',
    ),
    '0px',
  );
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector(".answer")).backgroundColor',
    ),
    await evaluate(
      `(() => { const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--soft)'; document.body.append(probe); const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color; })()`,
    ),
  );
  window.setSize(900, 800);
  await capture('quiz-formulas-900');
  await click('[data-action="hint"]');
  assert.ok((await text('.hint-box')).length > 20);
  assert.equal(await evaluate('document.querySelector(".feedback")'), null);
  for (let i = 0; i < 8; i++) {
    assert.ok(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      'Formula round fits the window',
    );
    assert.ok(
      await evaluate(
        'document.querySelector(".quiz-card h2").scrollWidth <= document.querySelector(".quiz-card h2").clientWidth',
      ),
      'Long formula wraps within the question',
    );
    // Correct choices are read from local test state only, never rendered before answering.
    const choice = await evaluate(
      'JSON.parse(localStorage.getItem("forma.v1")).quiz.questions[' +
        i +
        '].correct',
    );
    await click(`[data-choice="${choice}"]`);
    assert.match(await text('.feedback'), /Верно/);
    if (i === 0) await capture('quiz-formula-explanation');
    await click('[data-action="next-question"]');
  }
  assert.match(await text('h1'), /Блиц завершён/);
  window.setSize(1440, 960);
  assert.equal(
    await evaluate(
      'JSON.parse(localStorage.getItem("forma.v1")).quizHistory.length',
    ),
    1,
  );
  await click('[data-view="generator"]');
  await click('[data-ui-value="schema"]');
  for (const width of [1440, 1000, 900]) {
    window.setContentSize(width, 960);
    await evaluate(
      `document.querySelector('.normalization-panel').scrollIntoView({block:'start'}); document.querySelector('#normalization-form input').focus({preventScroll:true});`,
    );
    await capture(`upload-${width}`);
    assert.equal(
      await evaluate(`(() => {
      const form = document.querySelector('#normalization-form');
      const picker = form.querySelector('.file-picker');
      const button = form.querySelector('button[type=submit]');
      const label = form.querySelector('.file-picker-button');
      const select = form.querySelector('.select-trigger');
      return document.documentElement.scrollWidth <= innerWidth && picker.scrollWidth <= picker.clientWidth && label.getBoundingClientRect().height <= picker.clientHeight && button.getBoundingClientRect().width < 300 && picker.getBoundingClientRect().height === select.getBoundingClientRect().height;
    })()`),
      true,
    );
  }
  window.setContentSize(1440, 960);
  assert.equal(await text('[data-file-summary]'), 'Файлы не выбраны');
  await evaluate(`(async () => {
    const {normalizationModel} = await import('./core/normalization-model.js');
    const {generateDataset} = await import('./core/generator.js');
    const {toCsv} = await import('./core/csv.js');
    const data = generateDataset(JSON.parse(localStorage.getItem('forma.v1')).config);
    const model = normalizationModel(data);
    const transfer = new DataTransfer();
    const schema = model.map(table => {
      const primaryKey = table.name === 'lines' ? ['order_id', 'line_no'] : table.name === 'bookAuthors' ? ['book_code', 'author_code'] : [table.fields[0]];
      transfer.items.add(new File([toCsv(table.fields, table.rows)], table.name + '.csv', {type: 'text/csv'}));
      return {entity: table.name, file: table.name + '.csv', primaryKey, columns: Object.fromEntries(table.fields.map(f => [f,f])), references: table.parents.map(name => ({table: name, columns: [table.name === 'cohorts' && name === 'users' ? 'teacher_code' : model.find(t => t.name === name).fields[0]]}))};
    });
    transfer.items.add(new File([JSON.stringify(schema)], 'schema.json', {type: 'application/json'}));
    const form = document.querySelector('#normalization-form');
    form.elements.namedItem('files').files = transfer.files;
    form.elements.namedItem('files').dispatchEvent(new Event('change', {bubbles: true}));
    form.requestSubmit();
  })()`);
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      if (document.querySelector('.normalization-result').textContent.includes('Проверено 12 таблиц')) return resolve();
      if (Date.now() > deadline) return reject(new Error(document.querySelector('.normalization-result').textContent));
      setTimeout(poll, 20);
    }; poll();
  })`);
  await evaluate(
    "document.querySelector('.normalization-panel').scrollIntoView()",
  );
  await capture('normalization');
  assert.equal(await text('[data-file-summary]'), 'Выбрано файлов: 13');
  await evaluate(
    `(() => {const input = document.querySelector('#normalization-form input'); input.value = ''; input.dispatchEvent(new Event('change', {bubbles:true}));})()`,
  );
  assert.equal(await text('[data-file-summary]'), 'Файлы не выбраны');
  assert.equal(await text('.normalization-result'), '');
  await click('.number-control [data-step="1"]');
  assert.equal(
    await evaluate('document.querySelector("[name=size]").value'),
    '61',
  );
  await click('.number-control [data-step="-1"]');
  assert.equal(
    await evaluate('document.querySelector("[name=size]").value'),
    '60',
  );
  for (const [value, direction] of [
    [20, -1],
    [500, 1],
  ]) {
    await evaluate(
      `{ const input = document.querySelector('[name=size]'); input.value = ${value}; input.dispatchEvent(new Event('input', {bubbles:true})); }`,
    );
    assert.equal(
      await evaluate(
        `document.querySelector('.number-control [data-step="${direction}"]').disabled`,
      ),
      true,
    );
    await click(`.number-control [data-step="${direction}"]`);
    assert.equal(
      await evaluate('document.querySelector("[name=size]").value'),
      String(value),
    );
  }
  await evaluate(
    '{ const input = document.querySelector("[name=size]"); input.value = ""; input.dispatchEvent(new Event("input", {bubbles:true})); }',
  );
  await click('.number-control [data-step="1"]');
  assert.equal(
    await evaluate('document.querySelector("[name=size]").value'),
    '20',
  );
  await evaluate(
    'document.querySelector("[name=domain]").value = "library"; document.querySelector("[name=size]").value = "80"; document.querySelector("[name=difficulty]").value = "medium"; document.querySelector("#generator-form").requestSubmit()',
  );
  assert.match(await text('.dataset-summary'), /Библиотека/);
  assert.equal(
    await evaluate(
      'document.querySelectorAll("[data-action=csv-source]").length',
    ),
    3,
  );
  assert.match(await text('.dataset-title'), /24 строк/);
  await click('[data-action="csv-source"][data-source="1"]');
  assert.match(await text('.data-table thead'), /user_code/);
  assert.match(await text('.dataset-title'), /users.csv/);
  await click('[data-action="csv-source"][data-source="2"]');
  assert.match(await text('.dataset-title'), /80 строк/);
  const firstVariant = await evaluate(
    'JSON.parse(localStorage.getItem("forma.v1")).config',
  );
  const firstConditions = await evaluate(
    '[...document.querySelectorAll(".task-line p")].map(el => el.textContent)',
  );
  await evaluate('document.querySelector("#generator-form").requestSubmit()');
  assert.notEqual(
    await evaluate('JSON.parse(localStorage.getItem("forma.v1")).config.seed'),
    firstVariant.seed,
  );
  const nextConditions = await evaluate(
    '[...document.querySelectorAll(".task-line p")].map(el => el.textContent)',
  );
  nextConditions.forEach((text, index) =>
    assert.notEqual(text, firstConditions[index]),
  );
  await evaluate(
    `document.querySelector('[name=seed]').value = ${JSON.stringify(firstVariant.seed)}`,
  );
  await click('[data-action="open-variant"]');
  assert.deepEqual(
    await evaluate(
      '[...document.querySelectorAll(".task-line p")].map(el => el.textContent)',
    ),
    firstConditions,
  );
  await evaluate(
    '{ const domain = document.querySelector("[name=domain]"); domain.value="courses"; domain.dispatchEvent(new Event("change", {bubbles:true})); }',
  );
  assert.match(await text('.dataset-summary'), /Учебный центр/);
  assert.match(await text('.data-table thead'), /room_code/);
  assert.match(await text('.dataset-title'), /cohorts.csv/);
  await click('[data-action="csv-source"][data-source="2"]');
  assert.match(await text('.data-table thead'), /enrollment_id/);
  assert.doesNotMatch(await text('.data-table thead'), /loan_id/);
  assert.match(await text('.rules-panel'), /слушател/);
  await evaluate(
    '{ const domain = document.querySelector("[name=domain]"); domain.value="library"; domain.dispatchEvent(new Event("change", {bubbles:true})); }',
  );
  assert.match(await text('.dataset-summary'), /Библиотека/);
  assert.match(await text('.dataset-title'), /catalog.csv/);
  await click('[data-action="csv-source"][data-source="2"]');
  assert.match(await text('.data-table thead'), /loan_id/);
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector("[name=domain]")).outlineStyle',
    ),
    'none',
  );
  assert.equal(
    await evaluate(
      'document.querySelector(".wordmark img").getAttribute("src")',
    ),
    'assets/forma.svg',
  );
  await evaluate(
    'document.querySelector("[data-select-name=domain]").scrollIntoView({block:"center", behavior:"instant"})',
  );
  await evaluate(
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
  );
  await click('[data-select-name="domain"]');
  assert.equal(
    await evaluate(
      'document.querySelector("[data-select-name=domain]").getAttribute("aria-expanded")',
    ),
    'true',
  );
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector("[data-select-name=domain]")).outlineStyle',
    ),
    'none',
  );
  assert.equal(
    await evaluate(
      'document.querySelector(".select-option[aria-selected=true]").textContent',
    ),
    'Библиотека✓',
  );
  await capture('dropdown-open');
  await evaluate(
    '[...document.querySelectorAll(".select-option")].find(el => el.textContent.startsWith("Учебный центр")).click()',
  );
  assert.match(await text('.dataset-summary'), /Учебный центр/);
  assert.equal(
    await evaluate('document.querySelectorAll(".select-menu").length'),
    0,
  );
  await evaluate(
    '{ const trigger = document.querySelector("[data-select-name=domain]"); for (const key of ["ArrowDown", "Home", "ArrowDown", "Enter"]) trigger.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles:true})); }',
  );
  assert.match(await text('.dataset-summary'), /Библиотека/);
  assert.equal(
    await evaluate('document.activeElement.dataset.selectName'),
    'domain',
  );
  await click('[data-select-name="difficulty"]');
  await evaluate(
    'document.querySelector("h1").dispatchEvent(new PointerEvent("pointerdown", {bubbles:true}))',
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".select-menu").length'),
    0,
  );
  await click('[data-select-name="delimiter"]');
  await evaluate(
    '{ const trigger = document.querySelector("[data-select-name=delimiter]"); trigger.dispatchEvent(new KeyboardEvent("keydown", {key:"Tab", bubbles:true})); }',
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".select-menu").length'),
    0,
  );
  assert.equal(
    await evaluate(
      'new FormData(document.querySelector("#generator-form")).get("domain")',
    ),
    'library',
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".data-table tbody .row-number").length',
    ),
    10,
  );
  assert.equal(await evaluate('/[—·]/.test(document.body.innerText)'), false);
  await click('[data-action="csv-source"][data-source="2"]');
  assert.match(await text('.table-foot'), /Строки 1-10 из 80/);
  await evaluate(
    'document.querySelector("[name=seed]").value = "UNSAVED-DRAFT"',
  );
  await click('[data-action="csv-next"]');
  assert.match(await text('.table-foot'), /Строки 11-20 из 80/);
  assert.equal(
    await evaluate('document.querySelector("[name=seed]").value'),
    'UNSAVED-DRAFT',
  );
  assert.equal(await text('.data-table tbody .row-number'), '11');
  for (let i = 0; i < 6; i++) await click('[data-action="csv-next"]');
  assert.match(await text('.table-foot'), /Строки 71-80 из 80/);
  assert.equal(
    await evaluate('document.querySelector("[data-action=csv-next]").disabled'),
    true,
  );
  for (let i = 0; i < 7; i++) await click('[data-action="csv-prev"]');
  assert.equal(
    await evaluate('document.querySelector("[data-action=csv-prev]").disabled'),
    true,
  );
  await evaluate(
    'document.querySelector("[name=seed]").value = JSON.parse(localStorage.getItem("forma.v1")).config.seed',
  );
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector(".data-table th")).position',
    ),
    'sticky',
  );
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector(".dataset-panel")).backgroundColor',
    ),
    await evaluate(
      `(() => {const probe=document.createElement('span'); probe.style.backgroundColor='var(--panel)'; document.body.append(probe); const color=getComputedStyle(probe).backgroundColor; probe.remove(); return color;})()`,
    ),
  );
  await capture('generator');
  await click('[data-ui-value="variant"]');
  for (const [width, height] of [
    [1280, 800],
    [1000, 720],
    [900, 700],
  ]) {
    window.setSize(width, height);
    await capture(`generator-${width}`);
    assert.ok(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      `No page overflow at ${width}px`,
    );
    assert.ok(
      await evaluate(
        'document.querySelector("#generator-form button[type=submit]").getBoundingClientRect().bottom < innerHeight',
      ),
      `Generate button visible at ${width}px`,
    );
    const fieldLayout = await evaluate(
      'Object.fromEntries(["domain", "size", "difficulty", "seed", "delimiter"].map(name => { const r = document.querySelector(`[data-select-name="${name}"], input[name="${name}"]`).getBoundingClientRect(); return [name, {top:r.top, height:r.height}]; }))',
    );
    assert.equal(
      fieldLayout.domain.top,
      fieldLayout.size.top,
      `First row fields align at ${width}px`,
    );
    assert.ok(
      Object.values(fieldLayout).every(r => r.height === 44),
      `Inputs share a 44px height at ${width}px`,
    );
  }
  window.setSize(1440, 960);
  await click('[data-ui-value="data"]');
  await evaluate(
    'document.querySelector(".dataset-panel").scrollIntoView({block:"start"})',
  );
  await capture('csv-preview');
  await evaluate('window.scrollTo(0, 0)');

  // Exercise the real isolated IPC exporter with a controlled native directory chooser.
  dialog.showOpenDialog = async () => ({canceled: false, filePaths: [dir]});
  const result = await evaluate(
    'window.desktop.exportDataset(JSON.parse(localStorage.getItem("forma.v1")).config, ";")',
  );
  const exported = await fs.readFile(
    path.join(result.directory, 'loans.csv'),
    'utf8',
  );
  assert.match(exported, /loan_id/);
  assert.equal(result.count, 5);
  assert.deepEqual((await fs.readdir(result.directory)).sort(), [
    'assignment.md',
    'catalog.csv',
    'loans.csv',
    'users.csv',
    'variant.json',
  ]);
  assert.match(
    await fs.readFile(path.join(result.directory, 'assignment.md'), 'utf8'),
    /Выборки/,
  );
  await click('[data-view="practice"]');
  await click('[name=minutes] ~ [data-step="1"]');
  assert.equal(
    await evaluate('document.querySelector("[name=minutes]").value'),
    '46',
  );
  await click('[name=minutes] ~ [data-step="-1"]');
  await capture('practice-setup');
  await evaluate('document.querySelector("#practice-form").requestSubmit()');
  assert.match(await text('h1'), /Библиотека/);
  await capture('practice');
  assert.equal(
    await evaluate('document.querySelector("#normalization-form")'),
    null,
  );
  await evaluate(
    'const input = document.querySelector("[data-answer=filter]"); input.value = "123"; input.dispatchEvent(new Event("input", {bubbles:true})); document.querySelector("[data-check]").click()',
  );
  let reload = new Promise(resolve =>
    window.webContents.once('did-finish-load', resolve),
  );
  await evaluate('location.reload()');
  await reload;
  assert.equal(
    await evaluate('document.querySelector("[data-answer=filter]").value'),
    '123',
  );
  assert.equal(
    await evaluate('document.querySelector("[data-check]").checked'),
    true,
  );
  assert.ok(
    await evaluate(
      'document.querySelector("[data-clock]").textContent !== "45:00" || JSON.parse(localStorage.getItem("forma.v1")).session.startedAt > Date.now()-1000',
    ),
  );
  await click('[data-view="quiz"]');
  assert.match(await text('h1'), /Библиотека/);
  await click('[data-view="lesson"]');
  assert.match(await text('h1'), /Библиотека/);
  await click('[data-action="finish"]');
  await click('[data-action="confirm-finish"]');
  assert.match(await text('h1'), /Попытка завершена/);
  assert.equal(
    await evaluate(
      'JSON.parse(localStorage.getItem("forma.v1")).history.length',
    ),
    1,
  );
  await click('[data-action="new-session"]');
  await evaluate('document.querySelector("#practice-form").requestSubmit()');
  reload = new Promise(resolve =>
    window.webContents.once('did-finish-load', resolve),
  );
  await evaluate(
    'const state = JSON.parse(localStorage.getItem("forma.v1")); state.session.deadline = Date.now()-1; state.session.startedAt = state.session.deadline-45*60000; localStorage.setItem("forma.v1", JSON.stringify(state)); location.reload()',
  );
  await reload;
  assert.match(await text('h1'), /Время вышло/);
  await click('[data-view="history"]');
  assert.match(await text('h1'), /Твой прогресс/);
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector(".achievement")).borderTopWidth',
    ),
    '0px',
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".achievement progress").length'),
    4,
  );
  assert.equal(
    await evaluate('document.querySelector(".achievement progress").value'),
    1,
  );
  await capture('history');
  assert.deepEqual(
    await evaluate(`(() => {
      const link = document.querySelector('.history-link');
      const style = getComputedStyle(link);
      return [style.backgroundColor, style.padding,
        link.getBoundingClientRect().left === link.nextElementSibling.getBoundingClientRect().left];
    })()`),
    ['rgba(0, 0, 0, 0)', '0px', true],
  );
  await evaluate("document.querySelector('.history-link').focus()");
  await capture('history-link-focus');
  await click('.history-link');
  assert.match(await text('h1'), /Время вышло|Попытка завершена/);

  await click('[data-view="generator"]');
  const waitForAi = () =>
    evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      if (!document.querySelector('#ai-form button[type=submit]').disabled) return resolve();
      if (Date.now() > deadline) return reject(new Error('AI did not finish'));
      setTimeout(poll, 20);
    };
    poll();
  })`);
  assert.equal(aiRequests.length, 0);
  const originalMessageBox = dialog.showMessageBox;
  dialog.showMessageBox = async () => ({response: 0});
  await click('[data-action="download-ai"]');
  await waitForAi();
  assert.equal(aiRequests.length, 0);
  assert.match(await text('.ai-status'), /не начата/);
  dialog.showMessageBox = async () => ({response: 1});
  await click('[data-action="download-ai"]');
  await waitForAi();
  assert.match(await text('.ai-status'), /доступна локально/);
  assert.equal(aiRequests.filter(url => url.endsWith('/api/pull')).length, 1);
  dialog.showMessageBox = originalMessageBox;

  await evaluate(`document.querySelector('#ai-topic').value = 'Библиотека книг о космосе';
    document.querySelector('#ai-form').requestSubmit()`);
  await waitForAi();
  assert.match(await text('.ai-draft'), /Учебная мастерская/);
  assert.equal(
    await evaluate(
      'JSON.parse(localStorage.getItem("forma.v1")).config.aiTheme',
    ),
    undefined,
  );
  await click('[data-action="show-ai"]');
  await evaluate(
    'document.querySelector("#ai-panel").scrollIntoView({behavior: "instant", block: "start"})',
  );
  await capture('ai-draft');
  await evaluate(
    `document.querySelector('#ai-draft-form [name=description]').value = 'Учебная мастерская проверяет учёт товаров. Описание исправлено пользователем'`,
  );
  await click('[data-action="apply-ai"]');
  assert.match(
    await evaluate(
      'JSON.parse(localStorage.getItem("forma.v1")).config.aiTheme.description',
    ),
    /исправлено пользователем/,
  );
  assert.match(await text('.csv-preview'), /Учебная мастерская/);
  const aiConfig = await evaluate(
    'JSON.parse(localStorage.getItem("forma.v1")).config',
  );
  assert.deepEqual(aiConfig.aiTheme, {
    ...themeFixture(aiConfig.domain),
    description:
      'Учебная мастерская проверяет учёт товаров. Описание исправлено пользователем',
  });
  reload = new Promise(resolve =>
    window.webContents.once('did-finish-load', resolve),
  );
  await evaluate('location.reload()');
  await reload;
  assert.match(await text('.csv-preview'), /Учебная мастерская/);
  await click('[data-action="clear-ai"]');
  assert.equal(
    await evaluate(
      'JSON.parse(localStorage.getItem("forma.v1")).config.aiTheme',
    ),
    undefined,
  );
  const metadata = {...aiConfig, delimiter: ';'};
  await evaluate(`(() => {
    const file = new File([${JSON.stringify(JSON.stringify(metadata))}], 'variant.json', {type: 'application/json'});
    const transfer = new DataTransfer(); transfer.items.add(file);
    const input = document.querySelector('#variant-import'); input.files = transfer.files;
    input.dispatchEvent(new Event('change', {bubbles: true}));
  })()`);
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      if (JSON.parse(localStorage.getItem('forma.v1')).config.aiTheme) return resolve();
      if (Date.now() > deadline) return reject(new Error('Variant import failed'));
      setTimeout(poll, 20);
    };
    poll();
  })`);
  assert.match(await text('.csv-preview'), /Учебная мастерская/);
  await click('[data-view="home"]');
  await click('[data-action="domain"][data-domain="retail"]');
  assert.equal(
    await evaluate(
      'JSON.parse(localStorage.getItem("forma.v1")).config.aiTheme',
    ),
    undefined,
  );
  assert.equal(aiRequests.filter(url => url.endsWith('/api/chat')).length, 1);
  const preview = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await preview.loadFile(path.resolve(__dirname, '../build/src/index.html'));
  assert.match(
    await preview.webContents.executeJavaScript(
      'document.querySelector("h1").textContent',
    ),
    /Главная/,
  );
  assert.equal(
    await preview.webContents.executeJavaScript('typeof window.desktop'),
    'undefined',
  );
  await preview.webContents.executeJavaScript(
    'document.querySelector("[data-view=generator]").click()',
  );
  assert.deepEqual(
    await preview.webContents.executeJavaScript(
      '[...document.querySelectorAll("[data-file]")].map(button => button.dataset.file)',
    ),
    [
      'catalog.csv',
      'users.csv',
      'orders.csv',
      'locations.csv',
      'assignment.md',
      'variant.json',
    ],
  );
  assert.match(
    await preview.webContents.executeJavaScript(
      'document.querySelector("#ai-panel").textContent',
    ),
    /подключение к модели отключено/,
  );
  await preview.webContents.executeJavaScript(
    'document.querySelector("[data-view=workbook]").click()',
  );
  assert.match(
    await preview.webContents.executeJavaScript(
      'document.querySelector(".calc-launch").textContent',
    ),
    /не в браузерном превью/,
  );
  assert.equal(
    await preview.webContents.executeJavaScript(
      'document.querySelector("[data-action=open-calc]")',
    ),
    null,
  );
  preview.destroy();
  assert.deepEqual(errors, []);
  console.log(
    `Desktop smoke test passed. Screenshots and test exports: ${dir}`,
  );
  app.quit();
}
run().catch(error => {
  console.error(error);
  app.exit(1);
});
