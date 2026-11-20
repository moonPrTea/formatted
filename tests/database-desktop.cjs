const {app} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {setup, createWindow} = require('../build/electron/main.js');

async function run() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'formatted-database-'),
  );
  app.setPath('userData', directory);
  app.setPath('sessionData', directory);
  await app.whenReady();
  await setup();
  const window = createWindow();
  const errors = [];
  window.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });
  const js = code => window.webContents.executeJavaScript(code);
  const wait = async condition => {
    const until = Date.now() + 10000;
    while (!(await condition())) {
      assert.ok(Date.now() < until);
      await new Promise(r => setTimeout(r, 25));
    }
  };
  const click = async selector => {
    await js(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const panel = element.closest('[role=tabpanel]');
      if (panel) document.getElementById(panel.getAttribute('aria-labelledby'))?.click();
    })()`);
    await js('new Promise(r => requestAnimationFrame(r))');
    await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await js('new Promise(r => requestAnimationFrame(r))');
  };
  await wait(() => js('!!document.querySelector("[data-view=database]")'));
  await click('[data-view=database]');
  assert.equal(
    await js('document.querySelectorAll("[data-db-step]").length'),
    6,
  );
  const sql = "SELECT '00101';\n-- </textarea><script>bad()</script>";
  await js(
    `(() => { const field = document.querySelector('#database-sql'); field.value = ${JSON.stringify(sql)}; field.dispatchEvent(new Event('input', {bubbles:true})); })()`,
  );
  await click('[name=db-answer][value="0"]');
  assert.ok(
    await js(
      'document.querySelector("#database-feedback").textContent.includes("Попробуй")',
    ),
  );
  await click('[name=db-answer][value="1"]');
  assert.ok(
    await js(
      'document.querySelector("#database-feedback").textContent.startsWith("Верно")',
    ),
  );
  await click('#database-next');
  await click('#database-prev');
  assert.equal(await js('document.querySelector("#database-sql").value'), sql);
  window.reload();
  await wait(() => js('!!document.querySelector("#database-sql")'));
  assert.equal(await js('document.querySelector("#database-sql").value'), sql);
  assert.equal(
    await js('document.querySelector("[name=db-answer]:checked").value'),
    '1',
  );
  const download = path.join(directory, 'lesson.sql');
  const downloaded = new Promise(resolve =>
    window.webContents.session.once('will-download', (_event, item) => {
      item.setSavePath(download);
      item.once('done', (_event, state) => resolve(state));
    }),
  );
  await click('#database-download');
  assert.equal(await downloaded, 'completed');
  assert.equal(await fs.readFile(download, 'utf8'), sql);
  for (const width of [1440, 1000, 900]) {
    window.setContentSize(width, 900);
    await js(
      'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
    );
    for (let i = 0; i < 6; i++) {
      await click(`[data-db-step="${i}"]`);
      assert.equal(
        await js('document.documentElement.scrollWidth <= innerWidth'),
        true,
      );
      assert.equal(
        await js(
          'document.querySelector("#database-sql").getBoundingClientRect().right <= innerWidth',
        ),
        true,
      );
    }
    await click('[data-db-step="0"]');
    assert.equal(
      await js(
        'getComputedStyle(document.querySelector("#database-content fieldset label")).flexDirection',
      ),
      'row',
    );
    if (width <= 1100)
      assert.ok(
        await js(
          'document.querySelector("#database-steps").getBoundingClientRect().height < 160',
        ),
        await js(
          `JSON.stringify({width:innerWidth, nav:getComputedStyle(document.querySelector('#database-steps')).display, height:document.querySelector('#database-steps').getBoundingClientRect().height, buttons:[...document.querySelectorAll('[data-db-step]')].map(e=>e.getBoundingClientRect().height)})`,
        ),
      );
    await js(
      'window.scrollTo(0, 0); document.querySelector("#main").scrollTo(0, 0)',
    );
    await js(
      'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
    );
    await fs.writeFile(
      path.join(directory, `database-${width}.png`),
      (await window.webContents.capturePage()).toPNG(),
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'Database steps, feedback, persisted SQL, safe rendering, downloads and 3 widths passed:',
    directory,
  );
  app.exit(0);
}
setTimeout(() => app.exit(1), 60000);
run().catch(error => {
  console.error(error);
  app.exit(1);
});
