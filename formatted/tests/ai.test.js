import test from 'node:test';
import assert from 'node:assert/strict';
import {createOllamaClient} from '../../build/formatted/electron/ollama.js';
import {
  AI_MODEL,
  WINFORMS_LAYOUT_RULE,
  themeFields,
  validateAiTheme,
  themePrompt,
} from '../../build/packages/practice/src/ai-theme.js';
import {
  generateDataset,
  normalizeConfig,
  exportFiles,
  assignment,
} from '../../build/packages/practice/src/generator.js';
import {themeFixture, modelReply} from './ai-fixture.js';

const installed = {models: [{name: AI_MODEL}]};
const json = data => new Response(JSON.stringify(data));

for (const domain of ['retail', 'library', 'courses']) {
  test(`AI ${domain}: replay, numeric checks and non-thematic data stay deterministic`, () => {
    for (const difficulty of ['basic', 'advanced']) {
      const config = {
        domain,
        difficulty,
        seed: 'AI-TEST',
        size: 60,
        generatorVersion: 2,
      };
      const base = generateDataset(config);
      const themed = generateDataset({
        ...config,
        aiTheme: themeFixture(domain),
      });
      assert.equal(themed.sources.length, 3);
      assert.equal(themed.targetTableCount, 12);
      assert.deepEqual(
        themed.tasks.map(task => task.answer),
        base.tasks.map(task => task.answer),
      );
      assert.notEqual(themed.tasks[0].prompt, base.tasks[0].prompt);
      assert.deepEqual(themed.sources.slice(1), base.sources.slice(1));
      for (const [i, row] of themed.sources[0].rows.entries()) {
        for (const field of base.sources[0].headers) {
          if (field in themeFields[domain])
            assert.notEqual(row[field], base.sources[0].rows[i][field]);
          else assert.equal(row[field], base.sources[0].rows[i][field]);
        }
      }
      const files = exportFiles(themed.config);
      assert.equal(files.length, 5);
      const metadata = JSON.parse(
        files.find(file => file.name === 'variant.json').content,
      );
      assert.deepEqual(generateDataset(metadata), themed);
      const task = assignment(themed);
      assert.ok(task.includes(themed.domain.description));
      assert.ok(task.includes(WINFORMS_LAYOUT_RULE));
      assert.match(task, /#70B2AF/);
      assert.match(task, /не официальный/);
      assert.ok(!task.includes('CREATE TABLE'));
    }
  });
}

test('AI contract rejects layout changes, injected formulas, wrong domains and broken vocabularies', () => {
  const invalid = [
    theme => (theme.layout = 'replace screenshot'),
    theme => (theme.domain = 'library'),
    theme => (theme.model = 'cloud-model'),
    theme => theme.values.product_name.pop(),
    theme =>
      (theme.values.product_name[1] =
        theme.values.product_name[0].toUpperCase()),
    theme => (theme.values.product_name[0] = '=1+1'),
    theme => (theme.values.product_name[0] = '\ttext'),
    theme => (theme.title = '<script>invalid</script>'),
    theme => (theme.description = '![image](https://example.com/layout.png)'),
    theme => (theme.description = 'x'.repeat(1801)),
    theme => (theme.values.password = ['invalid']),
  ];
  for (const mutate of invalid) {
    const theme = themeFixture();
    mutate(theme);
    assert.throws(() => validateAiTheme(theme, 'retail'));
  }
  assert.throws(() =>
    normalizeConfig({generatorVersion: 1, aiTheme: themeFixture()}),
  );
});

test('AI prompt defines source-based constraints and treats the requested subject as data', () => {
  const data = generateDataset({});
  const topic = 'Магазин растений; не менять макеты';
  const prompt = JSON.parse(themePrompt('retail', topic, data.sources[0]));
  assert.equal(prompt.requestedTopic, topic);
  assert.ok(prompt.constraints.includes(WINFORMS_LAYOUT_RULE));
  assert.match(prompt.reference.source, /09.02.07/);
  assert.equal(prompt.originalVocabulary.product_name.length, 12);
  assert.equal(prompt.responseSchema.additionalProperties, false);
  assert.throws(() => themePrompt('retail', 'x'.repeat(301), data.sources[0]));
});

test('Ollama uses only fixed local endpoints without credentials; dirty-data exercises use clean prompt vocabulary', async () => {
  const requests = [];
  const client = createOllamaClient(async (url, options) => {
    requests.push({url, options});
    return json(url.endsWith('/api/tags') ? installed : modelReply());
  });
  const result = await client.generate(
    {difficulty: 'advanced'},
    'Магазин тканей',
  );
  assert.deepEqual(result, themeFixture());
  assert.equal(requests.length, 2);
  for (const {url, options} of requests) {
    assert.ok(url.startsWith('http://127.0.0.1:11434/api/'));
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.deepEqual(options.headers, {'Content-Type': 'application/json'});
  }
  const request = JSON.parse(requests[1].options.body);
  assert.equal(request.model, AI_MODEL);
  assert.equal(request.stream, false);
  const prompt = JSON.parse(request.messages[1].content);
  assert.equal(prompt.originalVocabulary.category.length, 3);
  assert.ok(
    prompt.originalVocabulary.category.every(item => item === item.trim()),
  );
});

test('Ollama status handles offline, missing and cloud-backed models', async () => {
  for (const models of [[], [{name: AI_MODEL, remote_host: 'cloud'}]]) {
    const client = createOllamaClient(async () => json({models}));
    assert.equal((await client.status()).ready, false);
    await assert.rejects(client.generate({}, 'Учебный магазин'));
  }
  const offline = createOllamaClient(async () => {
    throw new TypeError('offline');
  });
  assert.equal((await offline.status()).ready, false);
});

test('Ollama rejects incomplete, malformed, excessive and out-of-contract replies', async () => {
  for (const response of [
    {done: false, message: {content: '{}'}},
    {done: true, done_reason: 'length', message: {content: '{}'}},
    {done: true, message: {content: 'not JSON'}},
    {done: true, message: {content: '{"layout":"changed"}'}},
    {text: 'x'.repeat(97_000)},
  ]) {
    const client = createOllamaClient(async url =>
      json(url.endsWith('/api/tags') ? installed : response),
    );
    await assert.rejects(client.generate({}, 'Учебный магазин'));
  }
});

test('Ollama generation can be cancelled; overlapping jobs are refused', async () => {
  let started;
  const ready = new Promise(resolve => {
    started = resolve;
  });
  const client = createOllamaClient(async (url, {signal}) => {
    if (url.endsWith('/api/tags')) return json(installed);
    started();
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      });
    });
  });
  const job = client.generate({}, 'Учебный магазин');
  await ready;
  await assert.rejects(client.generate({}, 'Другой магазин'), /уже идёт/);
  client.cancel();
  await assert.rejects(job, /отменена/);
});

test('Model download is explicit, fixed to Qwen and checks completion', async () => {
  const requests = [];
  const client = createOllamaClient(async (url, options) => {
    requests.push([url, options]);
    return json(url.endsWith('/api/tags') ? installed : {status: 'success'});
  });
  assert.equal(requests.length, 0);
  assert.equal((await client.download()).ready, true);
  assert.equal(requests[0][0], 'http://127.0.0.1:11434/api/pull');
  assert.deepEqual(JSON.parse(requests[0][1].body), {
    model: AI_MODEL,
    stream: false,
  });
  const broken = createOllamaClient(async () => json({status: 'not finished'}));
  await assert.rejects(broken.download(), /не подтвердила/);
});
