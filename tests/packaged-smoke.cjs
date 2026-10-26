const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function run() {
  const {directory, executable} = JSON.parse(
    await fs.readFile('release/preview.json', 'utf8'),
  );
  const resources = path.join(
    directory,
    process.platform === 'darwin'
      ? 'formatted.app/Contents/Resources/app'
      : 'resources/app',
  );
  for (const file of [
    'build/electron/start.cjs',
    'build/src/index.html',
    'build/src/sheets/index.html',
    'build/desktop-tools/calc_lesson.py',
  ]) {
    await fs.access(path.join(resources, file));
  }
  for (const file of ['.git', '.tools', '.nuget', '.env', 'tests', 'src']) {
    await assert.rejects(fs.access(path.join(resources, file)), {
      code: 'ENOENT',
    });
  }
  const profile = await fs.mkdtemp(
    path.join(os.tmpdir(), 'formatted-package-'),
  );
  const child = spawn(
    executable,
    ['--user-data-dir=' + profile, '--remote-debugging-port=0'],
    {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {...process.env, ELECTRON_RUN_AS_NODE: undefined},
    },
  );
  let stderr = '';
  let spawnError;
  let socket;
  child.on('error', error => {
    spawnError = error;
  });
  child.stderr.on('data', chunk => {
    stderr = (stderr + chunk).slice(-16000);
  });
  const deadline = setTimeout(() => {
    console.error('Packaged smoke test exceeded 60 seconds');
    process.exitCode = 1;
    child.kill('SIGKILL');
  }, 60000);
  const wait = async predicate => {
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      const value = await predicate();
      if (value) return value;
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode) throw new Error(stderr);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Packaged app timed out: ' + stderr);
  };
  try {
    const endpoint = await wait(
      () => /DevTools listening on (ws:\/\/\S+)/.exec(stderr)?.[1],
    );
    const origin = new URL(endpoint).origin.replace('ws:', 'http:');
    const target = await wait(async () =>
      (await (await fetch(origin + '/json/list')).json()).find(
        item => item.url === 'forma://app/index.html',
      ),
    );
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, {once: true});
      socket.addEventListener('error', reject, {once: true});
    });
    let serial = 0;
    const pending = new Map();
    socket.addEventListener('close', () => {
      for (const entry of pending.values())
        entry.reject(new Error('Debugger disconnected'));
      pending.clear();
    });
    socket.addEventListener('message', event => {
      const response = JSON.parse(event.data);
      pending.get(response.id)?.resolve(response);
      pending.delete(response.id);
    });
    const evaluate = expression =>
      new Promise((resolve, reject) => {
        const id = ++serial;
        pending.set(id, {
          reject,
          resolve: response => {
            if (response.error || response.result.exceptionDetails)
              reject(new Error(JSON.stringify(response)));
            else resolve(response.result.result.value);
          },
        });
        socket.send(
          JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {expression, returnByValue: true},
          }),
        );
      });
    await wait(() =>
      evaluate(
        'document.readyState === "complete" && !!document.querySelector("[data-view=generator]")',
      ),
    );
    assert.equal(
      await evaluate('typeof window.desktop.openSheets'),
      'function',
    );
    await evaluate('document.querySelector("[data-view=generator]").click()');
    assert.equal(
      await evaluate(
        'document.querySelector("[name=difficulty]").options.length',
      ),
      3,
    );
    // Exercise the real packaged application's ordinary window-close/quit path.
    socket.send(JSON.stringify({id: ++serial, method: 'Page.close'}));
    await wait(() => child.exitCode !== null || child.signalCode);
    assert.equal(child.exitCode, 0);
    console.log(
      `Packaged launch, renderer, assets and clean exit passed: ${process.platform}/${process.arch}`,
    );
  } finally {
    clearTimeout(deadline);
    socket?.close();
    if (child.exitCode === null && !child.signalCode) child.kill();
  }
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
